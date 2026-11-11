// Lỗi nghiệp vụ: thông báo được thiết kế để hiển thị nguyên văn cho người dùng (tiếng Việt),
// kèm mã HTTP. Mọi lỗi KHÔNG phải AppError được coi là lỗi hệ thống và bị che đi
// bởi src/middleware/errorHandler.js.
class AppError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.name = 'AppError';
        this.statusCode = statusCode;
    }
}

module.exports = AppError;
