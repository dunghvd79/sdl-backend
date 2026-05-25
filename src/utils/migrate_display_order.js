const pool = require('../config/database');

async function run() {
    try {
        console.log('🔄 Đang chạy migration: Thêm cột display_order...');
        await pool.query(`
            ALTER TABLE books 
            ADD COLUMN IF NOT EXISTS display_order INT DEFAULT 0;
        `);
        console.log('✅ Chạy migration thành công! Cột display_order đã được thêm.');
    } catch (err) {
        console.error('❌ Lỗi chạy migration:', err.message);
    } finally {
        await pool.end();
    }
}

run();
