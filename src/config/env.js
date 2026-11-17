// Kiểm tra cấu hình lúc khởi động (B53, B60).
// - errors: thiếu thứ bắt buộc → server KHÔNG khởi động (fail fast), thay vì chạy rồi lỗi 500 lúc có người đăng nhập.
// - warnings: cấu hình làm một tính năng hỏng âm thầm (vd email không gửi được) → in cảnh báo rõ trong log.
// Thông báo chỉ nêu tên biến, không bao giờ in giá trị.

const MIN_JWT_SECRET_LENGTH = 32;
// Resend chỉ gửi từ tên miền đã xác minh; hộp thư công cộng không xác minh được
const PUBLIC_MAIL_DOMAINS = ['gmail.com', 'googlemail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'live.com', 'icloud.com'];

function isBlank(value) {
    return typeof value !== 'string' || value.trim() === '';
}

function checkEnv(env = process.env) {
    const errors = [];
    const warnings = [];

    if (isBlank(env.JWT_SECRET)) {
        errors.push('Thiếu JWT_SECRET: không ký / kiểm tra được access token, mọi lần đăng nhập sẽ lỗi.');
    } else if (env.JWT_SECRET.length < MIN_JWT_SECRET_LENGTH) {
        // Chỉ cảnh báo: dừng hẳn sẽ làm sập production đang chạy với secret ngắn. Đổi secret chỉ làm hết hạn access token (15 phút).
        warnings.push(`JWT_SECRET ngắn hơn ${MIN_JWT_SECRET_LENGTH} ký tự: nên thay bằng chuỗi ngẫu nhiên dài (vd 64 ký tự hex).`);
    }

    if (isBlank(env.RESEND_API_KEY)) {
        warnings.push('Thiếu RESEND_API_KEY: email quên mật khẩu sẽ KHÔNG được gửi.');
    }

    const fromDomain = (env.EMAIL_FROM || '').split('@')[1];
    if (fromDomain && PUBLIC_MAIL_DOMAINS.includes(fromDomain.trim().toLowerCase())) {
        warnings.push(`EMAIL_FROM dùng hộp thư công cộng (${fromDomain}): Resend sẽ từ chối. Dùng địa chỉ thuộc tên miền đã xác minh, hoặc onboarding@resend.dev khi thử nghiệm.`);
    }

    return { errors, warnings };
}

function assertEnv(env = process.env) {
    const { errors, warnings } = checkEnv(env);
    warnings.forEach(message => console.warn(`⚠️ [Config] ${message}`));
    errors.forEach(message => console.error(`❌ [Config] ${message}`));
    if (errors.length > 0) {
        throw new Error('Cấu hình môi trường không hợp lệ, dừng khởi động. Xem các dòng [Config] ở trên.');
    }
}

module.exports = { checkEnv, assertEnv };
