// Giới hạn tần suất theo chức năng (spec 004). Bộ đếm trong bộ nhớ tiến trình (1 instance trên Render;
// chuyển sang Redis khi chạy nhiều instance — backlog B18).
const crypto = require('crypto');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { verifyAccessToken, readRefreshCookie } = require('../utils/authTokens');

const MINUTE = 60 * 1000;

// ---------- Khoá đếm ----------

const ipKey = (req) => ipKeyGenerator(req.ip);

function emailOf(req) {
    const email = req.body && req.body.email;
    return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

// Tài khoản nếu thẻ truy cập hợp lệ (không tra DB), ngược lại theo IP (research R2)
function userOrIpKey(req) {
    const header = req.headers.authorization || '';
    if (header.startsWith('Bearer ')) {
        const { payload } = verifyAccessToken(header.slice(7));
        if (payload && payload.id) return `u:${payload.id}`;
    }
    return `ip:${ipKey(req)}`;
}

// Dùng SAU verifyToken: luôn có req.user
const userKey = (req) => (req.user ? `u:${req.user.id}` : `ip:${ipKey(req)}`);

// Gia hạn phiên: theo phiên (băm cookie, không giữ token gốc), không có cookie thì theo IP (R4)
function sessionKey(req) {
    const token = readRefreshCookie(req);
    return token
        ? `s:${crypto.createHash('sha256').update(token).digest('hex')}`
        : `ip:${ipKey(req)}`;
}

// ---------- Phản hồi 429 (R5) ----------

function handler(req, res, next, options) {
    const resetTime = req.rateLimit && req.rateLimit.resetTime;
    const minutes = resetTime ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / MINUTE)) : Math.ceil(options.windowMs / MINUTE);
    res.status(options.statusCode).json({ error: `${options.message} Vui lòng thử lại sau ${minutes} phút.` });
}

function limiter({ windowMs, limit, keyGenerator, message, skipSuccessfulRequests = false }) {
    return rateLimit({
        windowMs,
        limit,
        keyGenerator,
        skipSuccessfulRequests,
        message,
        handler,
        standardHeaders: 'draft-8',
        legacyHeaders: false
    });
}

// ---------- Các limiter ----------

// FR-005: mọi API — theo tài khoản khi đã đăng nhập, ngược lại theo IP
const apiLimiter = limiter({
    windowMs: 15 * MINUTE,
    limit: Number(process.env.RATE_LIMIT_API_MAX) || 1000,
    keyGenerator: userOrIpKey,
    message: 'Bạn đã gửi quá nhiều yêu cầu.'
});

// FR-001: chỉ đếm lần đăng nhập SAI — theo IP+email, và theo IP (dò nhiều email)
const loginPerAccount = limiter({
    windowMs: 15 * MINUTE,
    limit: 5,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => `${ipKey(req)}|${emailOf(req)}`,
    message: 'Bạn đã nhập sai quá nhiều lần cho tài khoản này.'
});
const loginPerIp = limiter({
    windowMs: 15 * MINUTE,
    limit: 20,
    skipSuccessfulRequests: true,
    keyGenerator: ipKey,
    message: 'Có quá nhiều lần đăng nhập sai từ mạng của bạn.'
});

// FR-002: quên mật khẩu — theo email (chống spam hộp thư) và theo IP
const forgotPerEmail = limiter({
    windowMs: 60 * MINUTE,
    limit: 3,
    keyGenerator: (req) => `email:${emailOf(req)}`,
    message: 'Bạn đã yêu cầu khôi phục mật khẩu cho email này quá nhiều lần.'
});
const forgotPerIp = limiter({
    windowMs: 60 * MINUTE,
    limit: 10,
    keyGenerator: ipKey,
    message: 'Bạn đã yêu cầu khôi phục mật khẩu quá nhiều lần.'
});

// FR-003
const registerLimiter = limiter({
    windowMs: 60 * MINUTE,
    limit: 5,
    keyGenerator: ipKey,
    message: 'Bạn đã đăng ký quá nhiều tài khoản.'
});
const resetPasswordLimiter = limiter({
    windowMs: 15 * MINUTE,
    limit: 10,
    keyGenerator: ipKey,
    message: 'Bạn đã thử đặt lại mật khẩu quá nhiều lần.'
});

// FR-004
const refreshLimiter = limiter({
    windowMs: 15 * MINUTE,
    limit: 10,
    keyGenerator: sessionKey,
    message: 'Phiên đăng nhập được gia hạn quá nhiều lần.'
});

// FR-006: đặt hàng, tạo liên kết thanh toán (dùng sau verifyToken)
const orderLimiter = limiter({
    windowMs: MINUTE,
    limit: 10,
    keyGenerator: userKey,
    message: 'Bạn đã đặt hàng / tạo thanh toán quá nhiều lần.'
});

// FR-007: tải ảnh, đánh giá, thao tác ghi của quản trị (dùng sau verifyToken)
const writeLimiter = limiter({
    windowMs: MINUTE,
    limit: 30,
    keyGenerator: userKey,
    message: 'Bạn thao tác quá nhanh.'
});

module.exports = {
    apiLimiter,
    loginLimiters: [loginPerIp, loginPerAccount],
    forgotPasswordLimiters: [forgotPerIp, forgotPerEmail],
    registerLimiter,
    resetPasswordLimiter,
    refreshLimiter,
    orderLimiter,
    writeLimiter
};
