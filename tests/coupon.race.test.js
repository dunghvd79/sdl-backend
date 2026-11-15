// B45: hai đơn dùng cùng một mã giảm giá ĐỒNG THỜI.
// Trước khi sửa, checkout đọc used_count ngoài transaction và không khoá dòng coupon,
// nên hai đơn cùng đọc "còn lượt" → vượt usage_limit; cùng một người thì đụng khoá chính
// user_coupons → lỗi chung "Dữ liệu này đã tồn tại." thay vì câu nghiệp vụ.
const request = require('supertest');
const app = require('../src/config/app');
const pool = require('../src/config/database');
const Coupon = require('../src/models/Coupon');
const { resetDb, closeAll } = require('./helpers/db');
const { loginAs, createBook } = require('./helpers/fixtures');

afterAll(async () => {
    await closeAll();
});

afterEach(() => {
    jest.restoreAllMocks();
});

beforeEach(async () => {
    await resetDb();
});

async function createCoupon({ code, usageLimit }) {
    await pool.query(
        `INSERT INTO coupons (code, discount_type, discount_value, start_date, end_date, usage_limit, used_count)
         VALUES ($1, 'FIXED', 10000, NOW() - INTERVAL '1 day', NOW() + INTERVAL '1 day', $2, 0)`,
        [code, usageLimit]
    );
}

async function addToCart(auth, bookId) {
    await request(app).post('/api/cart/add').set(auth).send({ bookId, quantity: 1 }).expect(200);
}

// Supertest chỉ gửi request khi được await/then → dùng .then() để hai request chạy song song thật
function checkout(auth, couponCode) {
    return request(app).post('/api/orders/checkout').set(auth).send({
        shippingName: 'Khach Hang', shippingPhone: '0912345678', shippingAddress: '1 Duong Test',
        paymentMethod: 'ONLINE', couponCode
    }).then(res => res);
}

// Barrier: mỗi đơn, sau khi đã kiểm tra "còn lượt", chờ đơn kia cũng tới đây rồi mới ghi.
// Chờ tối đa 500ms: khi code đúng, đơn sau bị khoá dòng coupon chặn nên không tới được → đơn trước
// hết chờ, COMMIT, đơn sau mới đọc lại used_count mới nhất. Không có barrier thì kết quả phụ thuộc thời điểm.
function holdUntilBothPassedUsageCheck() {
    let arrived = 0;
    let release;
    const bothArrived = new Promise(resolve => { release = resolve; });
    const realCheckUserUsed = Coupon.checkUserUsed.bind(Coupon);
    jest.spyOn(Coupon, 'checkUserUsed').mockImplementation(async (...args) => {
        arrived += 1;
        if (arrived >= 2) release();
        await Promise.race([bothArrived, new Promise(r => setTimeout(r, 500))]);
        return realCheckUserUsed(...args);
    });
}

async function couponState(code) {
    const { rows: [c] } = await pool.query('SELECT id, used_count FROM coupons WHERE code = $1', [code]);
    const { rows: [u] } = await pool.query('SELECT COUNT(*)::int AS n FROM user_coupons WHERE coupon_id = $1', [c.id]);
    return { usedCount: c.used_count, usages: u.n };
}

describe('B45: dùng mã giảm giá đồng thời', () => {
    test('mã còn 1 lượt, hai khách khác nhau đặt cùng lúc → chỉ một đơn được giảm', async () => {
        const bookId = await createBook({ stock: 10 });
        await createCoupon({ code: 'ONE_LEFT', usageLimit: 1 });
        const a = await loginAs('CUSTOMER', 'a@test.vn');
        const b = await loginAs('CUSTOMER', 'b@test.vn');
        await addToCart(a.auth, bookId);
        await addToCart(b.auth, bookId);
        holdUntilBothPassedUsageCheck();

        const results = await Promise.all([checkout(a.auth, 'ONE_LEFT'), checkout(b.auth, 'ONE_LEFT')]);

        const statuses = results.map(r => r.status).sort();
        expect(statuses).toEqual([201, 400]);
        const rejected = results.find(r => r.status === 400);
        expect(rejected.body.error).toBe('Mã giảm giá đã hết lượt sử dụng');
        expect(await couponState('ONE_LEFT')).toEqual({ usedCount: 1, usages: 1 });
    });

    test('cùng một khách gửi hai đơn cùng lúc với một mã → đơn sau nhận câu báo rõ ràng', async () => {
        const bookId = await createBook({ stock: 10 });
        await createCoupon({ code: 'ONCE_PER_USER', usageLimit: 100 });
        const a = await loginAs('CUSTOMER', 'a@test.vn');
        await addToCart(a.auth, bookId);
        holdUntilBothPassedUsageCheck();

        const results = await Promise.all([checkout(a.auth, 'ONCE_PER_USER'), checkout(a.auth, 'ONCE_PER_USER')]);

        const statuses = results.map(r => r.status).sort();
        expect(statuses).toEqual([201, 400]);
        const rejected = results.find(r => r.status === 400);
        expect(rejected.body.error).toBe('Bạn đã sử dụng mã giảm giá này cho đơn hàng khác rồi');
        expect(await couponState('ONCE_PER_USER')).toEqual({ usedCount: 1, usages: 1 });
    });

    test('không có đua: dùng mã bình thường vẫn được giảm và tăng lượt dùng', async () => {
        const bookId = await createBook({ stock: 10, price: 100000 });
        await createCoupon({ code: 'NORMAL', usageLimit: 5 });
        const a = await loginAs('CUSTOMER', 'a@test.vn');
        await addToCart(a.auth, bookId);

        const res = await checkout(a.auth, 'NORMAL');

        expect(res.status).toBe(201);
        expect(Number(res.body.data.total_amount)).toBe(90000);
        expect(await couponState('NORMAL')).toEqual({ usedCount: 1, usages: 1 });
    });
});
