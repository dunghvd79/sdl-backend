// Xử lý lỗi tập trung (spec 001): lỗi hệ thống không lộ chi tiết nội bộ (US1),
// JSON hỏng / đường dẫn sai / trùng dữ liệu nhận phản hồi rõ ràng (US3).
// Lỗi DB được mô phỏng bằng jest.spyOn trên model (research R7): thứ được kiểm thử là
// middleware lỗi, không phải model.
const request = require('supertest');
const app = require('../src/config/app');
const Order = require('../src/models/Order');
const Book = require('../src/models/Book');
const { SYSTEM_ERROR_MESSAGE } = require('../src/middleware/errorHandler');
const { resetDb, createUser, closeAll } = require('./helpers/db');

const DB_ERROR = 'relation "orders_secret_table" does not exist';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

let consoleErrorSpy;

afterAll(async () => {
    await closeAll();
});

beforeEach(async () => {
    await resetDb();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    jest.restoreAllMocks();
});

async function loginAs(role = 'CUSTOMER', email = `${role.toLowerCase()}@test.vn`) {
    const user = await createUser({ email, role });
    const res = await request(app).post('/api/auth/login').send({ email: user.email, password: user.password });
    return { Authorization: `Bearer ${res.body.token}` };
}

function expectNoLeak(res) {
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain('orders_secret_table');
    expect(raw).not.toContain('relation');
}

describe('US1: lỗi hệ thống không lộ chi tiết nội bộ', () => {
    test('API trước đây trả 500 kèm err.message → 500 chung + errorId', async () => {
        const auth = await loginAs();
        jest.spyOn(Order, 'getUserOrders').mockRejectedValueOnce(new Error(DB_ERROR));

        const res = await request(app).get('/api/orders').set(auth);

        expect(res.status).toBe(500);
        expect(res.body.error).toBe(SYSTEM_ERROR_MESSAGE);
        expect(res.body.errorId).toMatch(UUID_RE);
        expectNoLeak(res);
    });

    test('API trước đây trả 400 kèm err.message → lỗi DB thành 500 chung', async () => {
        const auth = await loginAs();
        jest.spyOn(Book, 'findById').mockRejectedValueOnce(new Error(DB_ERROR));

        const res = await request(app).post('/api/cart/add').set(auth).send({ bookId: 1, quantity: 1 });

        expect(res.status).toBe(500);
        expect(res.body.error).toBe(SYSTEM_ERROR_MESSAGE);
        expectNoLeak(res);
    });

    test('nhật ký máy chủ có errorId và thông báo gốc để tra cứu', async () => {
        const auth = await loginAs();
        jest.spyOn(Order, 'getUserOrders').mockRejectedValueOnce(new Error(DB_ERROR));

        const res = await request(app).get('/api/orders').set(auth);

        const logged = consoleErrorSpy.mock.calls.map(args => args.join(' ')).join('\n');
        expect(logged).toContain(res.body.errorId);
        expect(logged).toContain(DB_ERROR);
    });
});

describe('US3: JSON hỏng, đường dẫn sai, trùng dữ liệu', () => {
    test('nội dung JSON sai cú pháp → 400 tiếng Việt', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .set('Content-Type', 'application/json')
            .send('{"email": "a@test.vn", ');

        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: 'Dữ liệu gửi lên không đúng định dạng JSON.' });
    });

    test('đường dẫn /api không tồn tại → 404 JSON', async () => {
        const res = await request(app).get('/api/khong-ton-tai');

        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error: 'Không tìm thấy đường dẫn API.' });
    });

    test('tạo danh mục trùng tên → 400, không lộ tên ràng buộc DB', async () => {
        const auth = await loginAs('ADMIN');
        await request(app).post('/api/categories').set(auth).send({ name: 'Văn học' }).expect(201);

        const res = await request(app).post('/api/categories').set(auth).send({ name: 'Văn học' });

        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: 'Dữ liệu này đã tồn tại.' });
    });
});
