// Spec 002 — US3 (phát hiện dùng lại refresh token) và US5 (chỉ nguồn giao diện được phép).
const request = require('supertest');
const app = require('../src/config/app');
const pool = require('../src/config/database');
const { hashToken } = require('../src/utils/authTokens');
const { resetDb, createUser, closeAll } = require('./helpers/db');
const { ORIGIN, getRefreshCookie, loginViaApi, refresh } = require('./helpers/auth');

let user;

afterAll(async () => {
    await closeAll();
});

beforeEach(async () => {
    await resetDb();
    user = await createUser();
});

describe('US3: phát hiện dùng lại refresh token', () => {
    test('dùng lại token vừa bị thay trong 30 giây → 200, không đổi cookie', async () => {
        const { refreshToken } = await loginViaApi(user);
        const first = await refresh(refreshToken);

        const again = await refresh(refreshToken);

        expect(first.status).toBe(200);
        expect(again.status).toBe(200);
        expect(typeof again.body.token).toBe('string');
        expect(getRefreshCookie(again)).toBeNull();
    });

    test('dùng lại token đã bị thay quá 30 giây → 401 REFRESH_REUSED và huỷ cả chuỗi phiên', async () => {
        const { refreshToken } = await loginViaApi(user);
        const first = await refresh(refreshToken);
        const newRefresh = getRefreshCookie(first);
        await pool.query(
            "UPDATE refresh_tokens SET revoked_at = NOW() - INTERVAL '31 seconds' WHERE token_hash = $1",
            [hashToken(refreshToken)]
        );

        const reused = await refresh(refreshToken);
        const withNew = await refresh(newRefresh);

        expect(reused.status).toBe(401);
        expect(reused.body.code).toBe('REFRESH_REUSED');
        expect(withNew.status).toBe(401);
    });

    test('hai yêu cầu gia hạn đồng thời cùng cookie đều thành công', async () => {
        const { refreshToken } = await loginViaApi(user);

        const [a, b] = await Promise.all([refresh(refreshToken), refresh(refreshToken)]);

        expect(a.status).toBe(200);
        expect(b.status).toBe(200);
    });

    test('đăng xuất xong thì token cũ trong 30 giây cũng không gia hạn được', async () => {
        const { refreshToken } = await loginViaApi(user);
        const first = await refresh(refreshToken);
        await request(app)
            .post('/api/auth/logout')
            .set('Origin', ORIGIN)
            .set('Cookie', `sdl_rt=${getRefreshCookie(first)}`)
            .send();

        const again = await refresh(refreshToken);

        expect(again.status).toBe(401);
    });

    test('phiên quá hạn 7 ngày → 401 REFRESH_INVALID', async () => {
        const { refreshToken } = await loginViaApi(user);
        await pool.query("UPDATE refresh_tokens SET expires_at = NOW() - INTERVAL '1 minute'");

        const res = await refresh(refreshToken);

        expect(res.status).toBe(401);
        expect(res.body.code).toBe('REFRESH_INVALID');
    });
});

describe('US5: chỉ giao diện được phép dùng cookie phiên', () => {
    test('gia hạn từ nguồn lạ → 403', async () => {
        const { refreshToken } = await loginViaApi(user);

        const res = await refresh(refreshToken, 'https://evil.example');

        expect(res.status).toBe(403);
    });

    test('gia hạn không có Origin → 403', async () => {
        const { refreshToken } = await loginViaApi(user);

        const res = await refresh(refreshToken, null);

        expect(res.status).toBe(403);
    });

    test('đăng xuất từ nguồn lạ → 403 và phiên vẫn còn', async () => {
        const { refreshToken } = await loginViaApi(user);

        const out = await request(app)
            .post('/api/auth/logout')
            .set('Origin', 'https://evil.example')
            .set('Cookie', `sdl_rt=${refreshToken}`)
            .send();
        const still = await refresh(refreshToken);

        expect(out.status).toBe(403);
        expect(still.status).toBe(200);
    });

    test('CORS cho phép giao diện chính thức gửi kèm cookie, không cho nguồn lạ', async () => {
        const allowed = await request(app)
            .options('/api/auth/refresh')
            .set('Origin', 'https://pigeon-bookstore.pages.dev')
            .set('Access-Control-Request-Method', 'POST');
        const blocked = await request(app)
            .options('/api/auth/refresh')
            .set('Origin', 'https://evil.example')
            .set('Access-Control-Request-Method', 'POST');

        expect(allowed.headers['access-control-allow-origin']).toBe('https://pigeon-bookstore.pages.dev');
        expect(allowed.headers['access-control-allow-credentials']).toBe('true');
        expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
    });
});
