// Spec 002 — US1 (nhiều thiết bị, tự gia hạn) và US2 (đăng xuất, thu hồi).
const request = require('supertest');
const app = require('../src/config/app');
const pool = require('../src/config/database');
const { resetDb, createUser, closeAll } = require('./helpers/db');
const { ORIGIN, getRefreshCookie, getRefreshCookieHeader, loginViaApi, refresh, bearer, signTestToken } = require('./helpers/auth');

let user;

afterAll(async () => {
    await closeAll();
});

beforeEach(async () => {
    await resetDb();
    user = await createUser();
});

describe('US1: cấp và gia hạn phiên', () => {
    test('đăng nhập trả access token và cookie phiên httpOnly cho /api/auth', async () => {
        const { res, accessToken, refreshToken } = await loginViaApi(user);

        expect(res.status).toBe(200);
        expect(typeof accessToken).toBe('string');
        expect(refreshToken).toBeTruthy();
        const cookie = getRefreshCookieHeader(res);
        expect(cookie).toMatch(/HttpOnly/i);
        expect(cookie).toMatch(/Path=\/api\/auth/);
        const { rows } = await pool.query('SELECT token_hash FROM refresh_tokens WHERE user_id = $1', [user.id]);
        expect(rows).toHaveLength(1);
        expect(rows[0].token_hash).not.toBe(refreshToken);
    });

    test('gia hạn cấp access token mới và thay phiên cũ bằng phiên mới', async () => {
        const { refreshToken } = await loginViaApi(user);

        const res = await refresh(refreshToken);

        expect(res.status).toBe(200);
        expect(typeof res.body.token).toBe('string');
        expect(res.body.user).toMatchObject({ id: user.id, email: user.email, role: 'CUSTOMER' });
        const newRefresh = getRefreshCookie(res);
        expect(newRefresh).toBeTruthy();
        expect(newRefresh).not.toBe(refreshToken);
        const profile = await request(app).get('/api/auth/profile').set(bearer(res.body.token));
        expect(profile.status).toBe(200);
    });

    test('đăng nhập hai thiết bị thì cả hai đều dùng được', async () => {
        const deviceA = await loginViaApi(user);
        const deviceB = await loginViaApi(user);

        const a = await request(app).get('/api/auth/profile').set(bearer(deviceA.accessToken));
        const b = await request(app).get('/api/auth/profile').set(bearer(deviceB.accessToken));
        const refreshA = await refresh(deviceA.refreshToken);

        expect(a.status).toBe(200);
        expect(b.status).toBe(200);
        expect(refreshA.status).toBe(200);
    });

    test('access token hết hạn → 401 TOKEN_EXPIRED', async () => {
        const expired = signTestToken({ id: user.id, email: user.email, role: 'CUSTOMER', type: 'access' }, { expiresIn: -10 });

        const res = await request(app).get('/api/auth/profile').set(bearer(expired));

        expect(res.status).toBe(401);
        expect(res.body.code).toBe('TOKEN_EXPIRED');
    });

    test('token giả → 401 TOKEN_INVALID; không gửi token → 401 TOKEN_MISSING', async () => {
        const fake = await request(app).get('/api/auth/profile').set(bearer('khong.phai.token'));
        const missing = await request(app).get('/api/auth/profile');

        expect(fake.status).toBe(401);
        expect(fake.body.code).toBe('TOKEN_INVALID');
        expect(missing.status).toBe(401);
        expect(missing.body.code).toBe('TOKEN_MISSING');
    });

    test('token 24 giờ kiểu cũ (không có type) không còn được chấp nhận', async () => {
        const legacy = signTestToken({ id: user.id, email: user.email, role: 'CUSTOMER', sessionId: 'x' }, { expiresIn: '24h' });

        const res = await request(app).get('/api/auth/profile').set(bearer(legacy));

        expect(res.status).toBe(401);
        expect(res.body.code).toBe('TOKEN_INVALID');
    });

    test('gia hạn không có cookie → 401 REFRESH_INVALID', async () => {
        const res = await refresh(null);

        expect(res.status).toBe(401);
        expect(res.body.code).toBe('REFRESH_INVALID');
    });
});

describe('US2: đăng xuất và thu hồi phiên', () => {
    test('đăng xuất huỷ phiên của thiết bị và xoá cookie', async () => {
        const { refreshToken } = await loginViaApi(user);

        const out = await request(app)
            .post('/api/auth/logout')
            .set('Origin', ORIGIN)
            .set('Cookie', `sdl_rt=${refreshToken}`)
            .send();
        const after = await refresh(refreshToken);

        expect(out.status).toBe(200);
        expect(getRefreshCookie(out)).toBe('');
        expect(after.status).toBe(401);
    });

    test('đăng xuất mọi nơi làm thiết bị khác không gia hạn được', async () => {
        const deviceA = await loginViaApi(user);
        const deviceB = await loginViaApi(user);

        const out = await request(app)
            .post('/api/auth/logout-all')
            .set('Origin', ORIGIN)
            .set(bearer(deviceA.accessToken))
            .send();
        const refreshB = await refresh(deviceB.refreshToken);

        expect(out.status).toBe(200);
        expect(refreshB.status).toBe(401);
        expect(refreshB.body.code).toBe('REFRESH_INVALID');
    });

    test('tài khoản bị khoá thì không gia hạn được', async () => {
        const { refreshToken } = await loginViaApi(user);
        await pool.query('UPDATE users SET is_active = false WHERE id = $1', [user.id]);

        const res = await refresh(refreshToken);

        expect(res.status).toBe(401);
        expect(res.body.code).toBe('REFRESH_INVALID');
    });
});
