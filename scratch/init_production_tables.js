const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const productionConnectionString = 'postgresql://sdl_database_new_user:XvBZdbja7OJ9F4TlTJoNNbVX9DqiebFD@dpg-d8v159cm0tmc738p8bsg-a.singapore-postgres.render.com/sdl_database_new';

const pool = new Pool({
    connectionString: productionConnectionString,
    ssl: {
        rejectUnauthorized: false
    }
});

async function initProductionDatabase() {
    try {
        console.log('⏳ 1. Đang kết nối tới Database Production...');
        await pool.query('SELECT NOW()');
        console.log('✅ Kết nối thành công.');

        // Xóa sạch các bảng cũ nếu tồn tại để làm mới hoàn toàn
        console.log('🧹 1.5. Đang xóa sạch cấu trúc bảng cũ trên Production...');
        await pool.query(`
            DROP TABLE IF EXISTS 
                reviews, book_images, messages, chat_sessions, document_chunks, 
                order_items, orders, user_coupons, coupons, cart_items, carts, 
                inventory_transactions, inventory, book_categories, books, 
                categories, user_profiles, users, articles, wishlists, notifications
            CASCADE;
        `);
        console.log('✅ Đã dọn sạch các bảng cũ.');

        // Đường dẫn tới 2 file SQL khởi tạo cấu trúc
        const schema1Path = path.join(__dirname, '../database/01_init_schema.sql');
        const schema2Path = path.join(__dirname, '../database/02_phase4_tables.sql');

        // Thực thi file 01
        console.log('⏳ 2. Đang đọc và tạo cấu trúc từ file 01_init_schema.sql...');
        const sql1 = fs.readFileSync(schema1Path, 'utf8');
        await pool.query(sql1);
        console.log('✅ Đã tạo các bảng cơ bản thành công (users, books, categories, orders, reviews...).');

        // Thực thi file 02
        console.log('⏳ 3. Đang đọc và tạo cấu trúc từ file 02_phase4_tables.sql...');
        const sql2 = fs.readFileSync(schema2Path, 'utf8');
        await pool.query(sql2);
        console.log('✅ Đã tạo các bảng mở rộng thành công (carts, cart_items, inventory...).');

        // Tạo các cột bảo mật bổ sung (như session_id...)
        console.log('⏳ 4. Đang tạo thêm các cột bảo mật bổ sung cho bảng users...');
        await pool.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS session_id VARCHAR(255),
            ADD COLUMN IF NOT EXISTS reset_password_token VARCHAR(255),
            ADD COLUMN IF NOT EXISTS reset_password_expires TIMESTAMP;
        `);
        console.log('✅ Cấu hình các cột bảo mật bổ sung thành công.');

        console.log('\n🎉 Rực rỡ! Cơ sở dữ liệu Production của bạn đã được khởi tạo Sạch và Đầy đủ cấu trúc!');
        console.log('Giờ đây bạn có thể chạy lại website Production bình thường.');

    } catch (err) {
        console.error('❌ Lỗi nghiêm trọng khi khởi tạo database Production:', err.message);
    } finally {
        await pool.end();
        console.log('🔌 Kết nối đóng.');
    }
}

initProductionDatabase();
