// B86: sách nháp (DRAFT) / đã ẩn (HIDDEN) không bán được — chặn ở hai lớp:
// - thêm vào giỏ (/cart/add, /cart/add-batch "Mua lại"): báo ngay;
// - thanh toán (/cart/checkout, /orders/checkout): sách bị ẩn SAU khi khách đã cho vào giỏ.
// Kèm test giữ hành vi kiểm kho của /cart/checkout (B85: đổi sang đọc cả lô một câu).
const request = require('supertest');
const app = require('../src/config/app');
const pool = require('../src/config/database');
const { resetDb, closeAll } = require('./helpers/db');
const { loginAs, createBook } = require('./helpers/fixtures');

beforeEach(resetDb);
afterAll(closeAll);

const SHIPPING = { shippingName: 'Khach Hang', shippingPhone: '0912345678', shippingAddress: '1 Duong Test', paymentMethod: 'COD' };

function setStatus(bookId, status) {
    return pool.query('UPDATE books SET status = $2 WHERE id = $1', [bookId, status]);
}

async function cartCount(userId) {
    const { rows: [{ n }] } = await pool.query(
        'SELECT COUNT(*)::int AS n FROM cart_items ci JOIN carts c ON c.id = ci.cart_id WHERE c.user_id = $1', [userId]
    );
    return n;
}

describe('thêm vào giỏ', () => {
    test.each(['DRAFT', 'HIDDEN'])('sách %s → 400, giỏ không đổi', async (status) => {
        const { user, auth } = await loginAs('CUSTOMER');
        const bookId = await createBook({ title: 'Sach An' });
        await setStatus(bookId, status);

        const res = await request(app).post('/api/cart/add').set(auth).send({ bookId, quantity: 1 });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Sách "Sach An" hiện không còn bán');
        expect(await cartCount(user.id)).toBe(0);
    });

    test('"Mua lại" có một sách đã ẩn → 400, không món nào vào giỏ', async () => {
        const { user, auth } = await loginAs('CUSTOMER');
        const a = await createBook({ title: 'Sach A' });
        const b = await createBook({ title: 'Sach B' });
        await setStatus(b, 'HIDDEN');

        const res = await request(app).post('/api/cart/add-batch').set(auth)
            .send({ items: [{ bookId: a, quantity: 1 }, { bookId: b, quantity: 1 }] });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Sách "Sach B" hiện không còn bán');
        expect(await cartCount(user.id)).toBe(0);
    });
});

describe('sách bị ẩn sau khi đã nằm trong giỏ', () => {
    async function cartWithHiddenBook() {
        const customer = await loginAs('CUSTOMER');
        const a = await createBook({ title: 'Sach A' });
        const b = await createBook({ title: 'Sach B', stock: 5 });
        await request(app).post('/api/cart/add').set(customer.auth).send({ bookId: a, quantity: 1 }).expect(200);
        await request(app).post('/api/cart/add').set(customer.auth).send({ bookId: b, quantity: 1 }).expect(200);
        await setStatus(b, 'HIDDEN');
        return { ...customer, b };
    }

    test('/cart/checkout → 400 kèm tên sách', async () => {
        const { auth } = await cartWithHiddenBook();

        const res = await request(app).post('/api/cart/checkout').set(auth).send({});

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Sách "Sach B" hiện không còn bán');
    });

    test('/orders/checkout → 400, không tạo đơn, không giữ kho, giỏ giữ nguyên', async () => {
        const { user, auth, b } = await cartWithHiddenBook();

        const res = await request(app).post('/api/orders/checkout').set(auth).send(SHIPPING);

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Sách "Sach B" hiện không còn bán');
        const { rows: [{ n }] } = await pool.query('SELECT COUNT(*)::int AS n FROM orders');
        expect(n).toBe(0);
        const { rows: [inv] } = await pool.query('SELECT reserved_qty FROM inventory WHERE book_id = $1', [b]);
        expect(inv.reserved_qty).toBe(0);
        expect(await cartCount(user.id)).toBe(2); // không tự xoá: khách tự bỏ món ra
    });
});

describe('/cart/checkout kiểm kho (giữ hành vi)', () => {
    test('đủ hàng → 200', async () => {
        const { auth } = await loginAs('CUSTOMER');
        const a = await createBook({ title: 'Sach A', stock: 3 });
        await request(app).post('/api/cart/add').set(auth).send({ bookId: a, quantity: 3 }).expect(200);

        const res = await request(app).post('/api/cart/checkout').set(auth).send({});

        expect(res.status).toBe(200);
        expect(res.body.message).toBe('Sẵn sàng tạo Đơn hàng');
    });

    test('kho giảm sau khi cho vào giỏ → 400 kèm tên sách', async () => {
        const { auth } = await loginAs('CUSTOMER');
        const a = await createBook({ title: 'Sach A', stock: 3 });
        await request(app).post('/api/cart/add').set(auth).send({ bookId: a, quantity: 3 }).expect(200);
        await pool.query('UPDATE inventory SET available_qty = 2 WHERE book_id = $1', [a]);

        const res = await request(app).post('/api/cart/checkout').set(auth).send({});

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Sách "Sach A" trong kho không đủ để đáp ứng');
    });
});
