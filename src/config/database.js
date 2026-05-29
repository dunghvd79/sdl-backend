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
    }
});

module.exports = pool;