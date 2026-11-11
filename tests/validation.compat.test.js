// Spec 003 — US2: payload THỰC TẾ của giao diện phải tiếp tục được chấp nhận (xanh trước và sau khi
// thêm lược đồ). Payload sao chép theo AdminDashboardPage / CartPage / ProfilePage / BookDetailPage.
const request = require('supertest');
const app = require('../src/config/app');
const pool = require('../src/config/database');
const { encodeBookId } = require('../src/utils/hashids');
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

describe('US2: payload giao diện vẫn được chấp nhận', () => {
    test('sửa sách: trường thừa, display_order dạng chuỗi, isbn rỗng', async () => {
        const bookId = await createBook();

        const res = await request(app).put(`/api/books/${bookId}`).set(admin.auth).send({
            title: 'Sach Da Sua', author: 'Tac Gia', isbn: '', description: '', price: 120000,
            cover_url: '', status: 'PUBLISHED', categoryIds: [], categories: [], is_featured: false,
            is_bestseller: false, display_order: '3', images: []
        });

        expect(res.status).toBe(200);
    });

    test('tạo mã giảm giá: ngày dạng YYYY-MM-DDTHH:mm, max_discount_amount null', async () => {
        const res = await request(app).post('/api/coupons').set(admin.auth).send({
            code: 'GIAM20K', discount_type: 'FIXED', discount_value: 20000, min_order_amount: 0,
            max_discount_amount: null, start_date: '2026-11-01T00:00', end_date: '2026-12-31T23:59',
            usage_limit: 100, is_active: true
        });

        expect(res.status).toBe(201);
    });

    test('cập nhật kho: STOCK_IN, reason không gửi', async () => {
        const bookId = await createBook();

        const res = await request(app).put(`/api/inventory/${bookId}`).set(admin.auth).send({
            availableQty: 15, type: 'STOCK_IN'
        });

        expect(res.status).toBe(200);
    });

    test('thêm giỏ bằng hashId', async () => {
        const bookId = await createBook();

        const res = await request(app).post('/api/cart/add').set(customer.auth).send({
            bookId: encodeBookId(bookId), quantity: 1
        });

        expect(res.status).toBe(200);
    });

    test('cập nhật hồ sơ với số điện thoại rỗng', async () => {
        const res = await request(app).put('/api/users/profile').set(customer.auth).send({
            full_name: 'Khach Hang', phone: '', address: '1 Duong Test'
        });

        expect(res.status).toBe(200);
    });

    test('danh sách sách và bài viết với limit giao diện đang dùng', async () => {
        const books = await request(app).get('/api/books?limit=500&adminMode=true').set(admin.auth);
        const articles = await request(app).get('/api/articles?limit=200&adminMode=true').set(admin.auth);

        expect(books.status).toBe(200);
        expect(articles.status).toBe(200);
    });

    test('đánh giá hợp lệ', async () => {
        const bookId = await createBook();

        const res = await request(app).post(`/api/books/${bookId}/reviews`).set(admin.auth).send({
            rating: 5, comment: 'Sach rat hay va bo ich'
        });

        expect(res.status).toBe(201);
        const { rows } = await pool.query('SELECT count(*)::int AS n FROM reviews');
        expect(rows[0].n).toBe(1);
    });
});
