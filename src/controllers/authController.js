const AuthService = require('../services/authService');

class AuthController {
    // API: Đăng ký tài khoản (POST /api/auth/register)
    static async register(req, res) {
        try {
            const { email, password, fullName } = req.body;

            // Validate dữ liệu đầu vào
            if (!email || !password || !fullName) {
                return res.status(400).json({ error: 'Vui lòng nhập đầy đủ email, mật khẩu và họ tên!' });
            }

            const trimmedEmail = email.trim();
            const trimmedName = fullName.trim();

            // 1. Kiểm tra Email
            const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
            if (!emailRegex.test(trimmedEmail)) {
                return res.status(400).json({ error: 'Địa chỉ email không hợp lệ (ví dụ: vi-du@email.com)!' });
            }
            if (trimmedEmail.length > 255) {
                return res.status(400).json({ error: 'Email không được dài quá 255 ký tự!' });
            }

            // 2. Kiểm tra Họ và tên
            if (trimmedName.length < 2 || trimmedName.length > 100) {
                return res.status(400).json({ error: 'Họ và tên phải dài từ 2 đến 100 ký tự!' });
            }
            const nameSpecialCharRegex = /[0-9`~!@#$%^&*()_+={}\[\]|\\:;"'<>,.?\/]/;
            if (nameSpecialCharRegex.test(trimmedName)) {
                return res.status(400).json({ error: 'Họ và tên không được chứa số hoặc ký tự đặc biệt!' });
            }

            // 3. Kiểm tra Mật khẩu
            if (password.length < 6) {
                return res.status(400).json({ error: 'Mật khẩu phải chứa ít nhất 6 ký tự!' });
            }
            const hasLetter = /[a-zA-Z]/.test(password);
            const hasNumber = /[0-9]/.test(password);
            if (!hasLetter || !hasNumber) {
                return res.status(400).json({ error: 'Mật khẩu phải bao gồm cả chữ cái và chữ số!' });
            }

            // Gọi xuống Service xử lý với dữ liệu đã chuẩn hóa
            const result = await AuthService.register({ 
                email: trimmedEmail, 
                password, 
                fullName: trimmedName 
            });

            res.status(201).json({
                message: 'Đăng ký tài khoản thành công!',
                user: result.user,
                token: result.token
            });
        } catch (err) {
            res.status(400).json({ error: err.message }); // Bắt lỗi (VD: Trùng email)
        }
    }

    // API: Đăng nhập (POST /api/auth/login)
    static async login(req, res) {
        try {
            const { email, password } = req.body;

            if (!email || !password) {
                return res.status(400).json({ error: 'Vui lòng nhập email và mật khẩu!' });
            }

            const result = await AuthService.login({ email, password });

            res.status(200).json({
                message: 'Đăng nhập thành công!',
                user: result.user,
                token: result.token
            });
        } catch (err) {
            res.status(401).json({ error: err.message });
        }
    }

    // API: Xem thông tin cá nhân (GET /api/auth/profile)
    static async getProfile(req, res) {
        try {
            // Nhờ middleware verifyToken, ta đã có req.user
            res.status(200).json({
                message: 'Lấy thông tin thành công',
                user: req.user
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }

    // API: Yêu cầu khôi phục mật khẩu (POST /api/auth/forgot-password)
    static async forgotPassword(req, res) {
        try {
            const { email } = req.body;
            if (!email) {
                return res.status(400).json({ error: 'Vui lòng cung cấp email!' });
            }

            await AuthService.forgotPassword({ email: email.trim() });
            
            res.status(200).json({
                message: 'Hướng dẫn khôi phục mật khẩu đã được gửi tới email của bạn!'
            });
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    }

    // API: Đặt lại mật khẩu mới (POST /api/auth/reset-password)
    static async resetPassword(req, res) {
        try {
            const { token, newPassword } = req.body;
            if (!token || !newPassword) {
                return res.status(400).json({ error: 'Mã xác thực hoặc mật khẩu mới không hợp lệ!' });
            }

            // Kiểm tra tính hợp lệ của mật khẩu mới (theo quy chuẩn đăng ký)
            if (newPassword.length < 6) {
                return res.status(400).json({ error: 'Mật khẩu mới phải chứa ít nhất 6 ký tự!' });
            }
            const hasLetter = /[a-zA-Z]/.test(newPassword);
            const hasNumber = /[0-9]/.test(newPassword);
            if (!hasLetter || !hasNumber) {
                return res.status(400).json({ error: 'Mật khẩu mới phải bao gồm cả chữ cái và chữ số!' });
            }

            await AuthService.resetPassword({ token, newPassword });

            res.status(200).json({
                message: 'Đặt lại mật khẩu thành công! Vui lòng đăng nhập bằng mật khẩu mới.'
            });
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    }
}

module.exports = AuthController;