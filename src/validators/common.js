// Khối dựng lược đồ dùng chung (spec 003). Mọi thông báo là tiếng Việt, nêu tên trường theo ngôn ngữ
// người dùng. Lược đồ đối tượng dùng z.looseObject để bỏ qua trường thừa (FR-004).
const { z } = require('zod');

// Chuỗi có giới hạn độ dài (tuỳ chọn: bắt buộc / cho phép rỗng)
function text(label, max, { required = false } = {}) {
    let schema = z.string({ error: `${label} phải là chuỗi ký tự` })
        .max(max, { error: `${label} không được dài quá ${max} ký tự` });
    if (required) {
        schema = schema.trim().min(1, { error: `${label} không được để trống` });
    }
    return required ? schema : schema.nullish();
}

// Số (chấp nhận số dạng chuỗi từ form) trong khoảng [min, max]
function number(label, min, max, { integer = false, required = false } = {}) {
    let schema = z.coerce.number({ error: `${label} phải là số` });
    if (integer) schema = schema.int({ error: `${label} phải là số nguyên` });
    schema = schema
        .min(min, { error: `${label} phải từ ${min.toLocaleString('vi-VN')} đến ${max.toLocaleString('vi-VN')}` })
        .max(max, { error: `${label} phải từ ${min.toLocaleString('vi-VN')} đến ${max.toLocaleString('vi-VN')}` });
    if (required) return schema;
    // Trường tuỳ chọn: bỏ qua khi không gửi / null / chuỗi rỗng (giống hành vi hiện tại)
    return z.preprocess(v => (v === null || v === '' ? undefined : v), schema.optional());
}

function oneOf(label, values, { required = false } = {}) {
    const schema = z.enum(values, { error: `${label} không hợp lệ (chỉ nhận: ${values.join(', ')})` });
    return required ? schema : schema.nullish();
}

function bool(label) {
    return z.boolean({ error: `${label} phải là true hoặc false` }).nullish();
}

// Mã sách: số nguyên dương hoặc hashId (chuỗi chữ cái/số ngắn)
const bookId = z.union([
    z.number().int().positive(),
    z.string().regex(/^[A-Za-z0-9]{1,30}$/)
], { error: 'Mã sách không hợp lệ' });

function idList(label, max = 100) {
    return z.array(bookId, { error: `${label} phải là một danh sách` })
        .max(max, { error: `${label} tối đa ${max} phần tử` });
}

// Tham số phân trang / tìm kiếm của các API danh sách (FR-003)
const listQuery = {
    limit: number('Số lượng mỗi trang (limit)', 1, 500, { integer: true }),
    page: number('Trang (page)', 1, 100000, { integer: true }),
    offset: number('Vị trí bắt đầu (offset)', 0, 10000000, { integer: true }),
    search: text('Từ khoá tìm kiếm', 100)
};

module.exports = { z, text, number, oneOf, bool, bookId, idList, listQuery };
