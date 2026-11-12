// Spec 002 — US4 (phần quên / đặt lại mật khẩu). Hàng đợi email là dịch vụ ngoài nên được giả lập
// để lấy mã đặt lại gốc gửi cho người dùng.
jest.mock('../src/queues/emailQueue', () => ({
    emailQueue: { close: jest.fn().mockResolvedValue() },
    queueResetPasswordEmail: jest.fn().mockResolvedValue()
}));

const request = require('supertest');
const app = require('../src/config/app');
const pool = require('../src/config/database');
const { queueResetPasswordEmail } = require('../src/queues/emailQueue');
const { resetDb, createUser, closeAll } = require('./helpers/db');
const { loginViaApi, refresh } = require('./helpers/auth');

let user;
let testIndex = 0;

afterAll(async () => {
    await closeAll();
});

beforeEach(async () => {
    await resetDb();
    jest.clearAllMocks();
    // Email riêng cho mỗi test: quên mật khẩu bị giới hạn 3 lần/giờ cho mỗi email (spec 004)
    testIndex += 1;
    user = await createUser({ email: `reset-${testIndex}@test.vn` });
});

function forgot(email) {
    return request(app).post('/api/auth/forgot-password').send({ email });
}

function reset(token, newPassword = 'matkhaumoi123') {
    return request(app).post('/api/auth/reset-password').send({ token, newPassword });
}

async function requestResetToken() {
    await forgot(user.email).expect(200);
    return queueResetPasswordEmail.mock.calls.at(-1)[1];
}

describe('US4: quên và đặt lại mật khẩu', () => {
    test('email có và không có trong hệ thống nhận phản hồi giống hệt nhau', async () => {
        const known = await forgot(user.email);
        const unknown = await forgot('khong-ton-tai@test.vn');

        expect(known.status).toBe(200);
        expect(unknown.status).toBe(known.status);
        expect(unknown.body).toEqual(known.body);
        expect(queueResetPasswordEmail).toHaveBeenCalledTimes(1);
    });

    test('DB chỉ lưu băm của mã đặt lại, không lưu mã gốc', async () => {
        const rawToken = await requestResetToken();

        const { rows: [row] } = await pool.query('SELECT reset_password_token FROM users WHERE id = $1', [user.id]);

        expect(rawToken).toBeTruthy();
        expect(row.reset_password_token).not.toBe(rawToken);
        expect(row.reset_password_token).toMatch(/^[0-9a-f]{64}$/);
    });

    test('đặt lại mật khẩu thành công thì mọi phiên cũ không gia hạn được', async () => {
        const deviceA = await loginViaApi(user);
        const deviceB = await loginViaApi(user);
        const rawToken = await requestResetToken();

        const res = await reset(rawToken);
        const refreshA = await refresh(deviceA.refreshToken);
        const refreshB = await refresh(deviceB.refreshToken);

        expect(res.status).toBe(200);
        expect(refreshA.status).toBe(401);
        expect(refreshB.status).toBe(401);
    });

    test('mã đặt lại chỉ dùng được một lần', async () => {
        const rawToken = await requestResetToken();

        await reset(rawToken).expect(200);
        const second = await reset(rawToken, 'matkhaukhac456');

        expect(second.status).toBe(400);
    });

    test('đặt lại với mật khẩu yếu → 400 theo chính sách mới', async () => {
        const rawToken = await requestResetToken();

        const res = await reset(rawToken, 'abc1234');

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Mật khẩu phải có ít nhất 8 ký tự, gồm cả chữ cái và chữ số!');
    });
});
