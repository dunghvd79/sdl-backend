// Spec 002 — các lỗi tìm được khi code review (race thu hồi, transaction mật khẩu, cookie hỏng...).
// Race được tái hiện tất định bằng cách chặn tạm `RefreshToken.create` giữa transaction xoay vòng
// (spy vẫn gọi hàm thật, chỉ điều khiển thứ tự).
jest.mock('../src/queues/emailQueue', () => ({
    emailQueue: { close: jest.fn().mockResolvedValue() },
    queueResetPasswordEmail: jest.fn().mockResolvedValue()
}));

const request = require('supertest');
const app = require('../src/config/app');
const pool = require('../src/config/database');
const RefreshToken = require('../src/models/RefreshToken');
const AuthService = require('../src/services/authService');
const { queueResetPasswordEmail } = require('../src/queues/emailQueue');
const { resetDb, createUser, closeAll } = require('./helpers/db');
const { ORIGIN, getRefreshCookie, loginViaApi, refresh, bearer, signTestToken } = require('./helpers/auth');

let user;

afterAll(async () => {
    await closeAll();
});

beforeEach(async () => {
    await resetDb();
    jest.clearAllMocks();
    user = await createUser();
});

afterEach(() => {
    jest.restoreAllMocks();
});

async function activeTokenCount(userId) {
    const { rows } = await pool.query(
        'SELECT count(*)::int AS n FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL',
        [userId]
    );
    return rows[0].n;
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

describe('Review: thu hồi phiên không bị race với xoay vòng', () => {
    test('thu hồi mọi phiên chạy đúng lúc đang xoay vòng → không phiên nào còn sống', async () => {
        const { refreshToken } = await loginViaApi(user);

        let openGate;
        const gate = new Promise(resolve => { openGate = resolve; });
        const realCreate = RefreshToken.create.bind(RefreshToken);
        jest.spyOn(RefreshToken, 'create').mockImplementation(async (...args) => {
            await gate; // dừng giữa transaction xoay vòng, sau khi dòng cũ đã bị khoá
            return realCreate(...args);
        });

        // .then() buộc supertest gửi request ngay (nếu không, request chỉ được gửi khi bị await)
        const rotating = refresh(refreshToken).then(res => res);
        await sleep(200);
        expect(RefreshToken.create).toHaveBeenCalled(); // xoay vòng đang dừng giữa transaction
        const revoking = AuthService.logoutAll(user.id);
        await sleep(200);
        openGate();
        await Promise.all([rotating, revoking]);

        expect(await activeTokenCount(user.id)).toBe(0);
    });

    test('token bị thu hồi ngay sau khi đọc nhưng trước khi xoay → không cấp access token', async () => {
        const { refreshToken } = await loginViaApi(user);
        const realFind = RefreshToken.findByHash.bind(RefreshToken);
        jest.spyOn(RefreshToken, 'findByHash').mockImplementationOnce(async (...args) => {
            const record = await realFind(...args);
            await RefreshToken.revokeAllForUser(user.id, 'password'); // xen giữa đọc và xoay
            return record;
        });

        const res = await refresh(refreshToken);

        expect(res.status).toBe(401);
        expect(res.body.token).toBeUndefined();
    });
});

describe('Review: đặt lại mật khẩu là một giao dịch', () => {
    test('thu hồi phiên lỗi thì mật khẩu không bị đổi và mã đặt lại vẫn dùng được', async () => {
        await request(app).post('/api/auth/forgot-password').send({ email: user.email }).expect(200);
        const rawToken = queueResetPasswordEmail.mock.calls.at(-1)[1];
        jest.spyOn(RefreshToken, 'revokeAllForUser').mockRejectedValueOnce(new Error('db down'));
        jest.spyOn(console, 'error').mockImplementation(() => {});

        const failed = await request(app).post('/api/auth/reset-password').send({ token: rawToken, newPassword: 'matkhaumoi123' });
        const { rows: [row] } = await pool.query('SELECT reset_password_token FROM users WHERE id = $1', [user.id]);
        const oldLogin = await loginViaApi(user);

        expect(failed.status).toBe(500);
        expect(row.reset_password_token).not.toBeNull();
        expect(oldLogin.res.status).toBe(200);
    });
});

describe('Review: các ca biên khác', () => {
    test('cookie sai định dạng → 401 REFRESH_INVALID thay vì 500', async () => {
        const res = await request(app)
            .post('/api/auth/refresh')
            .set('Origin', ORIGIN)
            .set('Cookie', 'sdl_rt=%E0')
            .send();

        expect(res.status).toBe(401);
        expect(res.body.code).toBe('REFRESH_INVALID');
    });

    test('gia hạn cấp access token mang role mới nhất từ DB', async () => {
        const { refreshToken } = await loginViaApi(user);
        await pool.query("UPDATE users SET role = 'CURATOR' WHERE id = $1", [user.id]);

        const res = await refresh(refreshToken);
        const payload = JSON.parse(Buffer.from(res.body.token.split('.')[1], 'base64url').toString());

        expect(res.body.user.role).toBe('CURATOR');
        expect(payload.role).toBe('CURATOR');
    });

    test('token ký bằng thuật toán khác HS256 bị từ chối', async () => {
        const hs512 = signTestToken({ id: user.id, role: 'ADMIN', type: 'access' }, { algorithm: 'HS512', expiresIn: '5m' });
        const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
        const body = Buffer.from(JSON.stringify({ id: user.id, role: 'ADMIN', type: 'access' })).toString('base64url');

        const a = await request(app).get('/api/auth/profile').set(bearer(hs512));
        const b = await request(app).get('/api/auth/profile').set(bearer(`${header}.${body}.`));

        expect(a.status).toBe(401);
        expect(b.status).toBe(401);
    });

    test('đăng xuất mọi nơi không có Origin → 403', async () => {
        const { accessToken } = await loginViaApi(user);

        const res = await request(app).post('/api/auth/logout-all').set(bearer(accessToken)).send();

        expect(res.status).toBe(403);
    });

    test('đăng nhập lại trên trình duyệt đang có phiên thì phiên cũ bị huỷ', async () => {
        const first = await loginViaApi(user);

        await request(app)
            .post('/api/auth/login')
            .set('Origin', ORIGIN)
            .set('Cookie', `sdl_rt=${first.refreshToken}`)
            .send({ email: user.email, password: user.password })
            .expect(200);
        const old = await refresh(first.refreshToken);

        expect(old.status).toBe(401);
        expect(getRefreshCookie(old)).toBe('');
    });
});
