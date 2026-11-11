// Spec 002 — US4 (chính sách mật khẩu khi đăng ký, đổi mật khẩu huỷ phiên).
const request = require('supertest');
const app = require('../src/config/app');
const { resetDb, createUser, closeAll } = require('./helpers/db');
const { ORIGIN, getRefreshCookie, loginViaApi, refresh, bearer } = require('./helpers/auth');

const POLICY = 'Mật khẩu phải có ít nhất 8 ký tự, gồm cả chữ cái và chữ số!';

let user;

afterAll(async () => {
    await closeAll();
});

beforeEach(async () => {
    await resetDb();
    user = await createUser();
});

function changePassword(accessToken, currentPassword, newPassword) {
    return request(app)
        .put('/api/users/change-password')
        .set('Origin', ORIGIN)
        .set(bearer(accessToken))
        .send({ currentPassword, newPassword });
}

describe('US4: chính sách mật khẩu và đổi mật khẩu', () => {
    test('đăng ký với mật khẩu 7 ký tự → 400 theo chính sách mới', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ email: 'moi@test.vn', password: 'abc1234', fullName: 'Nguoi Moi' });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe(POLICY);
    });

    test('đổi sang mật khẩu thiếu chữ số → 400 theo chính sách mới', async () => {
        const { accessToken } = await loginViaApi(user);

        const res = await changePassword(accessToken, user.password, 'chicochucai');

        expect(res.status).toBe(400);
        expect(res.body.error).toBe(POLICY);
    });

    test('đổi mật khẩu huỷ phiên thiết bị khác nhưng cấp phiên mới cho thiết bị đang đổi', async () => {
        const deviceA = await loginViaApi(user);
        const deviceB = await loginViaApi(user);

        const res = await changePassword(deviceA.accessToken, user.password, 'matkhaumoi123');
        const refreshB = await refresh(deviceB.refreshToken);
        const refreshA = await refresh(getRefreshCookie(res));

        expect(res.status).toBe(200);
        expect(typeof res.body.token).toBe('string');
        expect(refreshB.status).toBe(401);
        expect(refreshA.status).toBe(200);
    });

    test('sai mật khẩu hiện tại → 401 không có code (giao diện không được đăng xuất)', async () => {
        const { accessToken } = await loginViaApi(user);

        const res = await changePassword(accessToken, 'sai-mat-khau-1', 'matkhaumoi123');

        expect(res.status).toBe(401);
        expect(res.body.code).toBeUndefined();
    });
});
