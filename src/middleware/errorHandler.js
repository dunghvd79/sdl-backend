// Xử lý lỗi tập trung cho toàn bộ API (spec 001, contracts/error-response.md).
const crypto = require('crypto');
const AppError = require('../utils/AppError');

const SYSTEM_ERROR_MESSAGE = 'Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.';

// Đường dẫn /api/... không khớp route nào
function notFound(req, res) {
    res.status(404).json({ error: 'Không tìm thấy đường dẫn API.' });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
    if (res.headersSent) {
        return next(err);
    }

    if (err instanceof AppError) {
        const body = { error: err.message };
        if (err.code) body.code = err.code;
        return res.status(err.statusCode).json(body);
    }

    // body-parser: nội dung JSON sai cú pháp
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'Dữ liệu gửi lên không đúng định dạng JSON.' });
    }

    // PostgreSQL unique_violation: dữ liệu trùng, không lộ tên ràng buộc
    if (err.code === '23505') {
        return res.status(400).json({ error: 'Dữ liệu này đã tồn tại.' });
    }

    const errorId = crypto.randomUUID();
    console.error(`[error ${errorId}] ${req.method} ${req.originalUrl}: ${err.message}`, err.stack);

    const body = { error: SYSTEM_ERROR_MESSAGE, errorId };
    if (process.env.NODE_ENV === 'development') {
        body.detail = err.message;
    }
    res.status(500).json(body);
}

module.exports = { notFound, errorHandler, SYSTEM_ERROR_MESSAGE };
