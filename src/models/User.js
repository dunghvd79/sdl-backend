// FILE 1: src/models/User.js
// Nhiệm vụ: Chỉ giao tiếp với Database (Thêm, Sửa, Xóa, Tìm kiếm)
// ==========================================
const pool = require('../config/database');
const bcrypt = require('bcryptjs');

class User {
    // Tạo user mới
    static async create({ email, password, fullName, role = 'CUSTOMER' }) {
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

    // Tìm user theo Email
    static async findByEmail(email) {
        const query = 'SELECT * FROM users WHERE email = $1';
        const result = await pool.query(query, [email]);
        return result.rows[0] || null;
    }

    // Tìm user theo ID
    static async findById(id) {
        const query = 'SELECT id, email, full_name, phone, address, role, is_active, session_id, created_at FROM users WHERE id = $1';
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
}

module.exports = User;