// Khoá hành vi lỗi nghiệp vụ (spec 001, US2): mã HTTP và thông báo tiếng Việt phải giữ nguyên
// trước và sau khi chuyển sang xử lý lỗi tập trung. Giao diện web hiển thị trực tiếp `error`.
// Lưu ý rate limit: login/register/forgot-password dùng chung 10 lượt / 15 phút cho cả file này.
const request = require('supertest');
const app = require('../src/config/app');
const pool = require('../src/config/database');
const { resetDb, createUser, closeAll } = require('./helpers/db');

afterAll(async () => {
    await closeAll();
});

beforeEach(async () => {
    await resetDb();
});

async function login(user) {
    const res = await request(app).post('/api/auth/login').send({ email: user.email, password: user.password });
    return { Authorization: `Bearer ${res.body.token}` };
}

async function createBook(stock) {
    const { rows: [book] } = await pool.query(
        "INSERT INTO books (title, author, price) VALUES ('Sach Test', 'Tac Gia', 100000) RETURNING id"
    );
    await pool.query(
        'INSERT INTO inventory (book_id, available_qty, reserved_qty, sold_qty) VALUES ($1, $2, 0, 0)',
        [book.id, stock]
    );
    return book.id;
}

const SHIPPING = {
    shippingName: 'Khach Hang Test',
    shippingPhone: '0912345678',
    shippingAddress: '1 Duong Test, Ha Noi',
    paymentMethod: 'COD'
};

describe('Lỗi nghiệp vụ giữ nguyên mã và thông báo', () => {
    test('đăng ký email đã tồn tại → 400', async () => {
        await createUser({ email: 'trung@test.vn' });

        const res = await request(app)
            .post('/api/auth/register')
            .send({ email: 'trung@test.vn', password: 'matkhau123', fullName: 'Nguoi Dung' });

        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: 'Email này đã được đăng ký!' });
    });

    test('đặt lại mật khẩu với token sai → 400', async () => {
        const res = await request(app)
            .post('/api/auth/reset-password')
            .send({ token: 'khong-hop-le', newPassword: 'matkhau123' });

        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: 'Liên kết khôi phục mật khẩu không hợp lệ hoặc đã hết hạn!' });
    });

    test('đặt hàng khi giỏ trống → 400', async () => {
        const auth = await login(await createUser());

        const res = await request(app).post('/api/orders/checkout').set(auth).send(SHIPPING);

        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: 'Giỏ hàng trống, không thể thanh toán!' });
    });

    test('thêm sách không tồn tại vào giỏ → 400', async () => {
        const auth = await login(await createUser());

        const res = await request(app).post('/api/cart/add').set(auth).send({ bookId: 999999, quantity: 1 });

        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: 'Không tìm thấy cuốn sách này' });
    });

    test('thêm vào giỏ nhiều hơn số lượng trong kho → 400', async () => {
        const auth = await login(await createUser());
        const bookId = await createBook(1);

        const res = await request(app).post('/api/cart/add').set(auth).send({ bookId, quantity: 3 });

        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: 'Số lượng sách trong kho không đủ để đáp ứng' });
    });

    test('kho giảm sau khi đã thêm vào giỏ, lúc đặt hàng → 400 báo số còn lại', async () => {
        const auth = await login(await createUser());
        const bookId = await createBook(5);
        await request(app).post('/api/cart/add').set(auth).send({ bookId, quantity: 3 }).expect(200);
        await pool.query('UPDATE inventory SET available_qty = 1 WHERE book_id = $1', [bookId]);

        const res = await request(app).post('/api/orders/checkout').set(auth).send(SHIPPING);

        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: 'Kho chỉ còn 1 cuốn' });
    });

    test('huỷ đơn hàng của người khác → 400', async () => {
        const owner = await createUser({ email: 'chu-don@test.vn' });
        const ownerAuth = await login(owner);
        const bookId = await createBook(5);
        await request(app).post('/api/cart/add').set(ownerAuth).send({ bookId, quantity: 1 }).expect(200);
        const order = await request(app).post('/api/orders/checkout').set(ownerAuth).send(SHIPPING).expect(201);
        const otherAuth = await login(await createUser({ email: 'nguoi-khac@test.vn' }));

        const res = await request(app).put(`/api/orders/${order.body.data.hashId}/cancel`).set(otherAuth).send({});

        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: 'Bạn không có quyền hủy đơn hàng này!' });
    });
});
