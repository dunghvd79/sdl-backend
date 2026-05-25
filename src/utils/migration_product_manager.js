const pool = require('../config/database');

async function runMigration() {
    try {
        console.log('⏳ Đang nâng cấp bảng books và categories (Product Manager features)...');

        // 1. Thêm cột cover_url vào bảng books
        await pool.query(`
            ALTER TABLE books ADD COLUMN IF NOT EXISTS cover_url VARCHAR(500);
        `);
        console.log('✅ Đã thêm cột cover_url vào bảng books.');

        // 2. Thêm cột status vào bảng books
        await pool.query(`
            ALTER TABLE books ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'PUBLISHED'
            CHECK (status IN ('DRAFT', 'PUBLISHED', 'HIDDEN'));
        `);
        console.log('✅ Đã thêm cột status (DRAFT/PUBLISHED/HIDDEN) vào bảng books.');

        // 3. Đặt tất cả sách hiện có thành PUBLISHED (mặc định đang hiển thị)
        await pool.query(`
            UPDATE books SET status = 'PUBLISHED' WHERE status IS NULL;
        `);
        console.log('✅ Đã cập nhật status = PUBLISHED cho tất cả sách hiện có.');

        // 4. Thêm cột description vào bảng categories (nếu chưa có)
        await pool.query(`
            ALTER TABLE categories ADD COLUMN IF NOT EXISTS description TEXT;
        `);
        console.log('✅ Đã thêm cột description vào bảng categories.');

        console.log('\n🎉 Migration Product Manager hoàn tất thành công!');
    } catch (err) {
        console.error('❌ Lỗi khi thực thi migration:', err.message);
    } finally {
        pool.end();
    }
}

runMigration();
