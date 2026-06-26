const pool = require('../config/database');

async function runFtsMigration() {
    console.log('⏳ Đang bắt đầu chạy migration thiết lập Full-Text Search...');
    
    try {
        // 1. Kích hoạt extension unaccent
        console.log('🔹 Kích hoạt tiện ích mở rộng unaccent...');
        await pool.query('CREATE EXTENSION IF NOT EXISTS unaccent;');

        // 2. Tạo hàm wrapper immutable_unaccent
        console.log('🔹 Tạo hàm bất biến immutable_unaccent...');
        const createFuncQuery = `
            CREATE OR REPLACE FUNCTION immutable_unaccent(text)
            RETURNS text AS $$
            SELECT public.unaccent('public.unaccent', $1);
            $$ LANGUAGE sql IMMUTABLE;
        `;
        await pool.query(createFuncQuery);

        // 3. Tạo GIN Index trên books
        console.log('🔹 Tạo GIN Index idx_books_fts trên bảng books...');
        const createIndexQuery = `
            CREATE INDEX IF NOT EXISTS idx_books_fts ON books 
            USING GIN (
                to_tsvector('simple', 
                    immutable_unaccent(title) || ' ' || 
                    immutable_unaccent(author) || ' ' || 
                    immutable_unaccent(COALESCE(description, ''))
                )
            );
        `;
        await pool.query(createIndexQuery);

        console.log('✅ Cấu hình Full-Text Search cho PostgreSQL thành công tốt đẹp!');
    } catch (err) {
        console.error('❌ Lỗi khi thực thi FTS Migration:', err.message);
    } finally {
        // Đóng kết nối pool
        pool.end();
    }
}

runFtsMigration();
