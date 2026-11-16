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

// Middleware 1.5: Giải mã Token tùy chọn (trang công khai nhưng muốn biết user nếu đã login).
// Token sai / hết hạn → coi như khách vãng lai, nhưng ghi lại lý do ở req.authError để trang công khai có
// "chế độ nhân viên" phân biệt được "khách" với "nhân viên có token vừa hết hạn" (B52).
const optionalVerifyToken = (req, res, next) => {
    const token = readBearer(req);
    if (token) {
        const { payload, error } = verifyAccessToken(token);
        if (payload) {
            req.user = { id: payload.id, email: payload.email, role: payload.role };
        } else {
            req.authError = error;
        }
    }
    next();
};

const STAFF_ROLES = ['ADMIN', 'CURATOR'];

function isStaff(user) {
    return Boolean(user) && STAFF_ROLES.includes(user.role);
}

// Trang công khai có chế độ nhân viên (xem cả bản nháp / đã ẩn) — B52.
// Quyền suy ra từ req.user.role ĐÃ XÁC THỰC, không bao giờ từ tham số client gửi (?adminMode=true).
// Trả 'staff' | 'expired' | 'none'. 'expired': có token nhưng hết hạn → nên trả 401 TOKEN_EXPIRED để giao diện
// quản trị tự gia hạn rồi gửi lại, thay vì lặng lẽ trả danh sách thiếu bản nháp.
function staffAccess(req) {
    if (isStaff(req.user)) return 'staff';
    if (req.authError === 'TOKEN_EXPIRED') return 'expired';
    return 'none';
}

function sendTokenExpired(res) {
    return res.status(401).json({ error: TOKEN_ERRORS.TOKEN_EXPIRED, code: 'TOKEN_EXPIRED' });
}

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
    requireAllowedOrigin,
    isStaff,
    staffAccess,
    sendTokenExpired
};
