// Spec 003 — US1: dữ liệu sai kiểu / quá dài / ngoài khoảng bị từ chối 400 với câu tiếng Việt nêu đúng
// trường, và không có gì được ghi.
const request = require('supertest');
const app = require('../src/config/app');
const pool = require('../src/config/database');
const { resetDb, closeAll } = require('./helpers/db');
const { loginAs, createBook } = require('./helpers/fixtures');

let admin;
let customer;

afterAll(async () => {
    await closeAll();
});

beforeAll(async () => {
    await resetDb();
    admin = await loginAs('ADMIN');
    customer = await loginAs('CUSTOMER');
});

async function count(table) {
    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM ${table}`);
    return rows[0].n;
}

function expect400(res, fieldLabel) {
    expect(res.status).toBe(400);
    expect(res.body.error).toContain(fieldLabel);
}

const SHIPPING = {
    shippingName: 'Khach Hang', shippingPhone: '0912345678',
    shippingAddress: '1 Duong Test', paymentMethod: 'COD'
};

describe('US1 (khách): dữ liệu sai bị từ chối', () => {
    test.each([[-1], [100], ['abc'], [1.5]])('thêm giỏ với số lượng %p → 400', async (quantity) => {
        const bookId = await createBook();
        const before = await count('cart_items');

        const res = await request(app).post('/api/cart/add').set(customer.auth).send({ bookId, quantity });

        expect400(res, 'Số lượng phải');
        expect(await count('cart_items')).toBe(before);
    });

    test('đặt hàng với họ tên người nhận 300 ký tự → 400', async () => {
        const res = await request(app).post('/api/orders/checkout').set(customer.auth)
            .send({ ...SHIPPING, shippingName: 'a'.repeat(300) });

        expect400(res, 'Họ tên người nhận');
    });

    test('đặt hàng với mã giảm giá không phải chuỗi → 400', async () => {
        const res = await request(app).post('/api/orders/checkout').set(customer.auth)
            .send({ ...SHIPPING, couponCode: { $ne: '' } });

        expect400(res, 'Mã giảm giá');
    });

    test('hồ sơ với họ tên 300 ký tự → 400 (không phải 500)', async () => {
        const res = await request(app).put('/api/users/profile').set(customer.auth)
            .send({ full_name: 'a'.repeat(300), phone: '', address: '' });

        expect400(res, 'Họ tên');
    });

    test('đăng nhập với email không phải chuỗi → 400 (không phải 500)', async () => {
        const res = await request(app).post('/api/auth/login').send({ email: { a: 1 }, password: 'x' });

        expect400(res, 'Email');
    });

    test('danh sách sách với limit 1000 → 400', async () => {
        const res = await request(app).get('/api/books?limit=1000');

        expect400(res, 'limit');
    });

    test('nhận xét dài hơn 2000 ký tự → 400', async () => {
        const bookId = await createBook();
        const before = await count('reviews');

        const res = await request(app).post(`/api/books/${bookId}/reviews`).set(admin.auth)
            .send({ rating: 5, comment: 'a'.repeat(2001) });

        expect400(res, 'Nhận xét');
        expect(await count('reviews')).toBe(before);
    });

    test('yêu thích với mã sách là object → 400', async () => {
        const res = await request(app).post('/api/wishlists/toggle').set(customer.auth).send({ bookId: { id: 1 } });

        expect400(res, 'Mã sách');
    });
});

describe('US1 (quản trị): dữ liệu sai bị từ chối', () => {
    const BOOK = { title: 'Sach Moi', author: 'Tac Gia', price: 50000, status: 'PUBLISHED' };

    test.each([
        ['giá âm', { price: -1 }, 'Giá'],
        ['tiêu đề 300 ký tự', { title: 'a'.repeat(300) }, 'Tên sách'],
        ['trạng thái lạ', { status: 'XYZ' }, 'Trạng thái']
    ])('tạo sách với %s → 400', async (_, patch, label) => {
        const before = await count('books');

        const res = await request(app).post('/api/books').set(admin.auth).send({ ...BOOK, ...patch });

        expect400(res, label);
        expect(await count('books')).toBe(before);
    });

    test('tạo danh mục tên 150 ký tự → 400', async () => {
        const res = await request(app).post('/api/categories').set(admin.auth).send({ name: 'a'.repeat(150) });

        expect400(res, 'Tên danh mục');
    });

    const COUPON = {
        code: 'GIAMGIA', discount_type: 'PERCENT', discount_value: 10, min_order_amount: 0,
        start_date: '2026-11-01T00:00', end_date: '2026-12-31T23:59', usage_limit: 10
    };

    test.each([
        ['giảm 150%', { discount_value: 150 }, 'phần trăm'],
        ['ngày kết thúc trước ngày bắt đầu', { end_date: '2026-10-01T00:00' }, 'Ngày kết thúc'],
        ['giới hạn lượt dùng 0', { usage_limit: 0 }, 'Giới hạn lượt dùng']
    ])('tạo mã giảm giá %s → 400', async (_, patch, label) => {
        const before = await count('coupons');
        const code = `GIAM${before}${Date.now() % 100000}`;

        const res = await request(app).post('/api/coupons').set(admin.auth).send({ ...COUPON, code, ...patch });

        expect400(res, label);
        expect(await count('coupons')).toBe(before);
    });

    test('cập nhật kho với loại giao dịch lạ → 400', async () => {
        const bookId = await createBook();

        const res = await request(app).put(`/api/inventory/${bookId}`).set(admin.auth)
            .send({ availableQty: 5, type: 'FOO' });

        expect400(res, 'Loại giao dịch kho');
    });

    test('bài viết với thời gian đọc 60 ký tự → 400', async () => {
        const res = await request(app).post('/api/articles').set(admin.auth)
            .send({ title: 'Bai viet', content: 'Noi dung', reading_time: 'a'.repeat(60) });

        expect400(res, 'Thời gian đọc');
    });
});
