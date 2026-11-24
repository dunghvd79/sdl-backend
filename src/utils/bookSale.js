// B86: chỉ sách PUBLISHED mới bán được. Sách nháp (DRAFT) / đã ẩn (HIDDEN) không thêm vào giỏ, không đặt hàng được
// — kể cả khi khách có mã sách (đơn cũ "Mua lại", link cũ) hoặc sách bị ẩn sau khi đã nằm trong giỏ.
const AppError = require('./AppError');

const FOR_SALE_STATUS = 'PUBLISHED';

function notForSaleError(title) {
    return new AppError(`Sách "${title}" hiện không còn bán`, 400);
}

// book: { title, status }
function assertForSale(book) {
    if (book.status !== FOR_SALE_STATUS) throw notForSaleError(book.title);
}

module.exports = { FOR_SALE_STATUS, notForSaleError, assertForSale };
