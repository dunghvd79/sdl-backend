// Spec 005 — code review Critical #1: race giữa kiểm tra mật khẩu và liên kết Google.
// Kẻ đăng ký trước (biết mật khẩu) gửi đăng nhập / đổi mật khẩu đúng lúc chủ email liên kết Google:
// bcrypt chạy NGOÀI khoá → nếu cấp phiên / ghi mật khẩu mà không kiểm tra lại, kẻ đó giữ được quyền sau
// khi việc liên kết đã huỷ mật khẩu + mọi phiên. Barrier: giữ bước so mật khẩu cho tới khi liên kết commit.
const request = require('supertest');
const { OAuth2Client } = require('google-auth-library');
const app = require('../src/config/app');
const pool = require('../src/config/database');
const User = require('../src/models/User');
const { resetDb, createUser, closeAll } = require('./helpers/db');
const { ORIGIN, getRefreshCookie, loginViaApi, bearer } = require('./helpers/auth');
const { TEST_GOOGLE_CLIENT_ID, testCerts, signGoogleIdToken } = require('./helpers/google');

let certsSpy;

beforeAll(() => {
    process.env.GOOGLE_CLIENT_ID = TEST_GOOGLE_CLIENT_ID;
    certsSpy = jest.spyOn(OAuth2Client.prototype, 'getFederatedSignonCertsAsync').mockResolvedValue(testCerts());
});

afterAll(async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    certsSpy.mockRestore();
    await closeAll();
});

beforeEach(async () => {
    await resetDb();
});

afterEach(() => {
    jest.restoreAllMocks();
    certsSpy = jest.spyOn(OAuth2Client.prototype, 'getFederatedSignonCertsAsync').mockResolvedValue(testCerts());
});

// Lần so mật khẩu tiếp theo dừng lại (đã đọc hash cũ) cho tới khi gọi release()
function holdNextPasswordCheck() {
    let started;
    let release;
    const startedP = new Promise(resolve => { started = resolve; });
    const releasedP = new Promise(resolve => { release = resolve; });
    const real = User.verifyPassword.bind(User);
    jest.spyOn(User, 'verifyPassword').mockImplementationOnce(async (...args) => {
        started();
        await releasedP;
        return real(...args);
    });
    return { started: startedP, release };
}

function linkWithGoogle(email) {
    return request(app).post('/api/auth/google').set('Origin', ORIGIN)
        .send({ credential: signGoogleIdToken({ email, hd: 'test.vn' }) });
}

describe('race: kiểm tra mật khẩu ↔ liên kết Google', () => {
    it('đăng nhập mật khẩu đã qua bcrypt khi liên kết xảy ra → không được cấp phiên', async () => {
        const owner = await createUser({ email: 'race.login@test.vn', password: 'matkhau123' });
        const hold = holdNextPasswordCheck();

        const loginP = request(app).post('/api/auth/login').set('Origin', ORIGIN)
            .send({ email: 'race.login@test.vn', password: 'matkhau123' }).then(r => r);
        await hold.started;
        await linkWithGoogle('race.login@test.vn').expect(200);
        hold.release();
        const res = await loginP;

        expect(res.status).toBe(401);
        expect(res.body.error).toBe('Email hoặc mật khẩu không chính xác!');
        expect(getRefreshCookie(res)).toBeNull();
        const { rows } = await pool.query(
            'SELECT COUNT(*)::int AS n FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL', [owner.id]
        );
        expect(rows[0].n).toBe(1); // chỉ còn phiên Google của chủ email
    });

    it('đổi mật khẩu đã qua bcrypt khi liên kết xảy ra → không được ghi mật khẩu mới', async () => {
        const owner = await createUser({ email: 'race.change@test.vn', password: 'matkhau123' });
        const { accessToken } = await loginViaApi(owner);
        const hold = holdNextPasswordCheck();

        const changeP = request(app).put('/api/users/change-password').set(bearer(accessToken))
            .send({ currentPassword: 'matkhau123', newPassword: 'matkhaumoi123' }).then(r => r);
        await hold.started;
        await linkWithGoogle('race.change@test.vn').expect(200);
        hold.release();
        const res = await changeP;

        expect(res.status).toBe(401);
        expect(getRefreshCookie(res)).toBeNull();
        const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [owner.id]);
        expect(rows[0].password_hash).toBeNull();
    });
});
