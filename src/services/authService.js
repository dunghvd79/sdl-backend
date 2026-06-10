// ==========================================
// FILE 2: src/services/authService.js
// Nhiệm vụ: Chứa Logic nghiệp vụ (Kiểm tra trùng email, Tạo JWT...)
// ==========================================
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');

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
}

module.exports = AuthService;