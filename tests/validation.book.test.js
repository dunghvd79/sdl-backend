// B36 (phần sách): khoá NGUYÊN VĂN câu báo lỗi khi tạo / sửa sách, trước và sau khi chuyển `validateBookInput`
// từ controller vào lược đồ Zod `schemas.book.write`. Giao diện hiển thị đúng các câu này nên không được đổi.
const request = require('supertest');
const app = require('../src/config/app');
const { resetDb, closeAll } = require('./helpers/db');
const { loginAs, createBook } = require('./helpers/fixtures');

let admin;
let bookId;
let adminCount = 0;

const valid = { title: 'Sach Hop Le', author: 'Tac Gia', price: 120000, status: 'PUBLISHED' };

afterAll(async () => {
    await closeAll();
});

beforeAll(async () => {
    await resetDb();
    bookId = await createBook();
});

// Thao tác ghi của quản trị bị giới hạn 30 lần / phút / tài khoản (rl.writeLimiter) → mỗi test một tài khoản admin
beforeEach(async () => {
    admin = await loginAs('ADMIN', `admin${++adminCount}@test.vn`);
});

const TITLE_EMPTY = 'Tên sách không được để trống!';
const AUTHOR_EMPTY = 'Tác giả không được để trống!';
const PRICE_EMPTY = 'Giá bán không được để trống!';
const ISBN_INVALID = 'Mã ISBN không hợp lệ!';

// [mô tả, thay đổi so với payload hợp lệ, câu báo lỗi mong đợi]
const CASES = [
    ['thiếu tên sách', { title: undefined }, TITLE_EMPTY],
    ['tên sách null', { title: null }, TITLE_EMPTY],
    ['tên sách chỉ có khoảng trắng', { title: '   ' }, TITLE_EMPTY],
    ['tên sách không phải chuỗi', { title: 123 }, TITLE_EMPTY],
    ['tên sách 256 ký tự', { title: 'a'.repeat(256) }, 'Tên sách quá dài! Vui lòng nhập tối đa 255 ký tự.'],
    ['thiếu tác giả', { author: undefined }, AUTHOR_EMPTY],
    ['tác giả chỉ có khoảng trắng', { author: '  ' }, AUTHOR_EMPTY],
    ['tác giả không phải chuỗi', { author: ['x'] }, AUTHOR_EMPTY],
    ['tác giả 256 ký tự', { author: 'a'.repeat(256) }, 'Tên tác giả quá dài! Vui lòng nhập tối đa 255 ký tự.'],
    ['thiếu giá', { price: undefined }, PRICE_EMPTY],
    ['giá null', { price: null }, PRICE_EMPTY],
    ['giá rỗng', { price: '' }, PRICE_EMPTY],
    ['giá không phải số', { price: 'abc' }, 'Giá bán phải là số hợp lệ!'],
    ['giá âm', { price: -1 }, 'Giá bán không hợp lệ! Giá sách phải từ 0 đ trở lên.'],
    ['giá vượt giới hạn', { price: 100000000 }, 'Giá bán vượt quá giới hạn hệ thống (Tối đa 99.999.999,99 đ)!'],
    ['ISBN không phải chuỗi', { isbn: 9786049223421 }, ISBN_INVALID],
    ['ISBN 51 ký tự', { isbn: '1'.repeat(51) }, 'Mã ISBN quá dài! Vui lòng nhập tối đa 50 ký tự.'],
    ['ISBN có chữ', { isbn: '978-abc' }, 'Mã ISBN không hợp lệ! Vui lòng chỉ nhập số và dấu gạch ngang.'],
    ['mô tả 5001 ký tự', { description: 'a'.repeat(5001) }, 'Mô tả sách quá dài! Vui lòng rút gọn dưới 5000 ký tự.'],
    ['trạng thái sai', { status: 'DELETED' },
        'Trạng thái sách không hợp lệ! Chỉ cho phép: Công khai (PUBLISHED), Bản nháp (DRAFT), hoặc Tạm ẩn (HIDDEN).'],
    // Nhiều lỗi cùng lúc: báo lỗi theo đúng thứ tự cũ
    ['thiếu cả tên sách lẫn tác giả', { title: '', author: '' }, TITLE_EMPTY],
    ['thiếu tác giả và giá', { author: '', price: '' }, AUTHOR_EMPTY],
    ['ảnh bìa quá dài và thiếu tên sách (ảnh bìa báo trước)', { cover_url: 'x'.repeat(501), title: '' },
        'Ảnh bìa (cover_url) không được dài quá 500 ký tự']
];

describe.each([
    ['tạo sách', () => request(app).post('/api/books')],
    ['sửa sách', () => request(app).put(`/api/books/${bookId}`)]
])('%s: câu báo lỗi giữ nguyên', (_name, send) => {
    test.each(CASES)('%s', async (_desc, change, message) => {
        const res = await send().set(admin.auth).send({ ...valid, ...change });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe(message);
    });
});

describe('dữ liệu hợp lệ ở biên vẫn được nhận', () => {
    test.each([
        ['tên sách đúng 255 ký tự, giá 0, ISBN rỗng', { title: 'a'.repeat(255), price: 0, isbn: '' }],
        ['giá dạng chuỗi, giá tối đa, ISBN có gạch ngang', { price: '99999999.99', isbn: '978-604-922-342-1' }],
        ['không gửi trạng thái, mô tả đúng 5000 ký tự', { status: undefined, description: 'a'.repeat(5000) }],
        ['mô tả null, ISBN null, trạng thái rỗng', { description: null, isbn: null, status: '' }]
    ])('%s', async (_desc, change) => {
        await request(app).put(`/api/books/${bookId}`).set(admin.auth).send({ ...valid, ...change }).expect(200);
    });
});
