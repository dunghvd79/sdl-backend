// Hồi quy lỗ hổng giả mạo thanh toán VNPay (phát hiện 11/11/2026).
// Code cũ dùng khoá bí mật dự phòng ghi cứng trong repo khi thiếu VNP_HASH_SECRET, nên ai cũng
// ký được kết quả thanh toán giả và xác nhận đơn chưa trả tiền. VNPay đã bị gỡ khỏi hệ thống.
const crypto = require('crypto');
const request = require('supertest');
const app = require('../src/config/app');
const pool = require('../src/config/database');
const Payment = require('../src/models/Payment');
const { resetDb, createUser, closeAll } = require('./helpers/db');

// Khoá sandbox đã bị lộ công khai trong lịch sử git; chỉ dùng để mô phỏng kẻ tấn công.
const LEAKED_FALLBACK_SECRET = 'NCQ4W6WIU0FTQMT4RXOM7WTLLG8LHJ4O';

afterAll(async () => {
    await closeAll();
});

function forgeVnpayQuery(orderId, amount) {
    const params = {
        vnp_Amount: String(Math.round(amount * 100)),
        vnp_ResponseCode: '00',
        vnp_TransactionNo: '99999999',
        vnp_TxnRef: String(orderId)
    };
    const signData = Object.keys(params)
        .sort()
        .map(key => `${key}=${encodeURIComponent(params[key]).replace(/%20/g, '+')}`)
        .join('&');
    params.vnp_SecureHash = crypto
        .createHmac('sha512', LEAKED_FALLBACK_SECRET)
        .update(Buffer.from(signData, 'utf-8'))
        .digest('hex');
    return new URLSearchParams(params).toString();
}

describe('Kết quả thanh toán VNPay giả mạo', () => {
    let orderId;
    let totalAmount;
    let bookId;

    beforeEach(async () => {
        await resetDb();
        delete process.env.VNP_HASH_SECRET;

        const customer = await createUser();
        const { rows: [book] } = await pool.query(
            "INSERT INTO books (title, author, price) VALUES ('Sach Test', 'Tac Gia', 100000) RETURNING id"
        );
        bookId = book.id;
        await pool.query(
            'INSERT INTO inventory (book_id, available_qty, reserved_qty, sold_qty) VALUES ($1, 10, 0, 0)',
            [bookId]
        );

        const login = await request(app)
            .post('/api/auth/login')
            .send({ email: customer.email, password: customer.password });
        const auth = { Authorization: `Bearer ${login.body.token}` };
        await request(app).post('/api/cart/add').set(auth).send({ bookId, quantity: 1 }).expect(200);
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
        orderId = checkout.body.data.id;
        totalAmount = Number(checkout.body.data.total_amount);
        // Giao dịch đang chờ, như khi khách vừa mở trang thanh toán
        await Payment.create(orderId, totalAmount, 'PAYOS');
    });

    test('không thể xác nhận đơn chưa trả tiền bằng kết quả VNPay tự ký', async () => {
        await request(app).get(`/api/payments/vnpay_return?${forgeVnpayQuery(orderId, totalAmount)}`);

        const { rows: [order] } = await pool.query('SELECT status FROM orders WHERE id = $1', [orderId]);
        const { rows: [stock] } = await pool.query(
            'SELECT available_qty, sold_qty FROM inventory WHERE book_id = $1',
            [bookId]
        );
        expect(order.status).toBe('PENDING');
        expect(stock).toEqual({ available_qty: 10, sold_qty: 0 });
    });

    test('không thể xác nhận đơn qua IPN VNPay tự ký', async () => {
        await request(app).get(`/api/payments/vnpay_ipn?${forgeVnpayQuery(orderId, totalAmount)}`);

        const { rows: [order] } = await pool.query('SELECT status FROM orders WHERE id = $1', [orderId]);
        expect(order.status).toBe('PENDING');
    });
});
