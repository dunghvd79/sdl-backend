// Spec 004 — US2 (giới hạn chung theo tài khoản) và US3 (đặt hàng, gia hạn phiên).
// Hạn mức chung hạ xuống 15 cho riêng file này để test nhanh (mặc định 1000).
process.env.RATE_LIMIT_API_MAX = '15';

const request = require('supertest');
const app = require('../src/config/app');
const { resetDb, closeAll } = require('./helpers/db');
const { loginAs } = require('./helpers/fixtures');

afterAll(async () => {
    delete process.env.RATE_LIMIT_API_MAX;
    await closeAll();
});

beforeAll(async () => {
    await resetDb();
});

const SHIPPING = {
    shippingName: 'Khach Hang', shippingPhone: '0912345678',
    shippingAddress: '1 Duong Test', paymentMethod: 'COD'
};

describe('US2: hạn mức chung theo tài khoản, không theo IP', () => {
    test('tài khoản A dùng hết hạn mức, tài khoản B cùng IP vẫn gọi được', async () => {
        const a = await loginAs('CUSTOMER', 'khach-a@test.vn');
        const b = await loginAs('CUSTOMER', 'khach-b@test.vn');

        let blocked = null;
        for (let i = 0; i < 20 && !blocked; i++) {
            const res = await request(app).get('/api/users/profile').set(a.auth);
            if (res.status === 429) blocked = res;
        }
        const resB = await request(app).get('/api/users/profile').set(b.auth);

        expect(blocked).not.toBeNull();
        expect(resB.status).toBe(200);
    });
});

describe('US3: thao tác tốn tài nguyên', () => {
    test('đặt đơn lần thứ 11 trong 1 phút → 429', async () => {
        // 11 yêu cầu của tài khoản C (< hạn mức chung 15 theo tài khoản) → chỉ giới hạn đặt hàng chặn
        const c = await loginAs('CUSTOMER', 'khach-c@test.vn');
        const statuses = [];
        for (let i = 0; i < 11; i++) {
            statuses.push((await request(app).post('/api/orders/checkout').set(c.auth).send(SHIPPING)).status);
        }

        expect(statuses.slice(0, 10).every(s => s === 400)).toBe(true); // giỏ trống
        expect(statuses[10]).toBe(429);
    });
});
