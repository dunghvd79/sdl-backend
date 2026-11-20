// B74: sách chưa có dòng kho = 0 cuốn (chủ dự án chốt 20/11/2026). Trước đây getStatus / hold / commit tự tạo
// dòng kho với 10 cuốn → sách mới thêm mà chưa nhập kho vẫn bán được 10 cuốn "ảo", trong khi trang sách
// (COALESCE 0) lại hiện hết hàng.
const request = require('supertest');
const app = require('../src/config/app');
const pool = require('../src/config/database');
const { resetDb, closeAll } = require('./helpers/db');
const { loginAs, createBook } = require('./helpers/fixtures');

afterAll(async () => {
    await closeAll();
});

let customer;

beforeEach(async () => {
    await resetDb();
    customer = await loginAs('CUSTOMER');
});

const SHIPPING = { shippingName: 'Khach Hang', shippingPhone: '0912345678', shippingAddress: '1 Duong Test', paymentMethod: 'COD' };

async function bookWithoutInventory() {
    const { rows: [book] } = await pool.query("INSERT INTO books (title, author, price) VALUES ('Sach Moi', 'Tac Gia', 100000) RETURNING id");
    return book.id;
}

async function inventoryRows(bookId) {
    const { rows } = await pool.query('SELECT available_qty, reserved_qty FROM inventory WHERE book_id = $1', [bookId]);
    return rows;
}

// Món đã nằm trong giỏ, rồi dòng kho biến mất (vd sách cũ chưa từng có dòng kho)
async function cartItemThenDropInventory() {
    const bookId = await createBook({ stock: 5 });
    await request(app).post('/api/cart/add').set(customer.auth).send({ bookId, quantity: 1 }).expect(200);
    await pool.query('DELETE FROM inventory WHERE book_id = $1', [bookId]);
    return bookId;
}

describe('B74: sách chưa có dòng kho = 0 cuốn', () => {
    test('thêm vào giỏ sách chưa nhập kho → 400, không tự tạo 10 cuốn', async () => {
        const bookId = await bookWithoutInventory();

        const res = await request(app).post('/api/cart/add').set(customer.auth).send({ bookId, quantity: 1 });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Số lượng sách trong kho không đủ để đáp ứng');
        expect((await inventoryRows(bookId)).every(r => r.available_qty === 0)).toBe(true);
    });

    test('đặt hàng sách không có dòng kho → "Kho chỉ còn 0 cuốn", không giữ chỗ', async () => {
        const bookId = await cartItemThenDropInventory();

        const res = await request(app).post('/api/orders/checkout').set(customer.auth).send(SHIPPING);

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Kho chỉ còn 0 cuốn');
        expect((await inventoryRows(bookId)).every(r => r.available_qty === 0 && r.reserved_qty === 0)).toBe(true);
    });

    test('giỏ hàng hiển thị tồn kho 0 cho sách không có dòng kho', async () => {
        await cartItemThenDropInventory();

        const res = await request(app).get('/api/cart').set(customer.auth).expect(200);

        expect(res.body.data.items[0].book.stock).toBe(0);
    });

    test('quản trị nhập kho sách mới tạo dòng kho từ 0', async () => {
        const bookId = await bookWithoutInventory();
        const admin = await loginAs('ADMIN');

        await request(app).put(`/api/inventory/${bookId}`).set(admin.auth).send({ type: 'STOCK_IN', quantity: 3 }).expect(200);

        expect(await inventoryRows(bookId)).toEqual([{ available_qty: 3, reserved_qty: 0 }]);
    });
});
