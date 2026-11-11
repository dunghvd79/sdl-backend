// Dữ liệu mẫu và đăng nhập theo vai trò cho test (spec 003).
const request = require('supertest');
const app = require('../../src/config/app');
const pool = require('../../src/config/database');
const { createUser } = require('./db');

async function loginAs(role, email = `${role.toLowerCase()}@test.vn`) {
    const user = await createUser({ email, role });
    const res = await request(app).post('/api/auth/login').send({ email: user.email, password: user.password });
    return { user, auth: { Authorization: `Bearer ${res.body.token}` } };
}

async function createBook({ title = 'Sach Test', price = 100000, stock = 10 } = {}) {
    const { rows: [book] } = await pool.query(
        "INSERT INTO books (title, author, price) VALUES ($1, 'Tac Gia', $2) RETURNING id",
        [title, price]
    );
    await pool.query(
        'INSERT INTO inventory (book_id, available_qty, reserved_qty, sold_qty) VALUES ($1, $2, 0, 0)',
        [book.id, stock]
    );
    return book.id;
}

module.exports = { loginAs, createBook };
