const pool = require('../config/database');

async function runMigration() {
    try {
        console.log('⏳ Đang tạo bảng reviews trong cơ sở dữ liệu PostgreSQL...');
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS reviews (
                id SERIAL PRIMARY KEY,
                book_id INT REFERENCES books(id) ON DELETE CASCADE,
                user_id INT REFERENCES users(id) ON DELETE CASCADE,
                rating INT CHECK (rating >= 1 AND rating <= 5) NOT NULL,
                comment TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(book_id, user_id)
            );
        `);
        
        console.log('✅ Thành công! Đã tạo bảng reviews.');
    } catch (err) {
        console.error('❌ Lỗi khi tạo bảng reviews:', err.message);
    } finally {
        pool.end();
    }
}

runMigration();
