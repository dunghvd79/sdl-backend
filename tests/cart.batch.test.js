// POST /api/cart/add-batch ("Mua lại" ở trang đơn hàng / lịch sử đơn).
// B85: món nào lỗi (không có sách, hết hàng) thì KHÔNG món nào được thêm — trước đây các món đứng trước vẫn nằm lại
// trong giỏ dù khách nhận lỗi 400.
const request = require('supertest');
const app = require('../src/config/app');
const pool = require('../src/config/database');
const { resetDb, closeAll } = require('./helpers/db');
const { loginAs, createBook } = require('./helpers/fixtures');
const { encodeBookId } = require('../src/utils/hashids');

beforeEach(resetDb);
afterAll(closeAll);

function addBatch(auth, items) {
    return request(app).post('/api/cart/add-batch').set(auth).send({ items });
}

async function cartRows(userId) {
    const { rows } = await pool.query(
        `SELECT ci.book_id, ci.quantity, ci.price_at_add::float AS price
         FROM cart_items ci JOIN carts c ON c.id = ci.cart_id
         WHERE c.user_id = $1 ORDER BY ci.book_id`,
        [userId]
    );
    return rows;
}

test('món sau không đủ hàng → 400, giỏ không có món nào', async () => {
    const { user, auth } = await loginAs('CUSTOMER');
    const a = await createBook({ title: 'Sach A', stock: 10 });
    const b = await createBook({ title: 'Sach B', stock: 1 });

    const res = await addBatch(auth, [{ bookId: a, quantity: 2 }, { bookId: b, quantity: 5 }]);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Số lượng sách "Sach B" trong kho không đủ để đáp ứng');
    expect(await cartRows(user.id)).toEqual([]);
});

test('món sau không tồn tại → 400, giỏ không có món nào', async () => {
    const { user, auth } = await loginAs('CUSTOMER');
    const a = await createBook({ title: 'Sach A', stock: 10 });

    const res = await addBatch(auth, [{ bookId: a, quantity: 1 }, { bookId: 999999, quantity: 1 }]);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Không tìm thấy cuốn sách có ID 999999');
    expect(await cartRows(user.id)).toEqual([]);
});

test('thành công: thêm đủ các món theo hashId (payload của giao diện), cộng dồn món đã có trong giỏ', async () => {
    const { user, auth } = await loginAs('CUSTOMER');
    const a = await createBook({ title: 'Sach A', price: 50000, stock: 10 });
    const b = await createBook({ title: 'Sach B', price: 80000, stock: 10 });
    await request(app).post('/api/cart/add').set(auth).send({ bookId: encodeBookId(a), quantity: 1 }).expect(200);

    const res = await addBatch(auth, [
        { bookId: encodeBookId(a), quantity: 2 },
        { bookId: encodeBookId(b), quantity: 1 }
    ]);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(await cartRows(user.id)).toEqual([
        { book_id: a, quantity: 3, price: 50000 },
        { book_id: b, quantity: 1, price: 80000 }
    ]);
});
