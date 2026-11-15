// G1/G3/G4 (đối chiếu CV): cache sách và danh mục phải được xoá khi dữ liệu thay đổi, kể cả tồn kho đổi
// do đặt hàng / thanh toán / huỷ đơn; xoá theo mẫu bằng SCAN (không dùng KEYS chặn Redis).
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
const redis = require('../src/config/redis');
const Payment = require('../src/models/Payment');
const OrderService = require('../src/services/orderService');
const { mockPayos } = require('@payos/node');
const { resetDb, closeAll } = require('./helpers/db');
const { loginAs, createBook } = require('./helpers/fixtures');

let customer;
let admin;

async function waitForRedis() {
    for (let i = 0; i < 50 && !redis.isConnected(); i++) {
        await new Promise(r => setTimeout(r, 100));
    }
    if (!redis.isConnected()) throw new Error('Redis test (cổng 6380) chưa kết nối — test cache sẽ không có ý nghĩa');
}

afterAll(async () => {
    await closeAll();
});

beforeAll(async () => {
    await waitForRedis();
    await resetDb();
    customer = await loginAs('CUSTOMER');
    admin = await loginAs('ADMIN');
});

// Fixture tạo sách bằng SQL trực tiếp (không qua API) nên phải xoá cache trước mỗi test,
// nếu không danh sách đã cache từ test trước sẽ không có sách mới.
beforeEach(async () => {
    await redis.client.flushDb();
});

// Tồn kho của một sách như danh sách sách (có cache) đang trả về.
// Lưu ý: API trả available_qty = số CÒN BÁN ĐƯỢC (available_qty - reserved_qty trong DB, xem Book.js).
async function listedStock(bookId) {
    const res = await request(app).get('/api/books?limit=50');
    const book = res.body.data.find(b => b.id === bookId);
    return { available: book.available_qty, reserved: book.reserved_qty };
}

async function placeOrder(bookId, paymentMethod) {
    await request(app).post('/api/cart/add').set(customer.auth).send({ bookId, quantity: 2 }).expect(200);
    const res = await request(app).post('/api/orders/checkout').set(customer.auth).send({
        shippingName: 'Khach Hang', shippingPhone: '0912345678',
        shippingAddress: '1 Duong Test', paymentMethod
    }).expect(201);
    return res.body.data;
}

describe('G1: tồn kho đổi thì cache danh sách sách được làm mới', () => {
    test('đặt hàng (giữ hàng)', async () => {
        const bookId = await createBook({ stock: 10 });
        expect(await listedStock(bookId)).toEqual({ available: 10, reserved: 0 }); // ghi cache

        await placeOrder(bookId, 'COD');

        expect(await listedStock(bookId)).toEqual({ available: 8, reserved: 2 });
    });

    test('khách huỷ đơn', async () => {
        const bookId = await createBook({ stock: 10 });
        const order = await placeOrder(bookId, 'COD');
        expect(await listedStock(bookId)).toEqual({ available: 8, reserved: 2 }); // ghi cache

        await request(app).put(`/api/orders/${order.hashId}/cancel`).set(customer.auth).send({}).expect(200);

        expect(await listedStock(bookId)).toEqual({ available: 10, reserved: 0 });
    });

    test('đơn ONLINE quá hạn tự huỷ', async () => {
        const bookId = await createBook({ stock: 10 });
        const order = await placeOrder(bookId, 'ONLINE');
        expect(await listedStock(bookId)).toEqual({ available: 8, reserved: 2 });
        await pool.query("UPDATE orders SET created_at = NOW() - INTERVAL '20 minutes' WHERE id = $1", [order.id]);

        await OrderService.checkAndCancelExpiredOrders();

        expect(await listedStock(bookId)).toEqual({ available: 10, reserved: 0 });
    });

    test('thanh toán PayOS thành công (trừ kho)', async () => {
        const bookId = await createBook({ stock: 10 });
        const order = await placeOrder(bookId, 'ONLINE');
        await Payment.create(order.id, Number(order.total_amount), 'PAYOS');
        mockPayos.paymentRequests.get.mockResolvedValue({ id: 'plink_cache', orderCode: order.id, status: 'PAID' });
        expect(await listedStock(bookId)).toEqual({ available: 8, reserved: 2 });

        await request(app).get('/api/payments/payos_return?id=plink_cache&code=00&status=PAID').expect(302);

        expect(await listedStock(bookId)).toEqual({ available: 8, reserved: 0 }); // DB: 8 tồn, 0 giữ chỗ
    });

    test('admin huỷ đơn đang chờ', async () => {
        const bookId = await createBook({ stock: 10 });
        const order = await placeOrder(bookId, 'COD');
        expect(await listedStock(bookId)).toEqual({ available: 8, reserved: 2 });

        await request(app).put(`/api/admin/orders/${order.hashId}/status`).set(admin.auth)
            .send({ status: 'CANCELLED' }).expect(200);

        expect(await listedStock(bookId)).toEqual({ available: 10, reserved: 0 });
    });
});

describe('G3: gán sách vào danh mục làm mới cache danh mục', () => {
    test('số sách của danh mục cập nhật ngay', async () => {
        const bookId = await createBook();
        const created = await request(app).post('/api/categories').set(admin.auth).send({ name: 'Danh muc cache' }).expect(201);
        const categoryId = created.body.data.id;
        const countOf = async () => (await request(app).get('/api/categories')).body.data.find(c => c.id === categoryId).book_count;
        expect(Number(await countOf())).toBe(0); // ghi cache

        await request(app).post(`/api/categories/${categoryId}/books`).set(admin.auth).send({ bookIds: [bookId] }).expect(200);

        expect(Number(await countOf())).toBe(1);
    });
});

describe('G4: xoá cache theo mẫu không dùng KEYS', () => {
    test('chỉ xoá đúng các key khớp mẫu, bằng SCAN', async () => {
        await redis.client.set('books:test:a', '1');
        await redis.client.set('books:test:b', '1');
        await redis.client.set('other:test', '1');
        const keysSpy = jest.spyOn(redis.client, 'keys');

        await redis.clearCachePattern('books:test:*');

        expect(keysSpy).not.toHaveBeenCalled();
        expect(await redis.client.exists('books:test:a')).toBe(0);
        expect(await redis.client.exists('books:test:b')).toBe(0);
        expect(await redis.client.exists('other:test')).toBe(1);
        keysSpy.mockRestore();
    });
});
