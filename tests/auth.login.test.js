// Test mô tả hành vi HIỆN TẠI của đăng nhập (JWT + session_id một phiên).
// Khi chuyển sang access/refresh token (bước 5), các test liên quan phiên sẽ được sửa có chủ đích.
const request = require('supertest');
const app = require('../src/config/app');
const { resetDb, createUser, closeAll } = require('./helpers/db');

afterAll(async () => {
    await closeAll();
});

describe('POST /api/auth/login', () => {
    let customer;

    beforeEach(async () => {
        await resetDb();
        customer = await createUser();
    });

    test('đúng email và mật khẩu thì trả 200 kèm token và thông tin user', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: customer.email, password: customer.password });

        expect(res.status).toBe(200);
        expect(typeof res.body.token).toBe('string');
        expect(res.body.user).toEqual({
            id: customer.id,
            email: customer.email,
            fullName: customer.full_name,
            role: 'CUSTOMER'
        });
    });

    test('sai mật khẩu thì trả 401 và không có token', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: customer.email, password: 'sai-mat-khau-1' });

        expect(res.status).toBe(401);
        expect(res.body.token).toBeUndefined();
        expect(res.body.error).toBe('Email hoặc mật khẩu không chính xác!');
    });

    test('email không tồn tại trả cùng thông báo như sai mật khẩu', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'khong-ton-tai@test.vn', password: 'password123' });

        expect(res.status).toBe(401);
        expect(res.body.error).toBe('Email hoặc mật khẩu không chính xác!');
    });

    test('thiếu email hoặc mật khẩu thì trả 400', async () => {
        const res = await request(app).post('/api/auth/login').send({ email: customer.email });

        expect(res.status).toBe(400);
    });

    test('tài khoản bị khoá thì không đăng nhập được', async () => {
        const pool = require('../src/config/database');
        await pool.query('UPDATE users SET is_active = false WHERE id = $1', [customer.id]);

        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: customer.email, password: customer.password });

        expect(res.status).toBe(401);
        expect(res.body.token).toBeUndefined();
    });
});

describe('GET /api/auth/profile', () => {
    let customer;

    beforeEach(async () => {
        await resetDb();
        customer = await createUser();
    });

    async function login() {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: customer.email, password: customer.password });
        return res.body.token;
    }

    test('có token hợp lệ thì xem được hồ sơ của chính mình', async () => {
        const token = await login();

        const res = await request(app).get('/api/auth/profile').set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.user.id).toBe(customer.id);
    });

    test('không có token thì trả 401', async () => {
        const res = await request(app).get('/api/auth/profile');

        expect(res.status).toBe(401);
    });

    test('token giả mạo thì trả 401', async () => {
        const res = await request(app)
            .get('/api/auth/profile')
            .set('Authorization', 'Bearer khong.phai.token');

        expect(res.status).toBe(401);
    });

    // Spec 002 đổi có chủ đích: cho phép nhiều thiết bị (trước đây đăng nhập lần hai đá token cũ ra).
    test('đăng nhập lần hai, token cũ vẫn dùng được', async () => {
        const oldToken = await login();
        await login();

        const res = await request(app).get('/api/auth/profile').set('Authorization', `Bearer ${oldToken}`);

        expect(res.status).toBe(200);
    });
});
