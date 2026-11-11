// Test mô tả hành vi upload ảnh bìa (multer), làm lưới an toàn khi nâng cấp thư viện.
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const app = require('../src/config/app');
const { resetDb, createUser, closeAll } = require('./helpers/db');

const UPLOAD_DIR = path.join(__dirname, '../public/uploads/covers');
// PNG 1x1 hợp lệ
const PNG_1X1 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64'
);

const createdFiles = [];

afterAll(async () => {
    for (const file of createdFiles) {
        fs.rmSync(path.join(UPLOAD_DIR, file), { force: true });
    }
    await closeAll();
});

async function loginAs(role) {
    const user = await createUser({ email: `${role.toLowerCase()}@test.vn`, role });
    const res = await request(app).post('/api/auth/login').send({ email: user.email, password: user.password });
    return { Authorization: `Bearer ${res.body.token}` };
}

describe('POST /api/upload/cover', () => {
    beforeEach(async () => {
        await resetDb();
    });

    test('admin upload ảnh PNG thì lưu file và trả URL công khai', async () => {
        const auth = await loginAs('ADMIN');

        const res = await request(app)
            .post('/api/upload/cover')
            .set(auth)
            .attach('cover', PNG_1X1, { filename: 'bia.png', contentType: 'image/png' });

        expect(res.status).toBe(200);
        expect(res.body.data.url).toMatch(/^\/uploads\/covers\/cover-\d+-[a-z0-9]+\.png$/);
        createdFiles.push(res.body.data.filename);
        expect(fs.existsSync(path.join(UPLOAD_DIR, res.body.data.filename))).toBe(true);
    });

    test('file không phải ảnh bị từ chối với 400', async () => {
        const auth = await loginAs('ADMIN');

        const res = await request(app)
            .post('/api/upload/cover')
            .set(auth)
            .attach('cover', Buffer.from('hello'), { filename: 'note.txt', contentType: 'text/plain' });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Chỉ chấp nhận file ảnh');
    });

    test('không gửi file thì trả 400', async () => {
        const auth = await loginAs('ADMIN');

        const res = await request(app).post('/api/upload/cover').set(auth);

        expect(res.status).toBe(400);
    });

    test('khách hàng thường không được upload', async () => {
        const auth = await loginAs('CUSTOMER');

        const res = await request(app)
            .post('/api/upload/cover')
            .set(auth)
            .attach('cover', PNG_1X1, { filename: 'bia.png', contentType: 'image/png' });

        expect(res.status).toBe(403);
    });
});
