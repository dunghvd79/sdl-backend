const AuthService = require('../services/authService');

class AuthController {
    // API: Đăng ký tài khoản (POST /api/auth/register)
    static async register(req, res) {
        try {
            const { email, password, fullName } = req.body;

            // Validate dữ liệu đầu vào cơ bản
            if (!email || !password || !fullName) {
                return res.status(400).json({ error: 'Vui lòng nhập đầy đủ email, password và họ tên!' });
            }

            // Gọi xuống Service xử lý
            const result = await AuthService.register({ email, password, fullName });

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
}

module.exports = AuthController;