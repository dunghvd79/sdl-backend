// Spec 004 — US1: giới hạn tần suất cho xác thực (đếm lần sai theo IP+email, quên mật khẩu theo email).
jest.mock('../src/queues/emailQueue', () => ({
    emailQueue: { close: jest.fn().mockResolvedValue() },
    queueResetPasswordEmail: jest.fn().mockResolvedValue()
}));

const request = require('supertest');
const app = require('../src/config/app');
const { resetDb, createUser, closeAll } = require('./helpers/db');
const { loginViaApi, refresh } = require('./helpers/auth');

let userA;
let userB;

afterAll(async () => {
    await closeAll();
});

beforeAll(async () => {
    await resetDb();
    userA = await createUser({ email: 'a@test.vn' });
    userB = await createUser({ email: 'b@test.vn' });
});

function login(email, password) {
    return request(app).post('/api/auth/login').send({ email, password });
}

describe('US1: chống dò mật khẩu', () => {
    test('đăng nhập đúng nhiều lần không bị giới hạn', async () => {
        for (let i = 0; i < 15; i++) {
            const res = await login(userB.email, userB.password);
            expect(res.status).toBe(200);
        }
    });

    test('5 lần sai cho một email → lần 6 bị chặn kể cả đúng mật khẩu', async () => {
        for (let i = 0; i < 5; i++) {
            expect((await login(userA.email, 'sai-mat-khau-1')).status).toBe(401);
        }

        const res = await login(userA.email, userA.password);

        expect(res.status).toBe(429);
        expect(res.body.error).toMatch(/thử lại sau \d+ phút/);
        expect(res.headers['retry-after']).toBeDefined();
    });

    test('email A bị chặn không ảnh hưởng email B', async () => {
        const res = await login(userB.email, userB.password);

        expect(res.status).toBe(200);
    });
});

describe('US3: gia hạn phiên', () => {
    test('gia hạn quá 10 lần / 15 phút cho một phiên → 429', async () => {
        const user = await createUser({ email: 'phien@test.vn' });
        const { refreshToken } = await loginViaApi(user);

        const statuses = [];
        for (let i = 0; i < 11; i++) {
            statuses.push((await refresh(refreshToken)).status);
        }

        expect(statuses.slice(0, 10).every(s => s === 200)).toBe(true);
        expect(statuses[10]).toBe(429);
    });
});

describe('US1: quên mật khẩu', () => {
    test('quá 3 lần / giờ cho một email → 429', async () => {
        for (let i = 0; i < 3; i++) {
            const ok = await request(app).post('/api/auth/forgot-password').send({ email: 'nan-nhan@test.vn' });
            expect(ok.status).toBe(200);
        }

        const res = await request(app).post('/api/auth/forgot-password').send({ email: 'nan-nhan@test.vn' });

        expect(res.status).toBe(429);
        expect(typeof res.body.error).toBe('string');
    });
});
