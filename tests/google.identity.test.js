// Spec 005 FR-002 — xác minh ID token của Google. Chạy thật phần xác minh của google-auth-library;
// chỉ thay `getCerts` (gọi mạng tới Google) bằng khoá công khai của test.
const { verifyGoogleIdToken } = require('../src/services/googleIdentity');
const {
    TEST_GOOGLE_CLIENT_ID,
    attackerPrivateKey,
    testCerts,
    signGoogleIdToken
} = require('./helpers/google');

const options = { getCerts: async () => testCerts(), clientId: TEST_GOOGLE_CLIENT_ID };

async function expectCode(credential, code, opts = options) {
    await expect(verifyGoogleIdToken(credential, opts)).rejects.toMatchObject({ code });
}

describe('verifyGoogleIdToken', () => {
    it('token hợp lệ → trả sub, email (chữ thường), name', async () => {
        const credential = signGoogleIdToken({ sub: '1234567890', email: 'Khach.Google@Gmail.com', name: 'Khách Google' });
        await expect(verifyGoogleIdToken(credential, options)).resolves.toEqual({
            sub: '1234567890',
            email: 'khach.google@gmail.com',
            name: 'Khách Google',
            hd: ''
        });
    });

    it('tài khoản Google Workspace → trả hd (tên miền do Google quản lý hộp thư)', async () => {
        const credential = signGoogleIdToken({ email: 'nv@congty.vn', hd: 'congty.vn' });
        await expect(verifyGoogleIdToken(credential, options)).resolves.toMatchObject({ hd: 'congty.vn' });
    });

    it('chấp nhận cả hai dạng iss của Google', async () => {
        for (const iss of ['accounts.google.com', 'https://accounts.google.com']) {
            await expect(verifyGoogleIdToken(signGoogleIdToken({ iss }), options)).resolves.toBeTruthy();
        }
    });

    it('ký bằng khoá không phải của Google → GOOGLE_TOKEN_INVALID', async () => {
        await expectCode(signGoogleIdToken({}, { privateKey: attackerPrivateKey }), 'GOOGLE_TOKEN_INVALID');
    });

    it('token cấp cho ứng dụng khác (sai aud) → GOOGLE_TOKEN_INVALID', async () => {
        await expectCode(signGoogleIdToken({ aud: 'ung-dung-khac.apps.googleusercontent.com' }), 'GOOGLE_TOKEN_INVALID');
    });

    it('sai iss → GOOGLE_TOKEN_INVALID', async () => {
        await expectCode(signGoogleIdToken({ iss: 'https://evil.example.com' }), 'GOOGLE_TOKEN_INVALID');
    });

    it('hết hạn (quá cả 5 phút lệch đồng hồ cho phép) → GOOGLE_TOKEN_INVALID', async () => {
        const credential = signGoogleIdToken({}, { iatOffsetSec: -7200, expiresInSec: 3600 });
        await expectCode(credential, 'GOOGLE_TOKEN_INVALID');
    });

    it('thiếu sub hoặc email → GOOGLE_TOKEN_INVALID', async () => {
        await expectCode(signGoogleIdToken({ sub: undefined }), 'GOOGLE_TOKEN_INVALID');
        await expectCode(signGoogleIdToken({ email: undefined }), 'GOOGLE_TOKEN_INVALID');
    });

    it('email chưa được Google xác minh (false hoặc thiếu) → GOOGLE_TOKEN_INVALID', async () => {
        await expectCode(signGoogleIdToken({ email_verified: false }), 'GOOGLE_TOKEN_INVALID');
        await expectCode(signGoogleIdToken({ email_verified: undefined }), 'GOOGLE_TOKEN_INVALID');
    });

    it('chuỗi không phải JWT → GOOGLE_TOKEN_INVALID', async () => {
        await expectCode('khong-phai-jwt', 'GOOGLE_TOKEN_INVALID');
        await expectCode('a.b.c', 'GOOGLE_TOKEN_INVALID');
    });

    it('không lấy được khoá của Google → GOOGLE_UNAVAILABLE', async () => {
        const opts = { ...options, getCerts: async () => { throw new Error('ECONNRESET'); } };
        await expectCode(signGoogleIdToken(), 'GOOGLE_UNAVAILABLE', opts);
    });

    it('lấy khoá của Google bị treo → GOOGLE_UNAVAILABLE sau thời gian chờ, không treo request', async () => {
        const opts = { ...options, getCerts: () => new Promise(() => {}), certsTimeoutMs: 50 };
        const started = Date.now();
        await expectCode(signGoogleIdToken(), 'GOOGLE_UNAVAILABLE', opts);
        expect(Date.now() - started).toBeLessThan(2000);
    });

    it('thiếu client id → GOOGLE_NOT_CONFIGURED, không bao giờ xác minh mà bỏ qua aud', async () => {
        const getCerts = jest.fn(async () => testCerts());
        await expectCode(signGoogleIdToken(), 'GOOGLE_NOT_CONFIGURED', { getCerts, clientId: '' });
        await expectCode(signGoogleIdToken(), 'GOOGLE_NOT_CONFIGURED', { getCerts, clientId: undefined });
        expect(getCerts).not.toHaveBeenCalled();
    });

    it('lỗi trả ra không chứa token (thư viện đưa nguyên token vào thông báo lỗi)', async () => {
        const credential = signGoogleIdToken({}, { privateKey: attackerPrivateKey });
        const err = await verifyGoogleIdToken(credential, options).catch(e => e);
        expect(err.message).not.toContain(credential);
        expect(err.message).not.toContain(credential.split('.')[1]);
    });
});
