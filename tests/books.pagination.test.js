// B87: phân trang danh sách sách (offset, trang chủ 8 cuốn / trang).
// (1) Sách trùng giá / trùng thời điểm tạo phải có thứ tự CỐ ĐỊNH (phân định bằng id) — nếu không, cùng một
//     cuốn có thể hiện ở hai trang và cuốn khác không bao giờ hiện.
// (2) API trả `pagination.has_more` để giao diện biết còn trang sau (trước đây đoán bằng "đủ 8 cuốn").
const request = require('supertest');
const app = require('../src/config/app');
const pool = require('../src/config/database');
const { resetDb, closeAll } = require('./helpers/db');

beforeEach(resetDb);
afterAll(closeAll);

// n sách CÙNG giá, CÙNG created_at (một câu INSERT = một NOW()), như dữ liệu seed. Trả id theo thứ tự tạo.
async function createTiedBooks(n, price = 100000) {
    const { rows } = await pool.query(
        `INSERT INTO books (title, author, price)
         SELECT 'Sach ' || g, 'Tac Gia', $2 FROM generate_series(1, $1) AS g
         RETURNING id`,
        [n, price]
    );
    return rows.map(r => r.id);
}

async function allPages(query, limit) {
    const seen = [];
    for (let page = 1; page <= 10; page++) {
        const res = await request(app).get('/api/books').query({ ...query, page, limit }).expect(200);
        seen.push(...res.body.data.map(b => b.id));
        if (!res.body.pagination.has_more) break;
    }
    return seen;
}

describe('thứ tự cố định khi trùng giá / trùng thời điểm tạo', () => {
    test.each([
        ['mặc định (mới nhất)', {}],
        ['giá tăng dần', { sortBy: 'price_asc' }],
        ['giá giảm dần', { sortBy: 'price_desc' }]
    ])('%s: đi hết các trang thấy mỗi sách đúng một lần, sách tạo sau đứng trước', async (_name, query) => {
        const ids = await createTiedBooks(10);

        const seen = await allPages(query, 3);

        expect(seen).toEqual([...ids].reverse());
    });

    test('cũ nhất: sách tạo trước đứng trước', async () => {
        const ids = await createTiedBooks(10);

        expect(await allPages({ sortBy: 'oldest' }, 3)).toEqual(ids);
    });
});

describe('pagination.has_more', () => {
    test('9 sách, 8 / trang: trang 1 còn trang sau, trang 2 thì hết', async () => {
        await createTiedBooks(9);

        const p1 = await request(app).get('/api/books').query({ page: 1, limit: 8 }).expect(200);
        const p2 = await request(app).get('/api/books').query({ page: 2, limit: 8 }).expect(200);

        expect(p1.body.data).toHaveLength(8);
        expect(p1.body.pagination).toEqual({ page: 1, limit: 8, total_in_page: 8, has_more: true });
        expect(p2.body.data).toHaveLength(1);
        expect(p2.body.pagination.has_more).toBe(false);
    });

    test('đúng 8 sách: trang 1 KHÔNG còn trang sau (trước đây giao diện vẫn bật nút "Sau")', async () => {
        await createTiedBooks(8);

        const res = await request(app).get('/api/books').query({ page: 1, limit: 8 }).expect(200);

        expect(res.body.data).toHaveLength(8);
        expect(res.body.pagination.has_more).toBe(false);
    });

    test('lần đọc từ cache trả cùng has_more', async () => {
        await createTiedBooks(9);

        const miss = await request(app).get('/api/books').query({ page: 1, limit: 8 }).expect(200);
        const hit = await request(app).get('/api/books').query({ page: 1, limit: 8 }).expect(200);

        expect(hit.body.pagination).toEqual(miss.body.pagination);
        expect(hit.body.data.map(b => b.id)).toEqual(miss.body.data.map(b => b.id));
    });
});
