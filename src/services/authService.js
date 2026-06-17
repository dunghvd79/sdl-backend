// ==========================================
// FILE 2: src/services/authService.js
// Nhiệm vụ: Chứa Logic nghiệp vụ (Kiểm tra trùng email, Tạo JWT...)
// ==========================================
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const EmailService = require('./emailService');

class AuthService {
    // Logic Đăng ký
    static async register({ email, password, fullName }) {
        // 1. Kiểm tra xem email đã tồn tại chưa
        const existingUser = await User.findByEmail(email);
        if (existingUser) {
            throw new Error('Email này đã được đăng ký!');
        }

        // 2. Tạo user mới
        const user = await User.create({ email, password, fullName });

        // 3. Tạo Token và Session ID
        const sessionId = crypto.randomUUID();
        await User.updateSessionId(user.id, sessionId);
        const token = this.generateToken(user, sessionId);

        return { user, token };
    }

    // Logic Đăng nhập
    static async login({ email, password }) {
        // 1. Tìm user bằng email
        const user = await User.findByEmail(email);
        if (!user) {
            throw new Error('Email hoặc mật khẩu không chính xác!');
        }

        if (user.is_active === false) {
            throw new Error('Tài khoản của bạn đã bị khóa bởi quản trị viên!');
        }

        // 2. Kiểm tra mật khẩu
        const isPasswordValid = await User.verifyPassword(password, user.password_hash);
        if (!isPasswordValid) {
            throw new Error('Email hoặc mật khẩu không chính xác!');
        }

        // 3. Đăng nhập thành công -> Tạo token với Session ID mới
        const sessionId = crypto.randomUUID();
        await User.updateSessionId(user.id, sessionId);
        const token = this.generateToken(user, sessionId);

        return {
            user: {
                id: user.id,
                email: user.email,
                fullName: user.full_name,
                role: user.role
            },
            token
        };
    }

    // Hàm hỗ trợ: Sinh mã JWT
    static generateToken(user, sessionId) {
        return jwt.sign(
            {
                id: user.id,
                email: user.email,
                role: user.role,
                sessionId: sessionId
            },
            process.env.JWT_SECRET, // Lấy Secret Key từ file .env
            { expiresIn: process.env.JWT_EXPIRY }
        );
    }

    // Hàm hỗ trợ: Giải mã JWT
    static verifyToken(token) {
        try {
            return jwt.verify(token, process.env.JWT_SECRET);
        } catch (err) {
            return null;
        }
    }

    // Logic Quên mật khẩu - Tạo token gửi mail
    static async forgotPassword({ email }) {
        // 1. Tìm user theo email
        const user = await User.findByEmail(email);
        if (!user) {
            throw new Error('Email này không tồn tại trong hệ thống!');
        }

        // 2. Tạo token ngẫu nhiên bảo mật (32 bytes = 64 ký tự hex)
        const token = crypto.randomBytes(32).toString('hex');
        
        // 3. Thiết lập thời hạn 15 phút
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

        // 4. Lưu vào DB
        await User.updateResetToken(user.id, token, expiresAt);

        // 5. Gửi mail khôi phục
        await EmailService.sendResetPasswordEmail(user.email, token, user.full_name);

        return { email: user.email };
    }

    // Logic Đặt lại mật khẩu mới
    static async resetPassword({ token, newPassword }) {
        // 1. Kiểm tra token và hạn dùng
        const user = await User.findByResetToken(token);
        if (!user) {
            throw new Error('Liên kết khôi phục mật khẩu không hợp lệ hoặc đã hết hạn!');
        }

        // 2. Cập nhật mật khẩu mới và xóa token
        const updatedUser = await User.updatePasswordAndClearToken(user.id, newPassword);

        return { email: updatedUser.email };
    }
}

module.exports = AuthService;