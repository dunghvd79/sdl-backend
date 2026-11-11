// Bước 7 lộ trình (backlog B8, B9, B10): gỡ route giả lập/hỏng, upload không tin đuôi file của client.
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const app = require('../src/config/app');
const { resetDb, closeAll } = require('./helpers/db');
const { loginAs } = require('./helpers/fixtures');

const UPLOAD_DIR = path.join(__dirname, '../public/uploads/covers');
const PNG_1X1 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64'
);
const createdFiles = [];

afterAll(async () => {
    for (const file of createdFiles) fs.rmSync(path.join(UPLOAD_DIR, file), { force: true });
    await closeAll();
});

beforeAll(async () => {
    await resetDb();
});

describe('B8: trang thanh toán giả lập không còn trên server', () => {
    test('/mock-gateway không còn phản hồi HTML chèn tham số', async () => {
        const res = await request(app).get('/mock-gateway?orderId=%3Cscript%3Ealert(1)%3C%2Fscript%3E&amount=1');

        expect(res.status).toBe(404);
        expect(res.text).not.toContain('<script>alert(1)</script>');
    });
});

describe('B9: route webhook hỏng đã được gỡ', () => {
    test('POST /api/payments/webhook → 404 thay vì 500', async () => {
        const res = await request(app).post('/api/payments/webhook').send({});

        expect(res.status).toBe(404);
    });
});

describe('B10: upload lấy đuôi file theo loại ảnh, không theo tên client gửi', () => {
    test('tên file .html nhưng nội dung ảnh PNG → lưu đuôi .png', async () => {
        const { auth } = await loginAs('ADMIN');

        const res = await request(app)
            .post('/api/upload/cover')
            .set(auth)
            .attach('cover', PNG_1X1, { filename: 'evil.html', contentType: 'image/png' });

        expect(res.status).toBe(200);
        createdFiles.push(res.body.data.filename);
        expect(res.body.data.filename).toMatch(/\.png$/);
    });
});
