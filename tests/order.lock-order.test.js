// B72: mọi luồng khoá nhiều dòng kho trong MỘT transaction phải khoá theo book_id tăng dần.
// Hai transaction khoá cùng các dòng theo thứ tự ngược nhau sẽ chờ nhau (deadlock) → Postgres huỷ một
// bên với 40P01 → một khách nhận lỗi 500.
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
const Inventory = require('../src/models/Inventory');
const Cart = require('../src/models/Cart');
const OrderService = require('../src/services/orderService');
const { mockPayos } = require('@payos/node');
const { resetDb, closeAll } = require('./helpers/db');
const { loginAs, createBook } = require('./helpers/fixtures');

afterAll(async () => {
    await closeAll();
});

beforeEach(async () => {
    await resetDb();
    jest.clearAllMocks();
});

afterEach(() => {
    jest.restoreAllMocks();
});

const SHIPPING = { shippingName: 'Khach Hang', shippingPhone: '0912345678', shippingAddress: '1 Duong Test' };

// Hai cuốn sách, a.id < b.id
async function twoBooks() {
    const a = await createBook({ title: 'Sach A', stock: 10 });
    const b = await createBook({ title: 'Sach B', stock: 10 });
    return { a, b };
}

async function addToCart(auth, bookId) {
    await request(app).post('/api/cart/add').set(auth).send({ bookId, quantity: 1 }).expect(200);
}

// Supertest chỉ gửi request khi được await/then → .then() để hai request chạy song song thật
function checkout(auth, paymentMethod = 'COD') {
    return request(app).post('/api/orders/checkout').set(auth).send({ ...SHIPPING, paymentMethod }).then(res => res);
}

// Đơn PENDING dựng thẳng bằng SQL để chủ động thứ tự order_items (book_id GIẢM dần), kèm giữ chỗ kho tương ứng
async function insertPendingOrder(userId, bookIds, { paymentMethod = 'COD', minutesAgo = 0 } = {}) {
    const { rows: [order] } = await pool.query(
        `INSERT INTO orders (user_id, total_amount, status, shipping_name, shipping_phone, shipping_address, payment_method, created_at)
         VALUES ($1, 100000, 'PENDING', 'Khach Hang', '0912345678', '1 Duong Test', $2, NOW() - make_interval(mins => $3))
         RETURNING id`,
        [userId, paymentMethod, minutesAgo]
    );
    for (const bookId of bookIds) {
        await pool.query('INSERT INTO order_items (order_id, book_id, quantity, price) VALUES ($1, $2, 1, 50000)', [order.id, bookId]);
        await pool.query('UPDATE inventory SET reserved_qty = reserved_qty + 1 WHERE book_id = $1', [bookId]);
    }
    return order.id;
}

// Câu lấy giỏ (json_agg) không có ORDER BY: thứ tự món tuỳ kế hoạch thực thi của Postgres (DB test tình cờ ra
// theo book_id, DB khác có thể ra theo thứ tự thêm vào giỏ). Test chủ động chọn thứ tự để tái hiện ổn định.
function cartItemsInOrder(orderByUser) {
    const realGet = Cart.getByUserId.bind(Cart);
    jest.spyOn(Cart, 'getByUserId').mockImplementation(async (userId) => {
        const cart = await realGet(userId);
        const order = orderByUser[userId];
        if (cart && order) cart.items.sort((x, y) => order.indexOf(x.bookId) - order.indexOf(y.bookId));
        return cart;
    });
}

// Ghi lại thứ tự book_id mà một hàm kho được gọi (tham số thứ 2)
function recordLockOrder(method) {
    const real = Inventory[method].bind(Inventory);
    const calls = [];
    jest.spyOn(Inventory, method).mockImplementation(async (...args) => {
        calls.push(args[1]);
        return real(...args);
    });
    return calls;
}

describe('B72: khoá kho theo book_id tăng dần', () => {
    test('hai khách đặt cùng lúc, giỏ chứa A và B theo thứ tự ngược nhau → cả hai đều đặt được', async () => {
        const { a, b } = await twoBooks();
        const first = await loginAs('CUSTOMER', 'mot@test.vn');
        const second = await loginAs('CUSTOMER', 'hai@test.vn');
        await addToCart(first.auth, a);
        await addToCart(first.auth, b);
        await addToCart(second.auth, b);
        await addToCart(second.auth, a);
        cartItemsInOrder({ [first.user.id]: [a, b], [second.user.id]: [b, a] });

        // Barrier: mỗi đơn khoá xong món ĐẦU TIÊN thì chờ đơn kia cũng khoá xong món đầu (tối đa 500ms).
        // Khoá sai thứ tự: đơn 1 giữ A, đơn 2 giữ B, rồi mỗi bên xin dòng bên kia đang giữ → deadlock.
        // Khoá đúng thứ tự: cả hai cùng xin A trước → đơn 2 chờ ngay ở món đầu, không thể giữ B.
        const realHold = Inventory.hold.bind(Inventory);
        let firstLocks = 0;
        let release;
        const bothLockedFirst = new Promise(resolve => { release = resolve; });
        jest.spyOn(Inventory, 'hold').mockImplementation(async (...args) => {
            const result = await realHold(...args);
            firstLocks += 1;
            if (firstLocks === 2) release();
            if (firstLocks <= 2) await Promise.race([bothLockedFirst, new Promise(r => setTimeout(r, 500))]);
            return result;
        });

        const results = await Promise.all([checkout(first.auth), checkout(second.auth)]);

        expect(results.map(r => r.status)).toEqual([201, 201]);
        const { rows } = await pool.query('SELECT reserved_qty FROM inventory WHERE book_id = ANY($1) ORDER BY book_id', [[a, b]]);
        expect(rows.map(r => r.reserved_qty)).toEqual([2, 2]);
    });

    test('đặt hàng: giỏ thêm B trước A vẫn giữ chỗ A trước', async () => {
        const { a, b } = await twoBooks();
        const customer = await loginAs('CUSTOMER');
        await addToCart(customer.auth, b);
        await addToCart(customer.auth, a);
        cartItemsInOrder({ [customer.user.id]: [b, a] });
        const calls = recordLockOrder('hold');

        const res = await checkout(customer.auth);

        expect(res.status).toBe(201);
        expect(calls).toEqual([a, b]);
    });

    test('khách huỷ đơn: nhả giữ chỗ theo book_id tăng dần', async () => {
        const { a, b } = await twoBooks();
        const { user } = await loginAs('CUSTOMER');
        const orderId = await insertPendingOrder(user.id, [b, a]);
        const calls = recordLockOrder('cancelReservation');

        await OrderService.cancelOrder(orderId, user.id);

        expect(calls).toEqual([a, b]);
    });

    test('quản trị xác nhận đơn: trừ kho theo book_id tăng dần', async () => {
        const { a, b } = await twoBooks();
        const { user } = await loginAs('CUSTOMER');
        const admin = await loginAs('ADMIN');
        const orderId = await insertPendingOrder(user.id, [b, a]);
        const calls = recordLockOrder('commit');

        await OrderService.updateStatusByAdmin(orderId, 'CONFIRMED', { adminId: admin.user.id });

        expect(calls).toEqual([a, b]);
    });

    test('job huỷ đơn quá hạn: nhả giữ chỗ của MỌI đơn theo book_id tăng dần', async () => {
        const { a, b } = await twoBooks();
        const { user } = await loginAs('CUSTOMER');
        await insertPendingOrder(user.id, [b], { paymentMethod: 'ONLINE', minutesAgo: 20 });
        await insertPendingOrder(user.id, [a], { paymentMethod: 'ONLINE', minutesAgo: 20 });
        const calls = recordLockOrder('cancelReservation');

        const cancelled = await OrderService.checkAndCancelExpiredOrders();

        expect(cancelled).toBe(2);
        expect(calls).toEqual([a, b]);
    });

    test('PayOS báo đã thanh toán: trừ kho theo book_id tăng dần', async () => {
        const { a, b } = await twoBooks();
        const { user } = await loginAs('CUSTOMER');
        const orderId = await insertPendingOrder(user.id, [b, a], { paymentMethod: 'ONLINE' });
        await pool.query("INSERT INTO payments (order_id, amount, payment_method, status) VALUES ($1, 100000, 'PAYOS', 'PENDING')", [orderId]);
        mockPayos.webhooks.verify.mockResolvedValue({ orderCode: orderId, paymentLinkId: 'plink_lock', amount: 100000 });
        const calls = recordLockOrder('commit');

        await request(app).post('/api/payments/payos_webhook')
            .send({ code: '00', success: true, data: { orderCode: orderId }, signature: 'sig' })
            .expect(200);

        expect(calls).toEqual([a, b]);
    });
});
