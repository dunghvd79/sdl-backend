// B46: admin chỉ được chuyển trạng thái đơn theo bảng chuyển hợp lệ (src/utils/orderStatus.js).
// Trước khi sửa: mọi cặp trạng thái đều được phép → trừ kho 2 lần (CONFIRMED → PENDING → CONFIRMED),
// đơn đã huỷ sống lại mà không trừ kho (CANCELLED → CONFIRMED), huỷ được đơn đang giao.
const request = require('supertest');
const app = require('../src/config/app');
const pool = require('../src/config/database');
const { resetDb, closeAll } = require('./helpers/db');
const { loginAs, createBook } = require('./helpers/fixtures');

let customer;
let admin;

afterAll(async () => {
    await closeAll();
});

beforeAll(async () => {
    await resetDb();
    customer = await loginAs('CUSTOMER');
    admin = await loginAs('ADMIN');
});

async function stock(bookId) {
    const { rows } = await pool.query('SELECT available_qty, reserved_qty, sold_qty FROM inventory WHERE book_id = $1', [bookId]);
    return rows[0];
}

async function statusOf(order) {
    const { rows: [o] } = await pool.query('SELECT status FROM orders WHERE id = $1', [order.id]);
    return o.status;
}

async function notificationCount(order) {
    const { rows: [n] } = await pool.query(
        "SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND type = 'ORDER'", [order.user_id]
    );
    return n.n;
}

// Đơn COD 2 cuốn, kho 10 → sau đặt: 10 tồn, 2 giữ chỗ
async function codOrder() {
    const bookId = await createBook({ stock: 10 });
    await request(app).post('/api/cart/add').set(customer.auth).send({ bookId, quantity: 2 }).expect(200);
    const res = await request(app).post('/api/orders/checkout').set(customer.auth).send({
        shippingName: 'Khach Hang', shippingPhone: '0912345678', shippingAddress: '1 Duong Test', paymentMethod: 'COD'
    }).expect(201);
    return { bookId, order: res.body.data };
}

function setStatus(order, status, extra = {}) {
    return request(app).put(`/api/admin/orders/${order.hashId}/status`).set(admin.auth).send({ status, ...extra });
}

async function walk(order, statuses) {
    for (const s of statuses) await setStatus(order, s).expect(200);
}

describe('B46: chuyển trạng thái đơn hợp lệ', () => {
    test('đi hết luồng từng bước → kho chỉ bị trừ một lần', async () => {
        const { bookId, order } = await codOrder();
        await walk(order, ['CONFIRMED', 'PACKAGING', 'DELIVERING', 'DELIVERED']);

        expect(await statusOf(order)).toBe('DELIVERED');
        expect(await stock(bookId)).toEqual({ available_qty: 8, reserved_qty: 0, sold_qty: 2 });
    });

    test('lùi khi bấm nhầm (DELIVERING → PACKAGING, DELIVERED → DELIVERING) → được phép, kho không đổi', async () => {
        const { bookId, order } = await codOrder();
        await walk(order, ['CONFIRMED', 'PACKAGING', 'DELIVERING', 'PACKAGING', 'DELIVERING', 'DELIVERED', 'DELIVERING']);

        expect(await statusOf(order)).toBe('DELIVERING');
        expect(await stock(bookId)).toEqual({ available_qty: 8, reserved_qty: 0, sold_qty: 2 });
    });

    test('lùi rồi tiến lại (PACKAGING → CONFIRMED → PACKAGING) → kho vẫn chỉ trừ một lần', async () => {
        const { bookId, order } = await codOrder();
        await walk(order, ['CONFIRMED', 'PACKAGING', 'CONFIRMED', 'PACKAGING']);

        expect(await stock(bookId)).toEqual({ available_qty: 8, reserved_qty: 0, sold_qty: 2 });
    });

    test('đang đóng gói → huỷ: hàng được hoàn về kho', async () => {
        const { bookId, order } = await codOrder();
        await walk(order, ['CONFIRMED', 'PACKAGING', 'CANCELLED']);

        expect(await stock(bookId)).toEqual({ available_qty: 10, reserved_qty: 0, sold_qty: 0 });
    });

    test('gửi lại đúng trạng thái hiện tại → 200, không tạo thêm thông báo', async () => {
        const { order } = await codOrder();
        await setStatus(order, 'CONFIRMED').expect(200);
        const before = await notificationCount(order);

        await setStatus(order, 'CONFIRMED').expect(200);

        expect(await notificationCount(order)).toBe(before);
    });
});

describe('B46: chuyển trạng thái không hợp lệ → 400, không đổi gì', () => {
    test('huỷ đơn đang giao', async () => {
        const { bookId, order } = await codOrder();
        await walk(order, ['CONFIRMED', 'PACKAGING', 'DELIVERING']);

        const res = await setStatus(order, 'CANCELLED', { cancelReason: 'test' }).expect(400);

        expect(res.body.error).toBe('Không thể chuyển đơn hàng từ "Đang giao hàng" sang "Đã hủy"');
        expect(await statusOf(order)).toBe('DELIVERING');
        expect(await stock(bookId)).toEqual({ available_qty: 8, reserved_qty: 0, sold_qty: 2 });
    });

    test('lùi về PENDING (CONFIRMED → PENDING) — chặn đường dẫn tới trừ kho 2 lần', async () => {
        const { bookId, order } = await codOrder();
        await setStatus(order, 'CONFIRMED').expect(200);

        await setStatus(order, 'PENDING').expect(400);

        expect(await statusOf(order)).toBe('CONFIRMED');
        expect(await stock(bookId)).toEqual({ available_qty: 8, reserved_qty: 0, sold_qty: 2 });
    });

    test('làm sống lại đơn đã huỷ (CANCELLED → CONFIRMED)', async () => {
        const { bookId, order } = await codOrder();
        await setStatus(order, 'CANCELLED').expect(200);

        await setStatus(order, 'CONFIRMED').expect(400);

        expect(await statusOf(order)).toBe('CANCELLED');
        expect(await stock(bookId)).toEqual({ available_qty: 10, reserved_qty: 0, sold_qty: 0 });
    });

    test('nhảy cóc (PENDING → DELIVERED)', async () => {
        const { order } = await codOrder();

        await setStatus(order, 'DELIVERED').expect(400);

        expect(await statusOf(order)).toBe('PENDING');
    });

    test('trạng thái không tồn tại', async () => {
        const { order } = await codOrder();

        const res = await setStatus(order, 'ABC').expect(400);

        expect(res.body.error).toBe('Trạng thái không hợp lệ');
    });
});
