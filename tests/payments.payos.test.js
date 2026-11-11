// Kiểm thử xử lý kết quả thanh toán PayOS: phải trừ kho đúng MỘT lần cho mỗi đơn,
// dù return URL bị gọi lại, webhook đến sau return URL, hay hai yêu cầu đến đồng thời.
// PayOS là dịch vụ bên ngoài nên được giả lập; giỏ hàng, đặt hàng, kho, DB chạy thật.
jest.mock('@payos/node', () => {
    const mockPayos = {
        paymentRequests: { create: jest.fn(), get: jest.fn() },
        webhooks: { verify: jest.fn() }
    };
    return { PayOS: jest.fn(() => mockPayos), mockPayos };
});

process.env.PAYOS_CLIENT_ID = 'test-client';
process.env.PAYOS_API_KEY = 'test-api-key';
process.env.PAYOS_CHECKSUM_KEY = 'test-checksum';

const request = require('supertest');
const app = require('../src/config/app');
const pool = require('../src/config/database');
const { mockPayos } = require('@payos/node');
const { resetDb, createUser, closeAll } = require('./helpers/db');

const QUANTITY = 2;
const INITIAL_STOCK = 10;
const PAYMENT_LINK_ID = 'plink_test_1';

afterAll(async () => {
    await closeAll();
});

// Dựng một đơn ONLINE đang chờ thanh toán qua đúng các API mà frontend gọi.
async function createPendingOnlineOrder() {
    const customer = await createUser();
    const { rows: [book] } = await pool.query(
        "INSERT INTO books (title, author, price) VALUES ('Sach Test', 'Tac Gia', 100000) RETURNING id"
    );
    await pool.query(
        'INSERT INTO inventory (book_id, available_qty, reserved_qty, sold_qty) VALUES ($1, $2, 0, 0)',
        [book.id, INITIAL_STOCK]
    );

    const login = await request(app)
        .post('/api/auth/login')
        .send({ email: customer.email, password: customer.password });
    const auth = { Authorization: `Bearer ${login.body.token}` };

    await request(app).post('/api/cart/add').set(auth).send({ bookId: book.id, quantity: QUANTITY }).expect(200);

    const checkout = await request(app)
        .post('/api/orders/checkout')
        .set(auth)
        .send({
            shippingName: 'Khach Hang Test',
            shippingPhone: '0912345678',
            shippingAddress: '1 Duong Test, Ha Noi',
            paymentMethod: 'ONLINE'
        })
        .expect(201);
    const order = checkout.body.data;

    mockPayos.paymentRequests.create.mockResolvedValue({ checkoutUrl: 'https://pay.test/checkout' });
    await request(app).get(`/api/payments/url/${order.hashId}`).set(auth).expect(200);

    mockPayos.paymentRequests.get.mockResolvedValue({
        id: PAYMENT_LINK_ID,
        orderCode: order.id,
        status: 'PAID'
    });
    mockPayos.webhooks.verify.mockResolvedValue({
        orderCode: order.id,
        paymentLinkId: PAYMENT_LINK_ID,
        amount: Number(order.total_amount)
    });

    return { orderId: order.id, bookId: book.id };
}

async function getInventory(bookId) {
    const { rows } = await pool.query(
        'SELECT available_qty, reserved_qty, sold_qty FROM inventory WHERE book_id = $1',
        [bookId]
    );
    return rows[0];
}

async function getOrderStatus(orderId) {
    const { rows } = await pool.query('SELECT status FROM orders WHERE id = $1', [orderId]);
    return rows[0].status;
}

function callReturnUrl() {
    return request(app).get(`/api/payments/payos_return?id=${PAYMENT_LINK_ID}&code=00&status=PAID`);
}

function callWebhook(orderId) {
    return request(app)
        .post('/api/payments/payos_webhook')
        .send({ code: '00', desc: 'success', success: true, data: { orderCode: orderId }, signature: 'sig' });
}

const STOCK_AFTER_ONE_SALE = {
    available_qty: INITIAL_STOCK - QUANTITY,
    reserved_qty: 0,
    sold_qty: QUANTITY
};

describe('Xử lý kết quả thanh toán PayOS', () => {
    beforeEach(async () => {
        await resetDb();
        jest.clearAllMocks();
    });

    test('một lần quay về từ PayOS: xác nhận đơn và trừ kho một lần', async () => {
        const { orderId, bookId } = await createPendingOnlineOrder();

        const res = await callReturnUrl();

        expect(res.status).toBe(302);
        expect(res.headers.location).toContain('status=success');
        expect(await getOrderStatus(orderId)).toBe('CONFIRMED');
        expect(await getInventory(bookId)).toEqual(STOCK_AFTER_ONE_SALE);
    });

    test('return URL bị gọi lại lần hai không trừ kho thêm', async () => {
        const { bookId } = await createPendingOnlineOrder();

        await callReturnUrl();
        const second = await callReturnUrl();

        expect(second.headers.location).toContain('status=success');
        expect(await getInventory(bookId)).toEqual(STOCK_AFTER_ONE_SALE);
    });

    test('webhook đến sau return URL không trừ kho thêm', async () => {
        const { orderId, bookId } = await createPendingOnlineOrder();

        await callReturnUrl();
        const webhook = await callWebhook(orderId);

        expect(webhook.status).toBe(200);
        expect(await getInventory(bookId)).toEqual(STOCK_AFTER_ONE_SALE);
    });

    test('return URL và webhook đến đồng thời chỉ trừ kho một lần', async () => {
        const { orderId, bookId } = await createPendingOnlineOrder();

        await Promise.all([callReturnUrl(), callWebhook(orderId), callReturnUrl()]);

        expect(await getOrderStatus(orderId)).toBe('CONFIRMED');
        expect(await getInventory(bookId)).toEqual(STOCK_AFTER_ONE_SALE);
    });

    test('đơn đã bị huỷ thì tiền về sau không làm sống lại đơn và không trừ kho', async () => {
        const { orderId, bookId } = await createPendingOnlineOrder();
        // Mô phỏng job huỷ đơn ONLINE quá hạn 15 phút đã chạy trước khi PayOS báo về
        await pool.query("UPDATE orders SET created_at = NOW() - INTERVAL '20 minutes' WHERE id = $1", [orderId]);
        const OrderService = require('../src/services/orderService');
        await OrderService.checkAndCancelExpiredOrders();
        expect(await getOrderStatus(orderId)).toBe('CANCELLED');

        const res = await callReturnUrl();

        expect(res.headers.location).toContain('status=fail');
        expect(await getOrderStatus(orderId)).toBe('CANCELLED');
        expect(await getInventory(bookId)).toEqual({
            available_qty: INITIAL_STOCK,
            reserved_qty: 0,
            sold_qty: 0
        });
        const { rows: [payment] } = await pool.query(
            'SELECT status FROM payments WHERE order_id = $1 ORDER BY id DESC LIMIT 1',
            [orderId]
        );
        // Tiền đã thật sự về: phải được ghi nhận để quản trị viên hoàn tiền
        expect(payment.status).toBe('REFUND_PENDING');
    });
});
