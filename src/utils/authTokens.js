// Tiện ích token cho đăng nhập access/refresh (spec 002, research R1–R6, R9).
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL || '15m';
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const REFRESH_COOKIE_NAME = 'sdl_rt';
const REFRESH_COOKIE_PATH = '/api/auth';

// ---------- Access token (JWT, không lưu ở máy chủ) ----------

function signAccessToken(user) {
    return jwt.sign(
        { id: user.id, email: user.email, role: user.role, type: 'access' },
        process.env.JWT_SECRET,
        { algorithm: 'HS256', expiresIn: ACCESS_TOKEN_TTL }
    );
}

// Trả { payload } nếu hợp lệ, { error: 'TOKEN_EXPIRED' | 'TOKEN_INVALID' } nếu không.
function verifyAccessToken(token) {
    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
        if (payload.type !== 'access') return { error: 'TOKEN_INVALID' };
        return { payload };
    } catch (err) {
        return { error: err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID' };
    }
}

// ---------- Refresh token (chuỗi ngẫu nhiên, chỉ lưu băm) ----------

function generateRefreshToken() {
    return crypto.randomBytes(32).toString('base64url');
}

function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function refreshCookieOptions() {
    const isProduction = process.env.NODE_ENV === 'production';
    return {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'lax',
        path: REFRESH_COOKIE_PATH
    };
}

function setRefreshCookie(res, token) {
    res.cookie(REFRESH_COOKIE_NAME, token, { ...refreshCookieOptions(), maxAge: REFRESH_TOKEN_TTL_MS });
}

function clearRefreshCookie(res) {
    res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions());
}

function readRefreshCookie(req) {
    const header = req.headers.cookie;
    if (!header) return null;
    for (const part of header.split(';')) {
        const index = part.indexOf('=');
        if (index === -1) continue;
        if (part.slice(0, index).trim() === REFRESH_COOKIE_NAME) {
            try {
                return decodeURIComponent(part.slice(index + 1).trim()) || null;
            } catch {
                return null; // cookie sai định dạng (vd "%E0") → coi như không có phiên
            }
        }
    }
    return null;
}

// ---------- Nguồn được phép (CORS + kiểm tra Origin cho endpoint dùng cookie) ----------

function getAllowedOrigins() {
    const origins = new Set(['https://pigeon-bookstore.pages.dev', 'http://localhost:5173']);
    if (process.env.FRONTEND_URL) origins.add(process.env.FRONTEND_URL.replace(/\/+$/, ''));
    for (const origin of (process.env.CORS_ORIGINS || '').split(',')) {
        if (origin.trim()) origins.add(origin.trim().replace(/\/+$/, ''));
    }
    return origins;
}

function isAllowedOrigin(origin) {
    return Boolean(origin) && getAllowedOrigins().has(origin);
}

// ---------- Chính sách mật khẩu mới ----------

const PASSWORD_POLICY_MESSAGE = 'Mật khẩu phải có ít nhất 8 ký tự, gồm cả chữ cái và chữ số!';

// Trả về thông báo lỗi tiếng Việt, hoặc null nếu hợp lệ.
function validateNewPassword(password) {
    if (typeof password !== 'string' || password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
        return PASSWORD_POLICY_MESSAGE;
    }
    return null;
}

module.exports = {
    REFRESH_TOKEN_TTL_MS,
    REFRESH_COOKIE_NAME,
    PASSWORD_POLICY_MESSAGE,
    signAccessToken,
    verifyAccessToken,
    generateRefreshToken,
    hashToken,
    setRefreshCookie,
    clearRefreshCookie,
    readRefreshCookie,
    getAllowedOrigins,
    isAllowedOrigin,
    validateNewPassword
};
