// B84: index cho khoá ngoại. Postgres KHÔNG tự tạo index cho khoá ngoại (chỉ cho PRIMARY KEY / UNIQUE), nên:
// - subquery json_agg tra bảng con theo từng dòng cha (lịch sử đơn → order_items, danh sách sách → book_images...)
//   phải quét cả bảng con mỗi lần — N+1 nằm bên trong DB;
// - xoá dòng cha (ON DELETE CASCADE / SET NULL) phải quét cả bảng con để tìm dòng cần xoá.
// Khoá ngoại đã là cột đầu của một PK / UNIQUE thì không cần thêm (vd cart_items(cart_id, book_id) phủ cart_id).
// Thêm khoá ngoại mới thì thêm index vào đây và vào tests/fixtures/schema.sql — tests/db.fk-indexes.test.js báo nếu quên.
const FK_INDEXES = [
    ['idx_book_categories_category_id', 'book_categories', 'category_id'], // lọc sách theo danh mục
    ['idx_book_images_book_id', 'book_images', 'book_id'],                 // ảnh trong danh sách / chi tiết sách
    ['idx_cart_items_book_id', 'cart_items', 'book_id'],
    ['idx_chat_sessions_book_id', 'chat_sessions', 'book_id'],
    ['idx_document_chunks_book_id', 'document_chunks', 'book_id'],
    ['idx_inventory_transactions_book_id', 'inventory_transactions', 'book_id'],
    ['idx_messages_session_id', 'messages', 'session_id'],
    ['idx_notifications_user_id', 'notifications', 'user_id'],             // giao diện hỏi mỗi 15 giây
    ['idx_order_items_book_id', 'order_items', 'book_id'],
    ['idx_order_items_order_id', 'order_items', 'order_id'],               // món của đơn: lịch sử / chi tiết đơn
    ['idx_orders_coupon_id', 'orders', 'coupon_id'],
    ['idx_payments_order_id', 'payments', 'order_id'],                     // trạng thái thanh toán của từng đơn
    ['idx_reviews_user_id', 'reviews', 'user_id'],
    ['idx_user_coupons_coupon_id', 'user_coupons', 'coupon_id'],
    ['idx_wishlists_book_id', 'wishlists', 'book_id']
].map(([name, table, column]) => ({ name, table, column }));

// Tên bảng / cột lấy từ danh sách cố định ở trên, không từ người dùng
function createIndexSql({ name, table, column }) {
    return `CREATE INDEX IF NOT EXISTS ${name} ON ${table} (${column})`;
}

module.exports = { FK_INDEXES, createIndexSql };
