// POST /api/categories/:id/books — gán sách vào danh mục (trang quản trị).
// Giữ hành vi khi B85 đổi từ một INSERT mỗi sách sang một câu INSERT cho cả lô.
const request = require('supertest');
const app = require('../src/config/app');
const pool = require('../src/config/database');
const { resetDb, closeAll } = require('./helpers/db');
const { loginAs, createBook } = require('./helpers/fixtures');

beforeEach(resetDb);
afterAll(closeAll);

async function createCategory(name = 'Van hoc') {
    const { rows: [c] } = await pool.query('INSERT INTO categories (name) VALUES ($1) RETURNING id', [name]);
    return c.id;
}

async function linkedBookIds(categoryId) {
    const { rows } = await pool.query('SELECT book_id FROM book_categories WHERE category_id = $1 ORDER BY book_id', [categoryId]);
    return rows.map(r => r.book_id);
}

test('gán nhiều sách: chỉ trả các liên kết MỚI, bỏ qua sách đã có và mã lặp', async () => {
    const { auth } = await loginAs('ADMIN');
    const categoryId = await createCategory();
    const a = await createBook({ title: 'A' });
    const b = await createBook({ title: 'B' });
    const c = await createBook({ title: 'C' });
    await pool.query('INSERT INTO book_categories (book_id, category_id) VALUES ($1, $2)', [a, categoryId]);

    const res = await request(app).post(`/api/categories/${categoryId}/books`).set(auth).send({ bookIds: [a, b, c, b] });

    expect(res.status).toBe(200);
    expect(res.body.data.map(r => r.book_id).sort()).toEqual([b, c]);
    expect(res.body.data[0].category_id).toBe(categoryId);
    expect(await linkedBookIds(categoryId)).toEqual([a, b, c]);
});

test('danh sách rỗng → 200, không gán gì', async () => {
    const { auth } = await loginAs('ADMIN');
    const categoryId = await createCategory();

    const res = await request(app).post(`/api/categories/${categoryId}/books`).set(auth).send({ bookIds: [] });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
});

test('một mã sách không tồn tại → lỗi, không gán sách nào (cả lô trong một transaction)', async () => {
    const { auth } = await loginAs('ADMIN');
    const categoryId = await createCategory();
    const a = await createBook({ title: 'A' });

    const res = await request(app).post(`/api/categories/${categoryId}/books`).set(auth).send({ bookIds: [a, 999999] });

    expect(res.status).toBe(500);
    expect(await linkedBookIds(categoryId)).toEqual([]);
});
