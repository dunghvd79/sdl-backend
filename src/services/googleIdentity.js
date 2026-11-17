// Xác minh ID token của Google (spec 005, research R2).
// Google Identity Services trên giao diện trả về "credential" = JWT do Google ký RS256. Ở đây kiểm tra:
// chữ ký bằng khoá công khai của Google, aud = Client ID của hệ thống, iss là Google, còn hạn,
// có sub + email, và email đã được Google xác minh.
//
// Lỗi ném ra luôn mang `code` (GOOGLE_TOKEN_INVALID / GOOGLE_UNAVAILABLE / GOOGLE_NOT_CONFIGURED) và câu
// cố định — KHÔNG kèm thông báo của thư viện, vì thông báo đó chứa nguyên token (bằng chứng đăng nhập).
const { OAuth2Client } = require('google-auth-library');

const GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

// Một client dùng chung: thư viện tự cache khoá công khai của Google theo Cache-Control
const oauthClient = new OAuth2Client();

function googleError(code, message) {
    const err = new Error(message);
    err.code = code;
    return err;
}

// Lấy khoá công khai của Google (gọi mạng) — test thay hàm này bằng khoá của test
async function defaultGetCerts() {
    return oauthClient.getFederatedSignonCertsAsync();
}

// Mạng tới Google treo thì trả nhanh 503 thay vì treo request đăng nhập (khoá được cache nên hiếm gặp)
const CERTS_TIMEOUT_MS = 5000;
function withTimeout(promise, ms) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Hết thời gian chờ Google')), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function verifyGoogleIdToken(credential, {
    getCerts = defaultGetCerts,
    clientId = process.env.GOOGLE_CLIENT_ID,
    certsTimeoutMs = CERTS_TIMEOUT_MS
} = {}) {
    // Thiếu Client ID thì thư viện bỏ qua kiểm tra aud → token của ứng dụng bất kỳ cũng qua. Chặn trước.
    if (typeof clientId !== 'string' || clientId.trim() === '') {
        throw googleError('GOOGLE_NOT_CONFIGURED', 'Thiếu GOOGLE_CLIENT_ID');
    }

    let certs;
    try {
        ({ certs } = await withTimeout(getCerts(), certsTimeoutMs));
    } catch {
        throw googleError('GOOGLE_UNAVAILABLE', 'Không lấy được khoá công khai của Google');
    }

    let payload;
    try {
        const ticket = await oauthClient.verifySignedJwtWithCertsAsync(credential, certs, clientId.trim(), GOOGLE_ISSUERS);
        payload = ticket.getPayload();
    } catch {
        throw googleError('GOOGLE_TOKEN_INVALID', 'ID token Google không hợp lệ');
    }

    const sub = payload && typeof payload.sub === 'string' ? payload.sub : '';
    const email = payload && typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
    if (!sub || !email || payload.email_verified !== true) {
        throw googleError('GOOGLE_TOKEN_INVALID', 'ID token Google thiếu thông tin hoặc email chưa xác minh');
    }

    return {
        sub,
        email,
        name: typeof payload.name === 'string' ? payload.name : '',
        // hd: tên miền Google Workspace — có nghĩa là Google quản lý hộp thư của email này (FR-005a)
        hd: typeof payload.hd === 'string' ? payload.hd : ''
    };
}

module.exports = { verifyGoogleIdToken, defaultGetCerts };
