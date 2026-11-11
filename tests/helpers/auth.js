// Tiện ích test cho đăng nhập access/refresh token (spec 002).
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/config/app');

const ORIGIN = 'http://localhost:5173';

// Lấy giá trị cookie sdl_rt từ phản hồi (null nếu không có hoặc bị xoá)
function getRefreshCookie(res) {
    const cookies = res.headers['set-cookie'] || [];
    const raw = cookies.find(c => c.startsWith('sdl_rt='));
    if (!raw) return null;
    const value = raw.split(';')[0].slice('sdl_rt='.length);
    return value ? decodeURIComponent(value) : '';
}

function getRefreshCookieHeader(res) {
    const cookies = res.headers['set-cookie'] || [];
    return cookies.find(c => c.startsWith('sdl_rt=')) || null;
}

async function loginViaApi(user) {
    const res = await request(app)
        .post('/api/auth/login')
        .set('Origin', ORIGIN)
        .send({ email: user.email, password: user.password });
    return { res, accessToken: res.body.token, refreshToken: getRefreshCookie(res) };
}

function refresh(refreshToken, origin = ORIGIN) {
    const req = request(app).post('/api/auth/refresh');
    if (origin) req.set('Origin', origin);
    if (refreshToken) req.set('Cookie', `sdl_rt=${encodeURIComponent(refreshToken)}`);
    return req.send();
}

function bearer(accessToken) {
    return { Authorization: `Bearer ${accessToken}` };
}

// Ký access token tuỳ biến để mô phỏng token hết hạn / kiểu cũ
function signTestToken(payload, options) {
    return jwt.sign(payload, process.env.JWT_SECRET, options);
}

module.exports = { ORIGIN, getRefreshCookie, getRefreshCookieHeader, loginViaApi, refresh, bearer, signTestToken };
