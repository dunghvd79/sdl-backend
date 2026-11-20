// B73: chống bán vượt tồn kho khi hai khách đặt CÙNG LÚC cuốn cuối cùng (câu CV "Prevented overselling").
// Inventory.hold khoá dòng kho (SELECT ... FOR UPDATE) trong transaction đặt hàng: đơn đến sau phải chờ,
// đọc lại số mới nhất và nhận "Kho chỉ còn 0 cuốn". Bỏ khoá thì cả hai cùng thấy "còn 1".
const request = require('supertest');
const app = require('../src/config/app');
const pool = require('../src/config/database');
const Order = require('../src/models/Order');
const { resetDb, closeAll } = require('./helpers/db');
const { loginAs, createBook } = require('./helpers/fixtures');

afterAll(async () => {
    await closeAll();
});

beforeEach(async () => {
    await resetDb();
});

afterEach(() => {
    jest.restoreAllMocks();
});

const SHIPPING = { shippingName: 'Khach Hang', shippingPhone: '0912345678', shippingAddress: '1 Duong Test', paymentMethod: 'COD' };

// Supertest chỉ gửi request khi được await/then → .then() để hai request chạy song song thật
function checkout(auth) {
    return request(app).post('/api/orders/checkout').set(auth).send(SHIPPING).then(res => res);
}

// Barrier ngay TRƯỚC bước giữ chỗ (Order.create chạy ngay trước vòng Inventory.hold): mỗi đơn tới đây thì chờ
// đơn kia cũng tới (tối đa 500ms) → cả hai cùng bước vào hold gần như đồng thời. Không có barrier thì đơn
// đầu thường COMMIT xong trước khi đơn sau kịp đọc kho, test qua cả khi thiếu khoá.
function bothReachHoldTogether() {
    const realCreate = Order.create.bind(Order);
    let arrived = 0;
    let release;
    const bothArrived = new Promise(resolve => { release = resolve; });
    jest.spyOn(Order, 'create').mockImplementation(async (...args) => {
        const order = await realCreate(...args);
        arrived += 1;
        if (arrived >= 2) release();
        await Promise.race([bothArrived, new Promise(r => setTimeout(r, 500))]);
        return order;
    });
}

describe('B73: hai khách tranh cuốn cuối cùng', () => {
    test('kho còn 1, hai đơn đặt cùng lúc → đúng một đơn thành công, đơn kia báo hết hàng', async () => {
        const bookId = await createBook({ stock: 1 });
        const an = await loginAs('CUSTOMER', 'an@test.vn');
        const binh = await loginAs('CUSTOMER', 'binh@test.vn');
        await request(app).post('/api/cart/add').set(an.auth).send({ bookId, quantity: 1 }).expect(200);
        await request(app).post('/api/cart/add').set(binh.auth).send({ bookId, quantity: 1 }).expect(200);
        bothReachHoldTogether();

        const results = await Promise.all([checkout(an.auth), checkout(binh.auth)]);

        expect(results.map(r => r.status).sort()).toEqual([201, 400]);
        expect(results.find(r => r.status === 400).body.error).toBe('Kho chỉ còn 0 cuốn');
        const { rows: [inv] } = await pool.query('SELECT available_qty, reserved_qty FROM inventory WHERE book_id = $1', [bookId]);
        expect(inv).toEqual({ available_qty: 1, reserved_qty: 1 });
        const { rows: [{ n }] } = await pool.query('SELECT COUNT(*)::int AS n FROM orders');
        expect(n).toBe(1); // đơn thua bị ROLLBACK, không để lại đơn "ma"
    });
});
