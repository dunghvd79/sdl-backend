const pool = require('../config/database');
const fs = require('fs');
const path = require('path');

async function runMigrations() {
    // Trỏ đường dẫn tới file SQL của bạn (nằm ở thư mục database ngoài cùng)
    const filePath = path.join(__dirname, '../../database/01_init_schema.sql');

    try {
        // 1. Đọc nội dung file SQL
        const sql = fs.readFileSync(filePath, 'utf8');
        console.log('⏳ Đang đọc và thực thi file 01_init_schema.sql...');

        // 2. Chạy toàn bộ lệnh SQL vào Database
        await pool.query(sql);

        console.log('✅ Tạo các bảng (users, books, orders...) thành công rực rỡ!');
    } catch (err) {
        console.error('❌ Lỗi khi chạy file SQL:', err.message);
    } finally {
        // 3. Đóng kết nối sau khi làm xong để chương trình tự thoát
        pool.end();
    }
}

// Kích hoạt hàm
runMigrations();