// B77: tạo / sửa sách phải nguyên tử (một transaction) và xoá cache sách TRƯỚC khi trả response.
// Xoá cache được làm chậm 300ms để lộ lỗi "trả 200 rồi mới xoá cache": giao diện tải lại ngay sẽ đọc trúng bản cũ.
jest.mock('../src/config/redis', () => {
    const actual = jest.requireActual('../src/config/redis');
    const slowClear = async (pattern) => {
        await new Promise(r => setTimeout(r, 300));
        return actual.clearCachePattern(pattern);
    };
    return { ...actual, clearCachePattern: jest.fn(slowClear), invalidateBookCache: jest.fn(() => slowClear('books:*')) };
});

const request = require('supertest');
const app = require('../src/config/app');
const pool = require('../src/config/database');
const redis = require('../src/config/redis');
const { resetDb, closeAll } = require('./helpers/db');
const { loginAs, createBook } = require('./helpers/fixtures');

const MISSING_CATEGORY = 999999;
let admin;

async function waitForRedis() {
    for (let i = 0; i < 50 && !redis.isConnected(); i++) {
        await new Promise(r => setTimeout(r, 100));
    }
    if (!redis.isConnected()) throw new Error('Redis test (cổng 6380) chưa kết nối — test cache sẽ không có ý nghĩa');
}

async function createCategory(name) {
    const { rows: [c] } = await pool.query('INSERT INTO categories (name) VALUES ($1) RETURNING id', [name]);
    return c.id;
}

async function categoriesOf(bookId) {
    const { rows } = await pool.query('SELECT category_id FROM book_categories WHERE book_id = $1 ORDER BY category_id', [bookId]);
    return rows.map(r => r.category_id);
}

async function imagesOf(bookId) {
    const { rows } = await pool.query('SELECT image_url FROM book_images WHERE book_id = $1 ORDER BY display_order', [bookId]);
    return rows.map(r => r.image_url);
}

const bookPayload = (overrides = {}) => ({
    title: 'Sach Moi', author: 'Tac Gia', price: 120000, status: 'PUBLISHED', ...overrides
});

afterAll(async () => {
    await closeAll();
});

beforeAll(async () => {
    await waitForRedis();
});

beforeEach(async () => {
    await resetDb();
    admin = await loginAs('ADMIN');
});

describe('B77: sửa sách là một transaction', () => {
    test('mã danh mục không tồn tại → 400, sách giữ nguyên tên, danh mục và ảnh cũ', async () => {
        const bookId = await createBook({ title: 'Sach Goc' });
        const oldCat = await createCategory('Danh muc cu');
        const newCat = await createCategory('Danh muc moi');
        await pool.query('INSERT INTO book_categories (book_id, category_id) VALUES ($1, $2)', [bookId, oldCat]);
        await pool.query("INSERT INTO book_images (book_id, image_url, display_order) VALUES ($1, 'https://img/cu.jpg', 0)", [bookId]);

        const res = await request(app).put(`/api/books/${bookId}`).set(admin.auth).send(bookPayload({
            categories: [newCat, MISSING_CATEGORY], images: [{ image_url: 'https://img/moi.jpg', display_order: 0 }]
        }));

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Danh mục không tồn tại!');
        const { rows: [book] } = await pool.query('SELECT title FROM books WHERE id = $1', [bookId]);
        expect(book.title).toBe('Sach Goc');
        expect(await categoriesOf(bookId)).toEqual([oldCat]);
        expect(await imagesOf(bookId)).toEqual(['https://img/cu.jpg']);
    });

    test('sửa hợp lệ thay đúng danh mục và ảnh', async () => {
        const bookId = await createBook({ title: 'Sach Goc' });
        const oldCat = await createCategory('Danh muc cu');
        const newCat = await createCategory('Danh muc moi');
        await pool.query('INSERT INTO book_categories (book_id, category_id) VALUES ($1, $2)', [bookId, oldCat]);

        await request(app).put(`/api/books/${bookId}`).set(admin.auth).send(bookPayload({
            categories: [newCat], images: [{ image_url: 'https://img/moi.jpg', display_order: 0 }]
        })).expect(200);

        expect(await categoriesOf(bookId)).toEqual([newCat]);
        expect(await imagesOf(bookId)).toEqual(['https://img/moi.jpg']);
    });

    test('sách không tồn tại → 404', async () => {
        await request(app).put('/api/books/987654').set(admin.auth).send(bookPayload()).expect(404);
    });

    test('đọc lại ngay sau khi nhận 200 thấy bản mới (cache đã xoá trước khi trả response)', async () => {
        const bookId = await createBook({ title: 'Sach Goc' });
        await request(app).get(`/api/books/${bookId}`).expect(200); // ghi cache bản cũ

        await request(app).put(`/api/books/${bookId}`).set(admin.auth).send(bookPayload({ title: 'Sach Da Sua' })).expect(200);
        const res = await request(app).get(`/api/books/${bookId}`).expect(200);

        expect(res.body.data.title).toBe('Sach Da Sua');
    });
});

describe('B77: tạo sách là một transaction', () => {
    test('mã danh mục không tồn tại → 400 và không để lại sách nửa vời', async () => {
        const res = await request(app).post('/api/books').set(admin.auth).send(bookPayload({
            title: 'Sach Nua Voi', categories: [MISSING_CATEGORY]
        }));

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Danh mục không tồn tại!');
        const { rows } = await pool.query("SELECT id FROM books WHERE title = 'Sach Nua Voi'");
        expect(rows).toHaveLength(0);
    });

    test('tạo hợp lệ lưu sách, danh mục, ảnh; danh sách đọc ngay thấy sách mới', async () => {
        const cat = await createCategory('Danh muc');
        await request(app).get('/api/books?limit=50').expect(200); // ghi cache danh sách cũ

        const res = await request(app).post('/api/books').set(admin.auth).send(bookPayload({
            title: 'Sach Vua Tao', categories: [cat], images: [{ image_url: 'https://img/a.jpg', display_order: 0 }]
        })).expect(201);
        const list = await request(app).get('/api/books?limit=50').expect(200);

        const id = res.body.data.id;
        expect(await categoriesOf(id)).toEqual([cat]);
        expect(await imagesOf(id)).toEqual(['https://img/a.jpg']);
        expect(list.body.data.map(b => b.title)).toContain('Sach Vua Tao');
    });
});
