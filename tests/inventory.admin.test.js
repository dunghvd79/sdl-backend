// G2 (đối chiếu CV): admin cập nhật kho theo LƯỢNG THAY ĐỔI, khoá dòng, không ghi đè số tuyệt đối
// do giao diện tính từ dữ liệu cũ (lost update → bán vượt tồn kho).
const request = require('supertest');
const app = require('../src/config/app');
const pool = require('../src/config/database');
const { resetDb, closeAll } = require('./helpers/db');
const { loginAs, createBook } = require('./helpers/fixtures');

let admin;

afterAll(async () => {
    await closeAll();
});

beforeAll(async () => {
    await resetDb();
    admin = await loginAs('ADMIN');
});

async function stock(bookId) {
    const { rows } = await pool.query(
        'SELECT available_qty, reserved_qty FROM inventory WHERE book_id = $1',
        [bookId]
    );
    return rows[0];
}

function adjust(bookId, body) {
    return request(app).put(`/api/inventory/${bookId}`).set(admin.auth).send(body);
}

describe('G2: cập nhật kho theo lượng thay đổi', () => {
    test('nhập thêm cộng vào tồn kho HIỆN TẠI, không ghi đè theo số giao diện đã thấy', async () => {
        const bookId = await createBook({ stock: 10 });
        // Admin mở hộp thoại thấy 10; trong lúc đó khách mua 2 cuốn
        await pool.query('UPDATE inventory SET available_qty = 8 WHERE book_id = $1', [bookId]);

        const res = await adjust(bookId, { type: 'STOCK_IN', quantity: 5 });

        expect(res.status).toBe(200);
        expect((await stock(bookId)).available_qty).toBe(13);
    });

    test('xuất kho trừ vào tồn kho hiện tại', async () => {
        const bookId = await createBook({ stock: 10 });

        const res = await adjust(bookId, { type: 'STOCK_OUT', quantity: 3 });

        expect(res.status).toBe(200);
        expect((await stock(bookId)).available_qty).toBe(7);
    });

    test('không cho giảm tồn kho xuống dưới số đang giữ chỗ cho đơn chờ thanh toán', async () => {
        const bookId = await createBook({ stock: 10 });
        await pool.query('UPDATE inventory SET reserved_qty = 4 WHERE book_id = $1', [bookId]);

        const res = await adjust(bookId, { type: 'STOCK_OUT', quantity: 8 });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('đang giữ chỗ');
        expect((await stock(bookId)).available_qty).toBe(10);
    });

    test('10 lần nhập kho đồng thời không làm mất lần nào (khoá dòng)', async () => {
        const bookId = await createBook({ stock: 10 });

        const results = await Promise.all(
            Array.from({ length: 10 }, () => adjust(bookId, { type: 'STOCK_IN', quantity: 1 }))
        );

        expect(results.every(r => r.status === 200)).toBe(true);
        expect((await stock(bookId)).available_qty).toBe(20);
    });

    test('mỗi lần thay đổi ghi đúng một dòng lịch sử kho', async () => {
        const bookId = await createBook({ stock: 10 });

        await adjust(bookId, { type: 'STOCK_IN', quantity: 5, reason: 'Nhập lô mới' });

        const { rows } = await pool.query(
            'SELECT type, quantity, previous_qty, new_qty, reason FROM inventory_transactions WHERE book_id = $1',
            [bookId]
        );
        expect(rows).toEqual([{ type: 'STOCK_IN', quantity: 5, previous_qty: 10, new_qty: 15, reason: 'Nhập lô mới' }]);
    });
});
