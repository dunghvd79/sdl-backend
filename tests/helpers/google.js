// Giả lập ID token của Google cho test (spec 005, research R2).
// Test tự sinh cặp khoá RSA và ký token RS256 giống Google; chỉ thay bước "lấy khoá công khai của Google"
// (dịch vụ bên ngoài) bằng khoá của test — phần xác minh chữ ký / aud / iss / hạn dùng vẫn chạy thật.
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const TEST_GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
const KID = 'test-kid-1';

function newKeyPair() {
    return crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
}

const googleKeys = newKeyPair();   // "khoá của Google" trong test
const attackerKeys = newKeyPair(); // khoá kẻ giả mạo: chữ ký hợp lệ về mặt toán học nhưng không phải của Google

// Khoá công khai theo dạng getFederatedSignonCertsAsync trả về: { certs: { [kid]: PEM } }
function testCerts() {
    return { certs: { [KID]: googleKeys.publicKey } };
}

let subCounter = 0;
function uniqueSub() {
    subCounter += 1;
    return `10${Date.now()}${subCounter}`;
}

// Ký ID token. `claims` ghi đè mặc định; truyền undefined cho một trường để bỏ hẳn trường đó.
function signGoogleIdToken(claims = {}, { privateKey = googleKeys.privateKey, kid = KID, expiresInSec = 3600, iatOffsetSec = 0 } = {}) {
    const now = Math.floor(Date.now() / 1000) + iatOffsetSec;
    const payload = {
        iss: 'https://accounts.google.com',
        aud: TEST_GOOGLE_CLIENT_ID,
        sub: uniqueSub(),
        email: 'khach.google@gmail.com',
        email_verified: true,
        name: 'Khách Google',
        iat: now,
        exp: now + expiresInSec,
        ...claims
    };
    for (const key of Object.keys(payload)) {
        if (payload[key] === undefined) delete payload[key];
    }
    // Không dùng `noTimestamp`: tuỳ chọn đó xoá luôn `iat` có sẵn trong payload (Google luôn gửi iat)
    return jwt.sign(payload, privateKey, { algorithm: 'RS256', keyid: kid });
}

module.exports = {
    TEST_GOOGLE_CLIENT_ID,
    attackerPrivateKey: attackerKeys.privateKey,
    testCerts,
    uniqueSub,
    signGoogleIdToken
};
