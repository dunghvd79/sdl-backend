// B79: cột cũ books.stock_quantity (không còn dùng, luôn 0) không được lộ ra API sách — tồn kho thật là
// available_qty / reserved_qty tính từ bảng inventory.
const request = require('supertest');
const app = require('../src/config/app');
const { resetDb, closeAll } = require('./helpers/db');
const { loginAs, createBook } = require('./helpers/fixtures');

const EXPECTED_FIELDS = ['id', 'title', 'author', 'description', 'price', 'isbn', 'cover_url', 'status',
    'is_featured', 'is_bestseller', 'display_order', 'created_at', 'rag_indexed_at', 'hashId'];

let admin;

afterAll(async () => {
    await closeAll();
});

beforeEach(async () => {
    await resetDb();
    admin = await loginAs('ADMIN');
});

function expectCleanBook(book) {
    expect(book).not.toHaveProperty('stock_quantity');
    for (const field of EXPECTED_FIELDS) expect(book).toHaveProperty(field);
}

describe('B79: API sách không trả cột stock_quantity', () => {
    test('danh sách và chi tiết (cả lần đọc DB lẫn lần đọc cache)', async () => {
        const bookId = await createBook({ stock: 7 });

        for (let i = 0; i < 2; i++) {
            const list = await request(app).get('/api/books?limit=50').expect(200);
            const detail = await request(app).get(`/api/books/${bookId}`).expect(200);
            const listed = list.body.data.find(b => b.id === bookId);

            expectCleanBook(listed);
            expectCleanBook(detail.body.data);
            expect(listed.available_qty).toBe(7);
            expect(detail.body.data).toHaveProperty('categories');
        }
    });

    test('tạo và sửa sách', async () => {
        const payload = { title: 'Sach Moi', author: 'Tac Gia', price: 90000, status: 'PUBLISHED' };
        const created = await request(app).post('/api/books').set(admin.auth).send(payload).expect(201);
        const updated = await request(app).put(`/api/books/${created.body.data.id}`).set(admin.auth)
            .send({ ...payload, title: 'Sach Da Sua' }).expect(200);

        expectCleanBook(created.body.data);
        expectCleanBook(updated.body.data);
        expect(updated.body.data.title).toBe('Sach Da Sua');
    });
});
