const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Test connection
pool.query('SELECT NOW()', async (err, res) => {
    if (err) {
        console.error('❌ Lỗi kết nối Database:', err.message);
    } else {
        console.log('✅ Database đã kết nối lúc:', res.rows[0].now);
        
        // Tự động chạy Migration bổ sung ràng buộc UNIQUE cho cart_items nếu chưa có
        try {
            await pool.query(`
                ALTER TABLE cart_items 
                ADD CONSTRAINT unique_cart_book UNIQUE (cart_id, book_id);
            `);
            console.log('✅ Migration: Đã thêm ràng buộc UNIQUE (cart_id, book_id) thành công.');
        } catch (migErr) {
            if (migErr.code === '42P16' || migErr.code === '42710' || migErr.message.includes('already exists')) {
                console.log('ℹ️ Migration: Ràng buộc UNIQUE cho cart_items đã tồn tại. Bỏ qua.');
            } else {
                console.error('❌ Migration gặp lỗi:', migErr.message);
            }
        }

        // Tự động kiểm tra cấu trúc bảng orders và cập nhật các dòng có created_at bị NULL về thời gian hiện tại
        try {
            const colsRes = await pool.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'orders'
            `);
            console.log('📊 Cấu trúc bảng orders (các cột):', colsRes.rows.map(r => r.column_name).join(', '));

            const updateRes = await pool.query(`
                UPDATE orders 
                SET created_at = CURRENT_TIMESTAMP 
                WHERE created_at IS NULL
            `);
            const updateRes2 = await pool.query(`
                UPDATE orders 
                SET updated_at = CURRENT_TIMESTAMP 
                WHERE updated_at IS NULL
            `);
            if (updateRes.rowCount > 0 || updateRes2.rowCount > 0) {
                console.log(`✅ Migration: Đã tự động cập nhật timestamps cho đơn hàng bị NULL (created_at: ${updateRes.rowCount}, updated_at: ${updateRes2.rowCount}).`);
            }
        } catch (orderErr) {
            console.error('❌ Lỗi kiểm tra/cập nhật bảng orders:', orderErr.message);
        }
    }
});

module.exports = pool;