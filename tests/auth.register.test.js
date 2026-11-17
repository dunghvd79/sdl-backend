// B57 — Đăng ký đã cấp phiên: response phải dùng được ngay (cùng dạng user với đăng nhập),
// để giao diện không phải gọi thêm /auth/login.
const request = require('supertest');
const app = require('../src/config/app');
const pool = require('../src/config/database');
const { resetDb, closeAll } = require('./helpers/db');
const { getRefreshCookie } = require('./helpers/auth');

afterAll(async () => {
    await closeAll();
});

beforeEach(async () => {
    await resetDb();
});

describe('POST /api/auth/register', () => {
    it('trả user cùng dạng với đăng nhập (không lộ cột DB), kèm access token và cookie phiên', async () => {
        const res = await request(app).post('/api/auth/register')
            .send({ email: 'moi@test.vn', password: 'matkhau123', fullName: 'Khach Moi' })
            .expect(201);

        const login = await request(app).post('/api/auth/login')
            .send({ email: 'moi@test.vn', password: 'matkhau123' })
            .expect(200);

        expect(Object.keys(res.body.user).sort()).toEqual(Object.keys(login.body.user).sort());
        expect(res.body.user).toEqual({ id: expect.any(Number), email: 'moi@test.vn', fullName: 'Khach Moi', role: 'CUSTOMER' });
        expect(typeof res.body.token).toBe('string');
        expect(getRefreshCookie(res)).toBeTruthy();
    });

    it('mỗi lần đăng ký tạo đúng 1 phiên', async () => {
        await request(app).post('/api/auth/register')
            .send({ email: 'motphien@test.vn', password: 'matkhau123', fullName: 'Khach Moi' })
            .expect(201);

        const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM refresh_tokens');
        expect(rows[0].n).toBe(1);
    });
});
