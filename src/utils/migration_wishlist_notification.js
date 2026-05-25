const pool = require('../config/database');

async function runMigration() {
    try {
        console.log('⏳ Đang tạo các bảng wishlists và notifications trong cơ sở dữ liệu PostgreSQL...');
        
        // 1. Tạo bảng wishlists
        await pool.query(`
            CREATE TABLE IF NOT EXISTS wishlists (
                id SERIAL PRIMARY KEY,
                user_id INT REFERENCES users(id) ON DELETE CASCADE,
                book_id INT REFERENCES books(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, book_id)
            );
        `);
        console.log('✅ Đã khởi tạo bảng wishlists thành công!');

        // 2. Tạo bảng notifications
        await pool.query(`
            CREATE TABLE IF NOT EXISTS notifications (
                id SERIAL PRIMARY KEY,
                user_id INT REFERENCES users(id) ON DELETE CASCADE,
                title VARCHAR(255) NOT NULL,
                content TEXT NOT NULL,
                type VARCHAR(50) NOT NULL, -- 'ORDER' | 'PROMOTION' | 'ACCOUNT'
                is_read BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ Đã khởi tạo bảng notifications thành công!');
        
        console.log('--- Hoàn tất thiết lập cơ sở dữ liệu di cư! ---');
    } catch (err) {
        console.error('❌ Lỗi khi thực thi di cư bảng:', err.message);
    } finally {
        pool.end();
    }
}

runMigration();
