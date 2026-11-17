// Spec 005 — Đăng nhập bằng Google (POST /api/auth/google).
// Chỉ thay bước gọi mạng lấy khoá công khai của Google (dịch vụ bên ngoài) bằng khoá của test;
// xác minh token, tìm / tạo / liên kết tài khoản, cấp phiên đều chạy thật trên DB sdl_test.
const request = require('supertest');
const { OAuth2Client } = require('google-auth-library');
const app = require('../src/config/app');
const pool = require('../src/config/database');
const User = require('../src/models/User');
const { resetDb, createUser, closeAll } = require('./helpers/db');
const { ORIGIN, getRefreshCookie, refresh, loginViaApi } = require('./helpers/auth');
const { TEST_GOOGLE_CLIENT_ID, testCerts, uniqueSub, signGoogleIdToken } = require('./helpers/google');

let certsSpy;

beforeAll(() => {
    process.env.GOOGLE_CLIENT_ID = TEST_GOOGLE_CLIENT_ID;
    certsSpy = jest.spyOn(OAuth2Client.prototype, 'getFederatedSignonCertsAsync').mockResolvedValue(testCerts());
});

afterAll(async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    certsSpy.mockRestore();
    await closeAll();
});

beforeEach(async () => {
    await resetDb();
});

function googleLogin(credential, { cookie, origin = ORIGIN } = {}) {
    const req = request(app).post('/api/auth/google');
    if (origin) req.set('Origin', origin);
    if (cookie) req.set('Cookie', `sdl_rt=${encodeURIComponent(cookie)}`);
    return req.send({ credential });
}

async function userCount() {
    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM users');
    return rows[0].n;
}

async function userRow(id) {
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return rows[0];
}

describe('US1: khách mới đăng nhập bằng Google', () => {
    it('email mới → tạo tài khoản khách hàng, trả phiên giống /auth/login', async () => {
        const sub = uniqueSub();
        const res = await googleLogin(signGoogleIdToken({ sub, email: 'Moi.Google@Gmail.com', name: 'Khách Mới' })).expect(200);

        expect(res.body).toEqual({
            message: 'Đăng nhập thành công!',
            user: { id: expect.any(Number), email: 'moi.google@gmail.com', fullName: 'Khách Mới', role: 'CUSTOMER' },
            token: expect.any(String)
        });
        const cookieHeader = (res.headers['set-cookie'] || []).find(c => c.startsWith('sdl_rt='));
        expect(cookieHeader).toMatch(/HttpOnly/i);
        expect(cookieHeader).toMatch(/Path=\/api\/auth/);

        const row = await userRow(res.body.user.id);
        expect(row.google_sub).toBe(sub);
        expect(row.email).toBe('moi.google@gmail.com');
        expect(row.password_hash).toBeNull();
        expect(row.email_verified_at).not.toBeNull();
        expect(row.role).toBe('CUSTOMER');
    });

    it('đăng nhập lần 2 cùng tài khoản Google → cùng tài khoản, không tạo thêm, phiên lần 1 vẫn dùng được', async () => {
        const sub = uniqueSub();
        const first = await googleLogin(signGoogleIdToken({ sub })).expect(200);
        const second = await googleLogin(signGoogleIdToken({ sub })).expect(200);

        expect(second.body.user.id).toBe(first.body.user.id);
        expect(await userCount()).toBe(1);
        await refresh(getRefreshCookie(first)).expect(200);
    });

    it('email Google đổi nhưng cùng sub → vẫn tài khoản cũ, email đã lưu không đổi', async () => {
        const sub = uniqueSub();
        const first = await googleLogin(signGoogleIdToken({ sub, email: 'cu@gmail.com' })).expect(200);
        const second = await googleLogin(signGoogleIdToken({ sub, email: 'moi@gmail.com' })).expect(200);

        expect(second.body.user.id).toBe(first.body.user.id);
        expect(second.body.user.email).toBe('cu@gmail.com');
        expect(await userCount()).toBe(1);
    });

    it('họ tên rỗng → lấy phần trước @; họ tên quá dài → cắt còn 100 ký tự', async () => {
        const noName = await googleLogin(signGoogleIdToken({ email: 'khongten@gmail.com', name: '   ' })).expect(200);
        expect(noName.body.user.fullName).toBe('khongten');

        const longName = await googleLogin(signGoogleIdToken({ email: 'dai@gmail.com', name: 'A'.repeat(150) })).expect(200);
        expect(longName.body.user.fullName).toBe('A'.repeat(100));
    });

    it('trình duyệt đang giữ phiên khác → phiên đó bị thu hồi (như /auth/login)', async () => {
        const other = await googleLogin(signGoogleIdToken({ email: 'nguoi.a@gmail.com' })).expect(200);
        const oldCookie = getRefreshCookie(other);

        await googleLogin(signGoogleIdToken({ email: 'nguoi.b@gmail.com' }), { cookie: oldCookie }).expect(200);

        await refresh(oldCookie).expect(401);
    });

    it('đăng xuất phiên Google hoạt động như phiên thường', async () => {
        const res = await googleLogin(signGoogleIdToken()).expect(200);
        const cookie = getRefreshCookie(res);

        await request(app).post('/api/auth/logout').set('Origin', ORIGIN)
            .set('Cookie', `sdl_rt=${encodeURIComponent(cookie)}`).expect(200);
        await refresh(cookie).expect(401);
    });

    it('hai request đồng thời cùng tài khoản Google mới → cả hai thành công, chỉ 1 tài khoản', async () => {
        // Barrier: 2 lần tra theo sub đầu tiên chờ nhau (cùng thấy "chưa có") rồi mới cho INSERT → chắc chắn
        // va chạm UNIQUE. Không có barrier thì hai request thường chạy lần lượt và test xanh cả khi code sai.
        // Mở barrier khi cả hai đã TRA XONG (không phải khi bắt đầu tra), nếu không request đầu kịp INSERT
        // trước khi câu tra của request sau chạy và hai request lại thành lần lượt.
        let calls = 0;
        let lookedUp = 0;
        let release;
        const bothLookedUp = new Promise(resolve => { release = resolve; });
        const realFindByGoogleSub = User.findByGoogleSub.bind(User);
        const spy = jest.spyOn(User, 'findByGoogleSub').mockImplementation(async (...args) => {
            calls += 1;
            const result = await realFindByGoogleSub(...args);
            if (lookedUp < 2) {
                lookedUp += 1;
                if (lookedUp === 2) release();
                await Promise.race([bothLookedUp, new Promise(r => setTimeout(r, 500))]);
            }
            return result;
        });

        const sub = uniqueSub();
        const [a, b] = await Promise.all([
            googleLogin(signGoogleIdToken({ sub, email: 'dongthoi@gmail.com' })),
            googleLogin(signGoogleIdToken({ sub, email: 'dongthoi@gmail.com' }))
        ]);

        spy.mockRestore();

        expect(calls).toBeGreaterThanOrEqual(3); // request thua đã phải tra lại sau lỗi trùng
        expect(a.status).toBe(200);
        expect(b.status).toBe(200);
        expect(a.body.user.id).toBe(b.body.user.id);
        expect(await userCount()).toBe(1);
    });
});

describe('US2: gộp vào tài khoản mật khẩu cùng email', () => {
    it.each(['CUSTOMER', 'ADMIN'])('tài khoản %s: liên kết, giữ dữ liệu + vai trò, huỷ mật khẩu, mã đặt lại và mọi phiên', async (role) => {
        const owner = await createUser({ email: 'Khach@Test.vn', password: 'matkhau123', role });
        const { refreshToken: oldCookie } = await loginViaApi({ email: 'khach@test.vn', password: 'matkhau123' });
        await pool.query(
            "UPDATE users SET reset_password_token = 'ma-dang-cho', reset_password_expires = NOW() + INTERVAL '15 minutes' WHERE id = $1",
            [owner.id]
        );
        const sub = uniqueSub();

        const res = await googleLogin(signGoogleIdToken({ sub, email: 'khach@test.vn', hd: 'test.vn' })).expect(200);

        expect(res.body.user).toEqual({ id: owner.id, email: owner.email, fullName: owner.full_name, role });
        expect(await userCount()).toBe(1);
        const row = await userRow(owner.id);
        expect(row.google_sub).toBe(sub);
        expect(row.password_hash).toBeNull();
        expect(row.reset_password_token).toBeNull();
        expect(row.reset_password_expires).toBeNull();
        expect(row.email_verified_at).not.toBeNull();

        // Mật khẩu cũ (có thể do kẻ đăng ký trước đặt) không còn dùng được
        const oldPassword = await request(app).post('/api/auth/login').set('Origin', ORIGIN)
            .send({ email: 'khach@test.vn', password: 'matkhau123' });
        expect(oldPassword.status).toBe(401);
        expect(oldPassword.body.error).toBe('Email hoặc mật khẩu không chính xác!');

        // Mọi phiên cũ bị thu hồi với lý do riêng
        await refresh(oldCookie).expect(401);
        const { rows } = await pool.query(
            "SELECT COUNT(*)::int AS n FROM refresh_tokens WHERE user_id = $1 AND revoked_reason = 'google_link'", [owner.id]
        );
        expect(rows[0].n).toBeGreaterThanOrEqual(1);

        // Phiên Google mới vẫn dùng được
        await refresh(getRefreshCookie(res)).expect(200);
    });

    it('đã liên kết rồi: đăng nhập Google lần sau không huỷ gì thêm', async () => {
        await createUser({ email: 'lienket@test.vn', password: 'matkhau123' });
        const sub = uniqueSub();
        const first = await googleLogin(signGoogleIdToken({ sub, email: 'lienket@test.vn', hd: 'test.vn' })).expect(200);
        await googleLogin(signGoogleIdToken({ sub, email: 'lienket@test.vn', hd: 'test.vn' })).expect(200);

        await refresh(getRefreshCookie(first)).expect(200);
    });

    it('email đã liên kết với tài khoản Google khác → 409, không đổi gì', async () => {
        const firstSub = uniqueSub();
        const first = await googleLogin(signGoogleIdToken({ sub: firstSub, email: 'trung@gmail.com' })).expect(200);

        const res = await googleLogin(signGoogleIdToken({ sub: uniqueSub(), email: 'trung@gmail.com' })).expect(409);

        expect(res.body).toEqual({ code: 'GOOGLE_EMAIL_LINKED', error: 'Email này đã được liên kết với một tài khoản Google khác.' });
        expect(getRefreshCookie(res)).toBeNull();
        expect((await userRow(first.body.user.id)).google_sub).toBe(firstSub);
        expect(await userCount()).toBe(1);
    });

    it('hai request liên kết đồng thời cùng tài khoản Google → cả hai thành công, cùng tài khoản', async () => {
        const owner = await createUser({ email: 'dongthoi.lk@test.vn', password: 'matkhau123' });
        // Barrier: cả hai tra theo email xong (cùng thấy tài khoản chưa liên kết) rồi mới đi liên kết →
        // request sau chờ khoá, UPDATE có điều kiện không khớp, phải đọc lại.
        let lookedUp = 0;
        let release;
        const bothLookedUp = new Promise(resolve => { release = resolve; });
        const realFindByEmail = User.findByEmail.bind(User);
        const spy = jest.spyOn(User, 'findByEmail').mockImplementation(async (...args) => {
            const result = await realFindByEmail(...args);
            if (lookedUp < 2) {
                lookedUp += 1;
                if (lookedUp === 2) release();
                await Promise.race([bothLookedUp, new Promise(r => setTimeout(r, 500))]);
            }
            return result;
        });
        const sub = uniqueSub();
        const [a, b] = await Promise.all([
            googleLogin(signGoogleIdToken({ sub, email: 'dongthoi.lk@test.vn', hd: 'test.vn' })),
            googleLogin(signGoogleIdToken({ sub, email: 'dongthoi.lk@test.vn', hd: 'test.vn' }))
        ]);
        spy.mockRestore();

        expect([a.status, b.status]).toEqual([200, 200]);
        expect(a.body.user.id).toBe(owner.id);
        expect(b.body.user.id).toBe(owner.id);
        expect((await userRow(owner.id)).google_sub).toBe(sub);
    });
});

describe('FR-005a: chỉ tự liên kết khi Google quản lý hộp thư (gmail / Workspace)', () => {
    it('email ngoài, không có hd (Google không quản lý hộp thư) → 409, tài khoản giữ nguyên', async () => {
        const owner = await createUser({ email: 'admin@congty.vn', password: 'matkhau123', role: 'ADMIN' });
        const { refreshToken: ownerCookie } = await loginViaApi({ email: 'admin@congty.vn', password: 'matkhau123' });

        const res = await googleLogin(signGoogleIdToken({ email: 'admin@congty.vn' })).expect(409);

        expect(res.body).toEqual({
            code: 'GOOGLE_LINK_NOT_ALLOWED',
            error: 'Email này đã có tài khoản. Vui lòng đăng nhập bằng email và mật khẩu.'
        });
        expect(getRefreshCookie(res)).toBeNull();
        const row = await userRow(owner.id);
        expect(row.google_sub).toBeNull();
        expect(row.password_hash).not.toBeNull();
        await refresh(ownerCookie).expect(200); // phiên của chủ hiện tại không bị đụng tới
    });

    it.each(['khach@gmail.com', 'Khach@GoogleMail.com'])('%s (Google là hộp thư) → liên kết dù không có hd', async (email) => {
        const owner = await createUser({ email, password: 'matkhau123' });
        const res = await googleLogin(signGoogleIdToken({ email })).expect(200);
        expect(res.body.user.id).toBe(owner.id);
        expect((await userRow(owner.id)).google_sub).not.toBeNull();
    });

    it('email ngoài nhưng CHƯA có tài khoản → vẫn tạo tài khoản mới bình thường', async () => {
        const res = await googleLogin(signGoogleIdToken({ email: 'moi@congty.vn' })).expect(200);
        expect(res.body.user.email).toBe('moi@congty.vn');
    });
});

describe('US4: từ chối trường hợp không an toàn', () => {
    const INVALID = { code: 'GOOGLE_TOKEN_INVALID', error: 'Không xác minh được tài khoản Google. Vui lòng thử lại.' };
    const { attackerPrivateKey } = require('./helpers/google');

    it.each([
        ['ký bằng khoá không phải của Google', () => signGoogleIdToken({}, { privateKey: attackerPrivateKey })],
        ['cấp cho ứng dụng khác (sai aud)', () => signGoogleIdToken({ aud: 'khac.apps.googleusercontent.com' })],
        ['sai iss', () => signGoogleIdToken({ iss: 'https://evil.example.com' })],
        ['hết hạn', () => signGoogleIdToken({}, { iatOffsetSec: -7200, expiresInSec: 3600 })],
        ['email chưa được Google xác minh', () => signGoogleIdToken({ email_verified: false })]
    ])('%s → 401 GOOGLE_TOKEN_INVALID, không tạo tài khoản, không lộ chi tiết', async (_label, makeToken) => {
        const res = await googleLogin(makeToken()).expect(401);
        expect(res.body).toEqual(INVALID);
        expect(getRefreshCookie(res)).toBeNull();
        expect(await userCount()).toBe(0);
    });

    it('tài khoản Google đã liên kết bị khoá → 401 câu khoá, không cấp phiên', async () => {
        const sub = uniqueSub();
        const first = await googleLogin(signGoogleIdToken({ sub })).expect(200);
        await pool.query('UPDATE users SET is_active = false WHERE id = $1', [first.body.user.id]);

        const res = await googleLogin(signGoogleIdToken({ sub })).expect(401);
        expect(res.body.error).toBe('Tài khoản của bạn đã bị khóa bởi quản trị viên!');
        expect(getRefreshCookie(res)).toBeNull();
    });

    it('tài khoản mật khẩu bị khoá cùng email → 401, KHÔNG bị liên kết, mật khẩu giữ nguyên', async () => {
        const owner = await createUser({ email: 'bikhoa@test.vn', password: 'matkhau123' });
        await pool.query('UPDATE users SET is_active = false WHERE id = $1', [owner.id]);

        const res = await googleLogin(signGoogleIdToken({ email: 'bikhoa@test.vn', hd: 'test.vn' })).expect(401);
        expect(res.body.error).toBe('Tài khoản của bạn đã bị khóa bởi quản trị viên!');
        const row = await userRow(owner.id);
        expect(row.google_sub).toBeNull();
        expect(row.password_hash).not.toBeNull();
    });

    it('máy chủ thiếu GOOGLE_CLIENT_ID → 503 GOOGLE_NOT_CONFIGURED', async () => {
        delete process.env.GOOGLE_CLIENT_ID;
        try {
            const res = await googleLogin(signGoogleIdToken()).expect(503);
            expect(res.body).toEqual({ code: 'GOOGLE_NOT_CONFIGURED', error: 'Đăng nhập bằng Google chưa được bật.' });
        } finally {
            process.env.GOOGLE_CLIENT_ID = TEST_GOOGLE_CLIENT_ID;
        }
    });

    it('không lấy được khoá của Google → 503 GOOGLE_UNAVAILABLE', async () => {
        certsSpy.mockRejectedValueOnce(new Error('ECONNRESET'));
        const res = await googleLogin(signGoogleIdToken()).expect(503);
        expect(res.body).toEqual({ code: 'GOOGLE_UNAVAILABLE', error: 'Không kết nối được Google, vui lòng thử lại sau.' });
    });

    it('credential thiếu / sai kiểu / quá dài → 400', async () => {
        await googleLogin(undefined).expect(400);
        await googleLogin(12345).expect(400);
        await googleLogin('a'.repeat(4097)).expect(400);
    });

    it('Origin không được phép → 403 (chống login CSRF)', async () => {
        await googleLogin(signGoogleIdToken(), { origin: 'https://trang-la.example.com' }).expect(403);
        await googleLogin(signGoogleIdToken(), { origin: null }).expect(403);
        expect(await userCount()).toBe(0);
    });

    // Đặt cuối file: bộ đếm giới hạn tần suất giữ trong cả file (các lần thất bại ở trên cũng được tính)
    it('thất bại liên tục từ một IP → bị chặn 429 trong vòng 21 lần', async () => {
        const statuses = [];
        for (let i = 0; i < 21; i++) {
            const res = await googleLogin(signGoogleIdToken({}, { privateKey: attackerPrivateKey }));
            statuses.push(res.status);
            if (res.status === 429) break;
        }
        expect(statuses.at(-1)).toBe(429);
        expect(statuses.slice(0, -1).every(s => s === 401)).toBe(true);
    });
});
