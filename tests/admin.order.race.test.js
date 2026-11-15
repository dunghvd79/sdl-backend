// B41: admin đổi trạng thái đơn đúng lúc PayOS xác nhận thanh toán cùng đơn.
// Tái hiện tất định: PayOS xác nhận đơn NGAY SAU khi admin đọc trạng thái (spy Order.findById vẫn gọi
// hàm thật, chỉ chèn bước xác nhận thanh toán vào giữa). PayOS là dịch vụ ngoài nên được giả lập.
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

// Đơn ONLINE 2 cuốn đang chờ thanh toán, PayOS sẵn sàng báo PAID
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

// Admin đọc đơn (còn PENDING) → ngay sau đó PayOS xác nhận đơn → admin mới xử lý
function payosConfirmsRightAfterAdminReads(linkId) {
    const realFindById = Order.findById.bind(Order);
    jest.spyOn(Order, 'findById').mockImplementationOnce(async (...args) => {
        const snapshot = await realFindById(...args);
        await request(app).get(`/api/payments/payos_return?id=${linkId}&code=00&status=PAID`).expect(302);
        return snapshot;
    });
}

describe('B41: admin đổi trạng thái đơn đua với xác nhận thanh toán', () => {
    test('admin xác nhận đúng lúc PayOS xác nhận → kho chỉ bị trừ một lần', async () => {
        const bookId = await createBook({ stock: 10 });
        const order = await pendingOnlineOrder(bookId, 'plink_race_1');
        payosConfirmsRightAfterAdminReads('plink_race_1');

        await request(app).put(`/api/admin/orders/${order.hashId}/status`).set(admin.auth)
            .send({ status: 'CONFIRMED' }).expect(200);

        expect(await stock(bookId)).toEqual({ available_qty: 8, reserved_qty: 0, sold_qty: 2 });
    });

    test('admin huỷ đúng lúc PayOS xác nhận → hàng đã bán được hoàn lại kho', async () => {
        const bookId = await createBook({ stock: 10 });
        const order = await pendingOnlineOrder(bookId, 'plink_race_2');
        payosConfirmsRightAfterAdminReads('plink_race_2');

        await request(app).put(`/api/admin/orders/${order.hashId}/status`).set(admin.auth)
            .send({ status: 'CANCELLED' }).expect(200);

        const { rows: [o] } = await pool.query('SELECT status FROM orders WHERE id = $1', [order.id]);
        expect(o.status).toBe('CANCELLED');
        expect(await stock(bookId)).toEqual({ available_qty: 10, reserved_qty: 0, sold_qty: 0 });
    });

    test('không có đua: admin xác nhận đơn chờ thì trừ kho một lần như cũ', async () => {
        const bookId = await createBook({ stock: 10 });
        const order = await pendingOnlineOrder(bookId, 'plink_race_3');

        await request(app).put(`/api/admin/orders/${order.hashId}/status`).set(admin.auth)
            .send({ status: 'CONFIRMED' }).expect(200);

        expect(await stock(bookId)).toEqual({ available_qty: 8, reserved_qty: 0, sold_qty: 2 });
    });
});
