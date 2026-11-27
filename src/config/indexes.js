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

// B88: index trùng lặp — bảng đã có UNIQUE gốc (01_init_schema.sql / 02_phase4_tables.sql) nhưng migration cũ vẫn
// `ADD CONSTRAINT unique_*` cùng cột (Postgres chỉ báo lỗi khi trùng TÊN, không khi trùng cột) → hai index y hệt:
// mỗi lần ghi cập nhật cả hai, đọc không lợi gì. `constraint`: là ràng buộc (DROP CONSTRAINT) hay index thường.
const DUPLICATE_INDEXES = [
    { table: 'cart_items', name: 'unique_cart_book', constraint: true },        // = cart_items_cart_id_book_id_key
    { table: 'inventory', name: 'unique_inventory_book', constraint: true },    // = inventory_pkey (book_id)
    { table: 'coupons', name: 'unique_coupons_code', constraint: true },        // = coupons_code_key
    { table: 'reviews', name: 'unique_book_user_review', constraint: true },    // = reviews_book_id_user_id_key
    { table: 'users', name: 'idx_users_email', constraint: false }              // = users_email_key
];

// Chỉ xoá khi CÒN một index khác trên đúng các cột đó (cùng thứ tự), và nếu bản bị xoá là UNIQUE thì bản còn lại
// cũng phải UNIQUE → không bao giờ làm mất ràng buộc, kể cả trên DB mà bản gốc không tồn tại. Không có index → bỏ qua.
function dropDuplicateIndexSql({ table, name, constraint }) {
    const drop = constraint ? `ALTER TABLE ${table} DROP CONSTRAINT ${name}` : `DROP INDEX ${name}`;
    return `
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1
                FROM pg_index dup
                JOIN pg_index other ON other.indrelid = dup.indrelid
                                   AND other.indexrelid <> dup.indexrelid
                                   AND other.indkey::text = dup.indkey::text
                                   AND other.indexprs IS NULL AND other.indpred IS NULL
                                   AND (other.indisunique OR NOT dup.indisunique)
                WHERE dup.indexrelid = to_regclass('public.${name}')
            ) THEN
                ${drop};
            END IF;
        END $$`;
}

module.exports = { FK_INDEXES, createIndexSql, DUPLICATE_INDEXES, dropDuplicateIndexSql };
