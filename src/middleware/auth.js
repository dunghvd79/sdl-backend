const User = require('../models/User');
const AuthService = require('../services/authService');

// Middleware 1: Kiểm tra Token hợp lệ
const verifyToken = async (req, res, next) => {
    try {
        // Client sẽ gửi token trên Header với định dạng: "Bearer <token>"
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Không tìm thấy Token xác thực!' });
        }

        // Cắt lấy phần token phía sau chữ Bearer
        const token = authHeader.split(' ')[1];

        // Nhờ Service giải mã token
        const decoded = AuthService.verifyToken(token);
        if (!decoded) {
            return res.status(401).json({ error: 'Token không hợp lệ hoặc đã hết hạn!' });
        }

        // Kiểm tra xem user có bị khóa hoạt động không
        const dbUser = await User.findById(decoded.id);
        if (!dbUser) {
            return res.status(401).json({ error: 'Tài khoản không tồn tại!' });
        }

        if (dbUser.is_active === false) {
            return res.status(403).json({ error: 'Tài khoản của bạn đã bị khóa bởi quản trị viên!' });
        }

        // Gắn thông tin user giải mã được vào request để các hàm sau sử dụng
        req.user = decoded;
        next(); // Cho phép đi tiếp
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Middleware 2: Kiểm tra Quyền (Role)
const requireRole = (roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Chưa xác thực người dùng!' });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Bạn không có quyền truy cập tính năng này!' });
        }

        next();
    };
};

module.exports = {
    verifyToken,
    requireRole
};