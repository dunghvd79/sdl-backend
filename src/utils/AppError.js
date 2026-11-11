// Lỗi nghiệp vụ: thông báo được thiết kế để hiển thị nguyên văn cho người dùng (tiếng Việt),
// kèm mã HTTP. Mọi lỗi KHÔNG phải AppError được coi là lỗi hệ thống và bị che đi
// bởi src/middleware/errorHandler.js.
// `code` (tuỳ chọn) là mã máy đọc được cho giao diện, vd 'REFRESH_INVALID' (spec 002).
class AppError extends Error {
    constructor(message, statusCode = 400, code = undefined) {
        super(message);
        this.name = 'AppError';
        this.statusCode = statusCode;
        if (code) this.code = code;
    }
}

module.exports = AppError;
