const { verifyAccessToken, isAllowedOrigin } = require('../utils/authTokens');

const TOKEN_ERRORS = {
    TOKEN_MISSING: 'Không tìm thấy Token xác thực!',
    TOKEN_EXPIRED: 'Phiên đăng nhập đã hết hạn.',
    TOKEN_INVALID: 'Token không hợp lệ hoặc đã hết hạn!'
};

function readBearer(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    return authHeader.split(' ')[1] || null;
}

// Middleware 1: Kiểm tra access token (spec 002): KHÔNG tra DB ở mỗi request.
// Khoá tài khoản / đổi quyền có hiệu lực khi access token hết hạn (tối đa 15 phút) — đã thống nhất.
// Trả `code` để giao diện chỉ tự gia hạn khi TOKEN_EXPIRED.
const verifyToken = (req, res, next) => {
    // Chống trình duyệt lưu bộ nhớ đệm (caching) các dữ liệu nhạy cảm của cá nhân
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');

    const token = readBearer(req);
    if (!token) {
        return res.status(401).json({ error: TOKEN_ERRORS.TOKEN_MISSING, code: 'TOKEN_MISSING' });
    }

    const { payload, error } = verifyAccessToken(token);
    if (error) {
        return res.status(401).json({ error: TOKEN_ERRORS[error], code: error });
    }

    req.user = { id: payload.id, email: payload.email, role: payload.role };
    next();
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

// Middleware 1.5: Giải mã Token tùy chọn (trang công khai nhưng muốn biết user nếu đã login)
const optionalVerifyToken = (req, res, next) => {
    const token = readBearer(req);
    if (token) {
        const { payload } = verifyAccessToken(token);
        if (payload) {
            req.user = { id: payload.id, email: payload.email, role: payload.role };
        }
    }
    next();
};

// Middleware 3: Endpoint dùng cookie phiên chỉ nhận yêu cầu từ giao diện được phép (chống CSRF, FR-013)
const requireAllowedOrigin = (req, res, next) => {
    if (!isAllowedOrigin(req.headers.origin)) {
        return res.status(403).json({ error: 'Nguồn yêu cầu không được phép.' });
    }
    next();
};

module.exports = {
    verifyToken,
    optionalVerifyToken,
    requireRole,
    requireAllowedOrigin
};
