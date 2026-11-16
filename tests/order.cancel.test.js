// B42 + B47: huỷ đơn dùng chung một hàm cho khách và admin.
// - B42: admin huỷ đơn ONLINE đã thanh toán → payment phải chuyển REFUND_PENDING (như khách tự huỷ).
// - Khách huỷ đúng lúc PayOS xác nhận thanh toán → phải dựa trên trạng thái hiện tại (khoá dòng),
//   nếu không thì kho đã trừ không được hoàn (lỗi cùng loại B41).
jest.mock('@payos/node', () => {
    const mockPayos = { paymentRequests: { create: jest.fn(), get: jest.fn() }, webhooks: { verify: jest.fn() } };
    return { PayOS: jest.fn(() => mockPayos), mockPayos };
});
process.env.PAYOS_CLIENT_ID = 'test-client';
process.env.PAYOS_API_KEY = 'test-api-key';
process.env.PAYOS_CHECKSUM_KEY = 'test-checksum';

const request = require('supertest');
const app = require('../src/config/app');
const pool = require('../src/config/database');
const Order = require('../src/models/Order');
const Payment = require('../src/models/Payment');
const { mockPayos } = require('@payos/node');
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

afterEach(() => {
    jest.restoreAllMocks();
});

async function stock(bookId) {
    const { rows } = await pool.query('SELECT available_qty, reserved_qty, sold_qty FROM inventory WHERE book_id = $1', [bookId]);
    return rows[0];
}

async function paymentStatus(order) {
    const { rows: [p] } = await pool.query('SELECT status FROM payments WHERE order_id = $1', [order.id]);
    return p.status;
}

async function orderRow(order) {
    const { rows: [o] } = await pool.query('SELECT status, cancel_reason FROM orders WHERE id = $1', [order.id]);
    return o;
}

// Đơn ONLINE 2 cuốn (kho 10) đang chờ thanh toán; PayOS sẵn sàng báo PAID cho linkId
async function pendingOnlineOrder(bookId, linkId) {
    await request(app).post('/api/cart/add').set(customer.auth).send({ bookId, quantity: 2 }).expect(200);
    const res = await request(app).post('/api/orders/checkout').set(customer.auth).send({
        shippingName: 'Khach Hang', shippingPhone: '0912345678', shippingAddress: '1 Duong Test', paymentMethod: 'ONLINE'
    }).expect(201);
    const order = res.body.data;
    await Payment.create(order.id, Number(order.total_amount), 'PAYOS');
    mockPayos.paymentRequests.get.mockResolvedValue({ id: linkId, orderCode: order.id, status: 'PAID' });
    return order;
}

function payosConfirms(linkId) {
    return request(app).get(`/api/payments/payos_return?id=${linkId}&code=00&status=PAID`).expect(302);
}

describe('B42: admin huỷ đơn ONLINE đã thanh toán', () => {
    test('payment chuyển REFUND_PENDING, kho được hoàn, lưu lý do', async () => {
        const bookId = await createBook({ stock: 10 });
        const order = await pendingOnlineOrder(bookId, 'plink_cancel_1');
        await payosConfirms('plink_cancel_1');
        expect(await paymentStatus(order)).toBe('SUCCESS');

        await request(app).put(`/api/admin/orders/${order.hashId}/status`).set(admin.auth)
            .send({ status: 'CANCELLED', cancelReason: 'Hết hàng' }).expect(200);

        expect(await paymentStatus(order)).toBe('REFUND_PENDING');
        expect(await orderRow(order)).toEqual({ status: 'CANCELLED', cancel_reason: 'Hết hàng' });
        expect(await stock(bookId)).toEqual({ available_qty: 10, reserved_qty: 0, sold_qty: 0 });
    });

    test('admin huỷ đơn ONLINE CHƯA thanh toán → payment không bị đổi thành REFUND_PENDING', async () => {
        const bookId = await createBook({ stock: 10 });
        const order = await pendingOnlineOrder(bookId, 'plink_cancel_2');

        await request(app).put(`/api/admin/orders/${order.hashId}/status`).set(admin.auth)
            .send({ status: 'CANCELLED' }).expect(200);

        expect(await paymentStatus(order)).not.toBe('REFUND_PENDING');
        expect(await stock(bookId)).toEqual({ available_qty: 10, reserved_qty: 0, sold_qty: 0 });
    });
});

describe('Khách huỷ đơn', () => {
    test('huỷ đúng lúc PayOS xác nhận thanh toán → kho đã trừ được hoàn, payment REFUND_PENDING', async () => {
        const bookId = await createBook({ stock: 10 });
        const order = await pendingOnlineOrder(bookId, 'plink_cancel_3');

        // Hàm huỷ đọc đơn (còn PENDING) → ngay sau đó PayOS xác nhận (trừ kho) → hàm huỷ mới xử lý tiếp
        const realFindById = Order.findById.bind(Order);
        jest.spyOn(Order, 'findById').mockImplementationOnce(async (...args) => {
            const snapshot = await realFindById(...args);
            await payosConfirms('plink_cancel_3');
            return snapshot;
        });

        await request(app).put(`/api/orders/${order.hashId}/cancel`).set(customer.auth)
            .send({ cancelReason: 'Đổi ý' }).expect(200);

        expect(await orderRow(order)).toEqual({ status: 'CANCELLED', cancel_reason: 'Đổi ý' });
        expect(await stock(bookId)).toEqual({ available_qty: 10, reserved_qty: 0, sold_qty: 0 });
        expect(await paymentStatus(order)).toBe('REFUND_PENDING');
    });

    test('không có đua: khách huỷ đơn đã thanh toán → hoàn kho + REFUND_PENDING như cũ', async () => {
        const bookId = await createBook({ stock: 10 });
        const order = await pendingOnlineOrder(bookId, 'plink_cancel_4');
        await payosConfirms('plink_cancel_4');

        await request(app).put(`/api/orders/${order.hashId}/cancel`).set(customer.auth).send({}).expect(200);

        expect(await stock(bookId)).toEqual({ available_qty: 10, reserved_qty: 0, sold_qty: 0 });
        expect(await paymentStatus(order)).toBe('REFUND_PENDING');
    });

    test('khách không huỷ được đơn đang giao (câu báo giữ nguyên)', async () => {
        const bookId = await createBook({ stock: 10 });
        const order = await pendingOnlineOrder(bookId, 'plink_cancel_5');
        await payosConfirms('plink_cancel_5');
        for (const s of ['PACKAGING', 'DELIVERING']) {
            await request(app).put(`/api/admin/orders/${order.hashId}/status`).set(admin.auth).send({ status: s }).expect(200);
        }

        const res = await request(app).put(`/api/orders/${order.hashId}/cancel`).set(customer.auth).send({}).expect(400);

        expect(res.body.error).toBe('Đơn hàng đã được giao hoặc đang vận chuyển, không thể tự hủy. Vui lòng liên hệ bộ phận hỗ trợ!');
        expect((await orderRow(order)).status).toBe('DELIVERING');
    });
});
