// B52: API công khai không được để client tự xin quyền xem bản nháp.
// Trước khi sửa: ?adminMode=true (sách, bài viết) và ?status=DRAFT (bài viết) cho khách vãng lai xem sách / bài viết
// nháp, đã ẩn; xem chi tiết theo id cũng không lọc trạng thái. Quyền phải suy ra từ req.user.role đã xác thực.
const request = require('supertest');
const app = require('../src/config/app');
const pool = require('../src/config/database');
const { encodeBookId, encodeArticleId } = require('../src/utils/hashids');
const { resetDb, closeAll } = require('./helpers/db');
const { loginAs } = require('./helpers/fixtures');
const { signTestToken } = require('./helpers/auth');

let customer;
let curator;
const books = {};
const articles = {};

afterAll(async () => {
    await closeAll();
});

beforeAll(async () => {
    await resetDb();
    customer = await loginAs('CUSTOMER');
    curator = await loginAs('CURATOR');
    for (const status of ['PUBLISHED', 'DRAFT', 'HIDDEN']) {
        const { rows: [b] } = await pool.query(
            "INSERT INTO books (title, author, price, status) VALUES ($1, 'Tac Gia', 100000, $2) RETURNING id",
            [`Sach ${status}`, status]
        );
        books[status] = encodeBookId(b.id);
        const { rows: [a] } = await pool.query(
            "INSERT INTO articles (title, content, category, status) VALUES ($1, 'Noi dung', $2, $3) RETURNING id",
            [`Bai ${status}`, `Muc ${status}`, status]
        );
        articles[status] = encodeArticleId(a.id);
    }
});

const titles = res => res.body.data.map(x => x.title).sort();

describe('B52: danh sách sách', () => {
    test.each([
        ['khách vãng lai', () => ({})],
        ['CUSTOMER', () => customer.auth]
    ])('%s gửi adminMode=true → chỉ thấy sách đã xuất bản', async (_, auth) => {
        const res = await request(app).get('/api/books?adminMode=true&limit=50').set(auth()).expect(200);
        expect(titles(res)).toEqual(['Sach PUBLISHED']);
    });

    test('CURATOR gửi adminMode=true → thấy cả nháp và đã ẩn', async () => {
        const res = await request(app).get('/api/books?adminMode=true&limit=50').set(curator.auth).expect(200);
        expect(titles(res)).toEqual(['Sach DRAFT', 'Sach HIDDEN', 'Sach PUBLISHED']);
    });
});

describe('B52: token hết hạn khi xin chế độ nhân viên', () => {
    test('nhân viên có access token hết hạn gửi adminMode=true → 401 TOKEN_EXPIRED (để giao diện tự gia hạn)', async () => {
        const expired = signTestToken(
            { id: curator.user.id, email: curator.user.email, role: 'CURATOR', type: 'access' },
            { algorithm: 'HS256', expiresIn: -10 }
        );
        const res = await request(app).get('/api/books?adminMode=true').set({ Authorization: `Bearer ${expired}` }).expect(401);
        expect(res.body.code).toBe('TOKEN_EXPIRED');
    });

    test('khách có token hết hạn xem danh sách bình thường → vẫn 200 (không bị đá ra)', async () => {
        const expired = signTestToken(
            { id: customer.user.id, email: customer.user.email, role: 'CUSTOMER', type: 'access' },
            { algorithm: 'HS256', expiresIn: -10 }
        );
        const res = await request(app).get('/api/books').set({ Authorization: `Bearer ${expired}` }).expect(200);
        expect(titles(res)).toEqual(['Sach PUBLISHED']);
    });
});

describe('B52: chi tiết sách', () => {
    test('khách vãng lai xem sách nháp theo id → 404', async () => {
        await request(app).get(`/api/books/${books.DRAFT}`).expect(404);
        await request(app).get(`/api/books/${books.HIDDEN}`).expect(404);
    });

    test('nhân viên xem trước (ghi cache) rồi khách xem → khách vẫn 404, không đọc được từ cache', async () => {
        await request(app).get(`/api/books/${books.DRAFT}`).set(curator.auth).expect(200);
        await request(app).get(`/api/books/${books.DRAFT}`).expect(404);
    });

    test('sách đã xuất bản vẫn xem được bình thường', async () => {
        const res = await request(app).get(`/api/books/${books.PUBLISHED}`).expect(200);
        expect(res.body.data.title).toBe('Sach PUBLISHED');
    });
});

describe('B52: bài viết', () => {
    test.each([
        ['?adminMode=true', '/api/articles?adminMode=true&limit=50'],
        ['?status=DRAFT', '/api/articles?status=DRAFT&limit=50'],
        ['?status=HIDDEN&adminMode=true', '/api/articles?status=HIDDEN&adminMode=true&limit=50']
    ])('khách vãng lai gửi %s → chỉ thấy bài đã xuất bản', async (_, url) => {
        const res = await request(app).get(url).expect(200);
        expect(titles(res).every(t => t === 'Bai PUBLISHED')).toBe(true);
    });

    test('CURATOR gửi adminMode=true → thấy mọi bài; lọc status=DRAFT → đúng bài nháp', async () => {
        const all = await request(app).get('/api/articles?adminMode=true&limit=50').set(curator.auth).expect(200);
        expect(titles(all)).toEqual(['Bai DRAFT', 'Bai HIDDEN', 'Bai PUBLISHED']);
        const drafts = await request(app).get('/api/articles?status=DRAFT&limit=50').set(curator.auth).expect(200);
        expect(titles(drafts)).toEqual(['Bai DRAFT']);
    });

    test('chi tiết bài nháp: khách 404, nhân viên 200', async () => {
        await request(app).get(`/api/articles/${articles.DRAFT}`).expect(404);
        await request(app).get(`/api/articles/${articles.DRAFT}`).set(curator.auth).expect(200);
        await request(app).get(`/api/articles/${articles.PUBLISHED}`).expect(200);
    });

    test('danh sách chuyên mục: khách gửi adminMode=true → chỉ chuyên mục có bài đã xuất bản', async () => {
        const res = await request(app).get('/api/articles/categories?adminMode=true').expect(200);
        expect(JSON.stringify(res.body.data)).not.toMatch(/Muc (DRAFT|HIDDEN)/);
    });
});
