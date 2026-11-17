// Spec 005 US3 — tài khoản chỉ dùng Google (không có mật khẩu) với các chức năng mật khẩu.
// File riêng để bộ đếm giới hạn tần suất của auth.google.test.js (test 429 ở cuối file) không ảnh hưởng.
jest.mock('../src/queues/emailQueue', () => ({
    emailQueue: { close: jest.fn().mockResolvedValue() },
    queueResetPasswordEmail: jest.fn().mockResolvedValue()
}));

const request = require('supertest');
const { OAuth2Client } = require('google-auth-library');
const app = require('../src/config/app');
const { queueResetPasswordEmail } = require('../src/queues/emailQueue');
const { resetDb, createUser, closeAll } = require('./helpers/db');
const { ORIGIN, bearer } = require('./helpers/auth');
const { TEST_GOOGLE_CLIENT_ID, testCerts, uniqueSub, signGoogleIdToken } = require('./helpers/google');

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
    jest.clearAllMocks();
});

let emailIndex = 0;
async function googleOnlyAccount() {
    emailIndex += 1; // quên mật khẩu giới hạn 3 lần/giờ cho mỗi email (spec 004)
    const sub = uniqueSub();
    const email = `google${emailIndex}@gmail.com`;
    const res = await request(app).post('/api/auth/google').set('Origin', ORIGIN)
        .send({ credential: signGoogleIdToken({ sub, email }) }).expect(200);
    return { sub, email, accessToken: res.body.token };
}

function passwordLogin(email, password) {
    return request(app).post('/api/auth/login').set('Origin', ORIGIN).send({ email, password });
}

describe('US3: tài khoản chỉ dùng Google với chức năng mật khẩu', () => {
    it('đăng nhập bằng mật khẩu bất kỳ → 401 câu chung (không 500, không lộ tài khoản Google)', async () => {
        const { email } = await googleOnlyAccount();
        const res = await passwordLogin(email, 'matkhau123');
        expect(res.status).toBe(401);
        expect(res.body.error).toBe('Email hoặc mật khẩu không chính xác!');
    });

    it('đổi mật khẩu → 400 hướng dẫn dùng Quên mật khẩu', async () => {
        const { accessToken } = await googleOnlyAccount();
        const res = await request(app).put('/api/users/change-password').set(bearer(accessToken))
            .send({ currentPassword: 'batky123', newPassword: 'matkhaumoi123' });
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Tài khoản của bạn chưa có mật khẩu. Hãy dùng "Quên mật khẩu" để tạo mật khẩu.');
    });

    it('hồ sơ trả has_password, không bao giờ trả password_hash / google_sub', async () => {
        const { accessToken } = await googleOnlyAccount();
        const google = await request(app).get('/api/users/profile').set(bearer(accessToken)).expect(200);
        expect(google.body.data.has_password).toBe(false);
        expect(google.body.data).not.toHaveProperty('password_hash');
        expect(google.body.data).not.toHaveProperty('google_sub');
        // Cột cũ của cơ chế một phiên trước spec 002 — không còn dùng, không trả ra ngoài
        expect(google.body.data).not.toHaveProperty('session_id');

        const owner = await createUser({ email: 'matkhau@test.vn', password: 'matkhau123' });
        const login = await passwordLogin(owner.email, 'matkhau123').expect(200);
        const withPassword = await request(app).get('/api/users/profile').set(bearer(login.body.token)).expect(200);
        expect(withPassword.body.data.has_password).toBe(true);
    });

    it('Quên mật khẩu + đặt lại → đăng nhập được bằng cả mật khẩu mới và Google', async () => {
        const { sub, email } = await googleOnlyAccount();

        await request(app).post('/api/auth/forgot-password').send({ email }).expect(200);
        expect(queueResetPasswordEmail).toHaveBeenCalledTimes(1);
        const token = queueResetPasswordEmail.mock.calls[0][1];
        await request(app).post('/api/auth/reset-password').send({ token, newPassword: 'matkhaumoi123' }).expect(200);

        await passwordLogin(email, 'matkhaumoi123').expect(200);
        await request(app).post('/api/auth/google').set('Origin', ORIGIN)
            .send({ credential: signGoogleIdToken({ sub, email }) }).expect(200);
    });
});
