const pool = require('../config/database');

async function run() {
    try {
        console.log('🔄 Đang chạy migration: Thêm cột is_featured...');
        await pool.query(`
            ALTER TABLE books 
            ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT FALSE;
        `);
        console.log('✅ Chạy migration thành công! Cột is_featured đã được thêm.');
    } catch (err) {
        console.error('❌ Lỗi chạy migration:', err.message);
    } finally {
        await pool.end();
    }
}

run();
