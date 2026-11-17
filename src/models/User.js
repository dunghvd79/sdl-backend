// FILE 1: src/models/User.js
// Nhiệm vụ: Chỉ giao tiếp với Database (Thêm, Sửa, Xóa, Tìm kiếm)
// ==========================================
const pool = require('../config/database');
const bcrypt = require('bcryptjs');

// Email không phân biệt hoa thường (B55): lưu chữ thường, tìm bằng LOWER(email).
// DB có unique index trên LOWER(email) (migration trong config/database.js).
function normalizeEmail(email) {
    return String(email).trim().toLowerCase();
}

class User {
    // Tạo user mới
    static async create({ email, password, fullName, role = 'CUSTOMER' }) {
        email = normalizeEmail(email);
        // Băm (Hash) mật khẩu với độ khó là 10
        const hashedPassword = await bcrypt.hash(password, 10);

        const query = `
      INSERT INTO users (email, password_hash, full_name, role)
      VALUES ($1, $2, $3, $4)
      RETURNING id, email, full_name, phone, address, role, created_at
    `;

        const result = await pool.query(query, [email, hashedPassword, fullName, role]);
        return result.rows[0];
    }

    // Tìm user theo Email, không phân biệt hoa thường. Tài khoản cũ có thể còn lưu email viết hoa:
    // LOWER hai vế vẫn tìm thấy. Nếu dữ liệu cũ lỡ có hai bản chỉ khác kiểu chữ (unique index chưa tạo được),
    // ưu tiên bản khớp chính xác rồi bản cũ nhất để kết quả luôn cố định.
    static async findByEmail(email) {
        const query = `
            SELECT * FROM users
            WHERE LOWER(email) = $1
            ORDER BY (email = $2) DESC, id
            LIMIT 1
        `;
        const result = await pool.query(query, [normalizeEmail(email), String(email).trim()]);
        return result.rows[0] || null;
    }

    // Spec 005: tìm theo mã định danh Google (sub) — cách nhận diện chính của người dùng Google
    static async findByGoogleSub(sub, client = pool) {
        const result = await client.query('SELECT * FROM users WHERE google_sub = $1', [sub]);
        return result.rows[0] || null;
    }

    // Spec 005: tạo tài khoản từ Google — luôn CUSTOMER, không mật khẩu, email đã được Google xác minh.
    // Trùng google_sub / LOWER(email) (hai request đồng thời) → Postgres ném 23505, bên gọi tra lại.
    static async createFromGoogle({ sub, email, fullName }, client = pool) {
        const result = await client.query(
            `INSERT INTO users (email, password_hash, full_name, role, google_sub, email_verified_at)
             VALUES ($1, NULL, $2, 'CUSTOMER', $3, NOW())
             RETURNING id, email, full_name, role, is_active, google_sub`,
            [normalizeEmail(email), fullName, sub]
        );
        return result.rows[0];
    }

    // Spec 005: liên kết Google vào tài khoản có sẵn cùng email (chạy trong transaction của bên gọi).
    // Email chưa từng được xác minh (B56) nên người đặt mật khẩu cũ có thể không phải chủ email → huỷ mật khẩu
    // và mã đặt lại; chỉ người chứng minh sở hữu email qua Google còn quyền. Điều kiện `google_sub IS NULL`:
    // request khác vừa liên kết trước thì trả null để bên gọi đọc lại.
    static async linkGoogle(client, userId, sub) {
        const result = await client.query(
            `UPDATE users
             SET google_sub = $2, email_verified_at = NOW(), password_hash = NULL,
                 reset_password_token = NULL, reset_password_expires = NULL
             WHERE id = $1 AND google_sub IS NULL
             RETURNING id, email, full_name, role, is_active, google_sub`,
            [userId, sub]
        );
        return result.rows[0] || null;
    }

    // Tìm user theo ID
    static async findById(id) {
        // has_password (spec 005): giao diện ẩn form đổi mật khẩu cho tài khoản chỉ dùng Google; không trả hash
        const query = `SELECT id, email, full_name, phone, address, role, is_active, session_id, created_at,
                              (password_hash IS NOT NULL) AS has_password
                       FROM users WHERE id = $1`;
        const result = await pool.query(query, [id]);
        return result.rows[0] || null;
    }

    // Cập nhật session_id của user
    static async updateSessionId(userId, sessionId) {
        const query = 'UPDATE users SET session_id = $1 WHERE id = $2 RETURNING id, session_id';
        const result = await pool.query(query, [sessionId, userId]);
        return result.rows[0];
    }

    // Cập nhật thông tin cá nhân mở rộng (Họ tên, SĐT, Địa chỉ)
    static async updateProfileAndAddress(userId, { fullName, phone, address }) {
        const query = `
            UPDATE users 
            SET full_name = $1, phone = $2, address = $3
            WHERE id = $4
            RETURNING id, email, full_name, phone, address, role, created_at
        `;
        const result = await pool.query(query, [fullName, phone, address, userId]);
        return result.rows[0];
    }

    // Cập nhật trạng thái hoạt động của tài khoản (khóa/mở khóa)
    static async toggleStatus(userId, isActive) {
        const query = `
            UPDATE users
            SET is_active = $1
            WHERE id = $2
            RETURNING id, email, full_name, role, is_active
        `;
        const result = await pool.query(query, [isActive, userId]);
        return result.rows[0];
    }

    // So sánh mật khẩu người dùng nhập với mật khẩu đã hash trong DB
    static async verifyPassword(plainPassword, hashedPassword) {
        return bcrypt.compare(plainPassword, hashedPassword);
    }

    // Cập nhật token khôi phục mật khẩu và thời hạn
    static async updateResetToken(userId, token, expiresAt) {
        const query = `
            UPDATE users 
            SET reset_password_token = $1, reset_password_expires = $2
            WHERE id = $3
            RETURNING id, email, reset_password_token, reset_password_expires
        `;
        const result = await pool.query(query, [token, expiresAt, userId]);
        return result.rows[0];
    }

    // Tìm user bằng reset token đang hoạt động (chưa hết hạn)
    static async findByResetToken(token) {
        const query = `
            SELECT * FROM users 
            WHERE reset_password_token = $1 AND reset_password_expires > NOW()
        `;
        const result = await pool.query(query, [token]);
        return result.rows[0] || null;
    }

    // Cập nhật mật khẩu mới và xóa bỏ token/hạn sử dụng
    // `executor`: client của transaction bên gọi (spec 002: đổi mật khẩu + thu hồi phiên cùng giao dịch)
    static async updatePasswordAndClearToken(userId, plainPassword, executor = pool) {
        // Băm mật khẩu mới
        const hashedPassword = await bcrypt.hash(plainPassword, 10);
        const query = `
            UPDATE users 
            SET password_hash = $1, reset_password_token = NULL, reset_password_expires = NULL
            WHERE id = $2
            RETURNING id, email, full_name, role
        `;
        const result = await executor.query(query, [hashedPassword, userId]);
        return result.rows[0];
    }
}

module.exports = User;