const xss = require('xss');

/**
 * Đệ quy duyệt qua tất cả các thuộc tính của một object/array và làm sạch chuỗi chống XSS
 * @param {any} input 
 * @returns {any}
 */
function sanitizeInput(input) {
    if (typeof input === 'string') {
        // Thực hiện làm sạch chuỗi bằng thư viện xss
        return xss(input);
    }
    if (Array.isArray(input)) {
        return input.map(item => sanitizeInput(item));
    }
    if (typeof input === 'object' && input !== null) {
        const sanitized = {};
        for (const key in input) {
            if (Object.prototype.hasOwnProperty.call(input, key)) {
                sanitized[key] = sanitizeInput(input[key]);
            }
        }
        return sanitized;
    }
    return input;
}

/**
 * Middleware tự động quét và làm sạch req.body của tất cả các yêu cầu
 */
const sanitizeMiddleware = (req, res, next) => {
    try {
        if (req.body && typeof req.body === 'object') {
            req.body = sanitizeInput(req.body);
        }
        next();
    } catch (err) {
        console.error('❌ XSS Sanitization Middleware Error:', err.message);
        next(); // Tiếp tục xử lý, tránh làm sập ứng dụng
    }
};

module.exports = {
    sanitizeMiddleware,
    sanitizeInput
};
