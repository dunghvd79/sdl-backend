// B48: duyệt / huỷ hàng loạt bằng MỘT request (POST /api/admin/orders/bulk-status).
// Trước đây giao diện gửi 1 request cho mỗi đơn → quá 30 đơn thì bị writeLimiter (30 / phút) chặn giữa chừng.
const request = require('supertest');
const app = require('../src/config/app');
const pool = require('../src/config/database');
const { encodeOrderId } = require('../src/utils/hashids');
const { resetDb, closeAll } = require('./helpers/db');
const { loginAs, createBook } = require('./helpers/fixtures');

let customer;
let admin;
let curator;

afterAll(async () => {
    await closeAll();
});

beforeAll(async () => {
    await resetDb();
    customer = await loginAs('CUSTOMER');
    admin = await loginAs('ADMIN');
    curator = await loginAs('CURATOR');
});

async function stock(bookId) {
    const { rows } = await pool.query('SELECT available_qty, reserved_qty, sold_qty FROM inventory WHERE book_id = $1', [bookId]);
    return rows[0];
}

// Tạo nhanh n đơn COD đang chờ (mỗi đơn 1 cuốn) bằng SQL, kho giữ chỗ tương ứng — tránh orderLimiter 10 / phút
async function pendingOrders(n, { stockQty = 100 } = {}) {
    const bookId = await createBook({ stock: stockQty });
    const orders = [];
    for (let i = 0; i < n; i++) {
        const { rows: [o] } = await pool.query(
            `INSERT INTO orders (user_id, total_amount, status, payment_method, shipping_name, shipping_phone, shipping_address)
             VALUES ($1, 100000, 'PENDING', 'COD', 'Khach', '0912345678', '1 Duong') RETURNING id, created_at`,
            [customer.user.id]
        );
        await pool.query('INSERT INTO order_items (order_id, book_id, quantity, price) VALUES ($1, $2, 1, 100000)', [o.id, bookId]);
        orders.push({ id: o.id, hashId: encodeOrderId(o.id, o.created_at) });
    }
    await pool.query('UPDATE inventory SET reserved_qty = reserved_qty + $2 WHERE book_id = $1', [bookId, n]);
    return { bookId, orders };
}

async function statuses(orders) {
    const { rows } = await pool.query('SELECT status FROM orders WHERE id = ANY($1) ORDER BY id', [orders.map(o => o.id)]);
    return rows.map(r => r.status);
}

function bulk(auth, body) {
    return request(app).post('/api/admin/orders/bulk-status').set(auth).send(body);
}

describe('B48: đổi trạng thái hàng loạt', () => {
    test('duyệt 35 đơn trong một request (vượt hạn mức 30 thao tác / phút nếu gửi từng đơn)', async () => {
        const { bookId, orders } = await pendingOrders(35);

        const res = await bulk(admin.auth, { orderIds: orders.map(o => o.hashId), status: 'CONFIRMED' }).expect(200);

        expect(res.body.data.succeeded).toHaveLength(35);
        expect(res.body.data.failed).toEqual([]);
        expect(new Set(await statuses(orders))).toEqual(new Set(['CONFIRMED']));
        expect(await stock(bookId)).toEqual({ available_qty: 65, reserved_qty: 0, sold_qty: 35 });
    });

    test('lô có đơn lỗi → đơn hợp lệ vẫn xong, đơn lỗi trả lý do riêng', async () => {
        const { bookId, orders: [ok, delivering] } = await pendingOrders(2, { stockQty: 10 });
        await pool.query("UPDATE orders SET status = 'DELIVERING' WHERE id = $1", [delivering.id]);

        const res = await bulk(admin.auth, {
            orderIds: [ok.hashId, delivering.hashId, 'khong-hop-le!'],
            status: 'CANCELLED',
            cancelReason: 'Hết hàng'
        }).expect(200);

        expect(res.body.data.succeeded).toEqual([ok.hashId]);
        expect(res.body.data.failed).toEqual([
            { id: delivering.hashId, error: 'Không thể chuyển đơn hàng từ "Đang giao hàng" sang "Đã hủy"' },
            { id: 'khong-hop-le!', error: 'Mã đơn hàng không hợp lệ!' }
        ]);
        expect(await statuses([ok, delivering])).toEqual(['CANCELLED', 'DELIVERING']);
        const { rows: [o] } = await pool.query('SELECT cancel_reason FROM orders WHERE id = $1', [ok.id]);
        expect(o.cancel_reason).toBe('Hết hàng');
        expect(await stock(bookId)).toEqual({ available_qty: 10, reserved_qty: 1, sold_qty: 0 });
    });

    test('mã trùng trong danh sách chỉ xử lý một lần', async () => {
        const { bookId, orders: [o] } = await pendingOrders(1, { stockQty: 10 });

        const res = await bulk(admin.auth, { orderIds: [o.hashId, o.hashId], status: 'CONFIRMED' }).expect(200);

        expect(res.body.data.succeeded).toEqual([o.hashId]);
        expect(await stock(bookId)).toEqual({ available_qty: 9, reserved_qty: 0, sold_qty: 1 });
    });
});

describe('B48: đầu vào và phân quyền', () => {
    test('danh sách rỗng → 400', async () => {
        const res = await bulk(admin.auth, { orderIds: [], status: 'CONFIRMED' }).expect(400);
        expect(res.body.error).toBe('Danh sách đơn hàng phải có ít nhất 1 phần tử');
    });

    test('quá 100 đơn → 400', async () => {
        const ids = Array.from({ length: 101 }, (_, i) => String(i + 1));
        const res = await bulk(admin.auth, { orderIds: ids, status: 'CONFIRMED' }).expect(400);
        expect(res.body.error).toBe('Danh sách đơn hàng tối đa 100 phần tử');
    });

    test('trạng thái không hợp lệ → 400', async () => {
        const res = await bulk(admin.auth, { orderIds: ['1'], status: 'ABC' }).expect(400);
        expect(res.body.error).toBe('Trạng thái không hợp lệ');
    });

    test('CURATOR không được dùng → 403', async () => {
        await bulk(curator.auth, { orderIds: ['1'], status: 'CONFIRMED' }).expect(403);
    });
});
