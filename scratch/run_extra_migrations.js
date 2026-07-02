const pool = require('../src/config/database');
const fs = require('fs');
const path = require('path');

async function runExtraMigrations() {
    try {
        const filePath = path.join(__dirname, '../database/02_phase4_tables.sql');
        const sql = fs.readFileSync(filePath, 'utf8');
        console.log('⏳ Đang chạy 02_phase4_tables.sql...');
        await pool.query(sql);
        console.log('✅ Chạy 02_phase4_tables.sql thành công!');
    } catch (e) {
        console.error('❌ Lỗi chạy 02_phase4_tables.sql:', e.message);
    } finally {
        pool.end();
    }
}

runExtraMigrations();
