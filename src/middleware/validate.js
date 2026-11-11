// Kiểm tra dữ liệu đầu vào theo lược đồ Zod (spec 003).
// Chỉ KIỂM TRA, không thay req.body/req.query bằng dữ liệu đã parse (research R3): controller vẫn nhận
// nguyên dữ liệu như trước. Lỗi → AppError 400 với câu tiếng Việt của vi phạm đầu tiên.
const AppError = require('../utils/AppError');

const SOURCES = ['params', 'query', 'body'];

function validate(schemas) {
    return (req, res, next) => {
        for (const source of SOURCES) {
            const schema = schemas[source];
            if (!schema) continue;
            const result = schema.safeParse(req[source] ?? {});
            if (!result.success) {
                return next(new AppError(result.error.issues[0].message, 400));
            }
        }
        next();
    };
}

module.exports = { validate };
