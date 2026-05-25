const pool = require('../config/database');

async function runMigration() {
    try {
        console.log('⏳ Đang cập nhật bảng users trong cơ sở dữ liệu PostgreSQL...');
        
        await pool.query(`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
        `);
        
        console.log('✅ Thành công! Đã thêm cột is_active vào bảng users.');
    } catch (err) {
        console.error('❌ Lỗi khi cập nhật bảng users:', err.message);
    } finally {
        pool.end();
    }
}

runMigration();
