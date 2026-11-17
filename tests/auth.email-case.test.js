// B55 — Email không phân biệt chữ hoa/thường: `A@gmail.com` và `a@gmail.com` là MỘT tài khoản.
jest.mock('../src/queues/emailQueue', () => ({
    emailQueue: { close: jest.fn().mockResolvedValue() },
    queueResetPasswordEmail: jest.fn().mockResolvedValue()
}));

const request = require('supertest');
const app = require('../src/config/app');
const pool = require('../src/config/database');
const { queueResetPasswordEmail } = require('../src/queues/emailQueue');
const { resetDb, closeAll } = require('./helpers/db');

afterAll(async () => {
    await closeAll();
});

beforeEach(async () => {
    await resetDb();
    jest.clearAllMocks();
});

function register(email) {
    return request(app).post('/api/auth/register')
        .send({ email, password: 'matkhau123', fullName: 'Khach Hang' });
}

function login(email, password = 'matkhau123') {
    return request(app).post('/api/auth/login').send({ email, password });
}

// Dữ liệu cũ (trước bản sửa) có thể còn email viết hoa trong DB
async function insertLegacyUser(email) {
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash('matkhau123', 4);
    await pool.query(
        "INSERT INTO users (email, password_hash, full_name, role) VALUES ($1, $2, 'Nguoi Cu', 'CUSTOMER')",
        [email, hash]
    );
}

describe('B55: email không phân biệt hoa thường', () => {
    it('đăng ký lưu email chữ thường; đăng nhập bằng kiểu chữ khác vẫn được', async () => {
        const res = await register('  Dung.Nguyen@Example.COM ').expect(201);
        expect(res.body.user.email).toBe('dung.nguyen@example.com');

        const { rows } = await pool.query('SELECT email FROM users');
        expect(rows.map(r => r.email)).toEqual(['dung.nguyen@example.com']);

        await login('DUNG.NGUYEN@example.com').expect(200);
    });

    it('đăng ký lại cùng email khác kiểu chữ → báo đã đăng ký, không tạo tài khoản thứ hai', async () => {
        await register('khach@test.vn').expect(201);
        const res = await register('KHACH@Test.VN').expect(400);
        expect(res.body.error).toBe('Email này đã được đăng ký!');

        const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM users');
        expect(rows[0].n).toBe(1);
    });

    it('tài khoản cũ lưu email viết hoa: đăng nhập bằng chữ thường được, đăng ký trùng bị chặn', async () => {
        await insertLegacyUser('Old.User@Test.vn');

        await login('old.user@test.vn').expect(200);
        await register('old.user@test.vn').expect(400);
    });

    it('quên mật khẩu bằng email khác kiểu chữ vẫn gửi mã cho đúng tài khoản', async () => {
        await insertLegacyUser('Quen@Test.vn');

        await request(app).post('/api/auth/forgot-password').send({ email: 'QUEN@test.VN' }).expect(200);

        expect(queueResetPasswordEmail).toHaveBeenCalledTimes(1);
        expect(queueResetPasswordEmail.mock.calls[0][0]).toBe('Quen@Test.vn');
    });

    it('DB chặn hai email chỉ khác kiểu chữ (unique index trên LOWER(email))', async () => {
        await insertLegacyUser('Trung@Test.vn');
        await expect(insertLegacyUser('trung@test.vn')).rejects.toMatchObject({ code: '23505' });
    });
});
