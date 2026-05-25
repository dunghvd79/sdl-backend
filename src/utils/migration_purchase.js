const pool = require('../config/database');

async function runMigration() {
    try {
        console.log('⏳ Đang tiến hành cập nhật cơ sở dữ liệu cho tính năng Mua hàng...');
        
        // 1. Thêm cột phone và address vào bảng users
        await pool.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS phone VARCHAR(50),
            ADD COLUMN IF NOT EXISTS address TEXT;
        `);
        console.log('✅ Đã kiểm tra/thêm cột phone, address vào bảng users.');

        // 2. Thêm cột payment_method vào bảng orders
        await pool.query(`
            ALTER TABLE orders 
            ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) DEFAULT 'ONLINE';
        `);
        console.log('✅ Đã kiểm tra/thêm cột payment_method vào bảng orders.');

        // 3. Cập nhật check constraint trạng thái đơn hàng trên bảng orders
        // Tìm và xóa check constraint cũ liên quan đến cột status
        await pool.query(`
            DO $$ 
            DECLARE 
                r RECORD;
            BEGIN
                FOR r IN 
                    SELECT conname 
                    FROM pg_constraint 
                    WHERE conrelid = 'orders'::regclass 
                      AND contype = 'c' 
                      AND pg_get_constraintdef(oid) LIKE '%status%'
                LOOP
                    EXECUTE 'ALTER TABLE orders DROP CONSTRAINT ' || quote_ident(r.conname);
                END LOOP;
            END $$;
        `);
        console.log('✅ Đã gỡ bỏ ràng buộc check constraint cũ của cột status.');

        // Thêm ràng buộc check constraint mới hỗ trợ 6 trạng thái
        await pool.query(`
            ALTER TABLE orders 
            ADD CONSTRAINT orders_status_check 
            CHECK (status IN ('PENDING', 'CONFIRMED', 'PACKAGING', 'DELIVERING', 'DELIVERED', 'CANCELLED'));
        `);
        console.log('✅ Đã áp dụng check constraint mới (6 trạng thái) cho cột status.');

        console.log('🎉 Quá trình nâng cấp cơ sở dữ liệu hoàn tất thành công!');
    } catch (err) {
        console.error('❌ Lỗi khi thực thi migration:', err.message);
    } finally {
        pool.end();
    }
}

runMigration();
