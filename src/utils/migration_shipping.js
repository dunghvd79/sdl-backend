const pool = require('../config/database');

async function runMigration() {
    try {
        console.log('⏳ Đang kiểm tra và thêm các cột thông tin giao hàng vào bảng orders...');
        
        await pool.query(`
            ALTER TABLE orders 
            ADD COLUMN IF NOT EXISTS shipping_name VARCHAR(255),
            ADD COLUMN IF NOT EXISTS shipping_phone VARCHAR(50),
            ADD COLUMN IF NOT EXISTS shipping_address TEXT,
            ADD COLUMN IF NOT EXISTS shipping_notes TEXT;
        `);
        
        console.log('✅ Thành công! Đã thêm các cột: shipping_name, shipping_phone, shipping_address, shipping_notes vào bảng orders.');
    } catch (err) {
        console.error('❌ Lỗi khi thực thi SQL migration:', err.message);
    } finally {
        pool.end();
    }
}

runMigration();
