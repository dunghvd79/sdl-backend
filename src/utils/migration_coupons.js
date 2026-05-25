const pool = require('../config/database');

async function runMigration() {
    try {
        console.log('⏳ Đang tiến hành tạo cấu trúc cơ sở dữ liệu cho tính năng Mã giảm giá (Coupon)...');

        // 1. Tạo bảng coupons
        await pool.query(`
            CREATE TABLE IF NOT EXISTS coupons (
                id SERIAL PRIMARY KEY,
                code VARCHAR(50) UNIQUE NOT NULL,
                discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('PERCENT', 'FIXED')),
                discount_value NUMERIC NOT NULL CHECK (discount_value > 0),
                min_order_amount NUMERIC DEFAULT 0 CHECK (min_order_amount >= 0),
                max_discount_amount NUMERIC CHECK (max_discount_amount >= 0),
                start_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                end_date TIMESTAMP NOT NULL,
                usage_limit INTEGER DEFAULT 100 CHECK (usage_limit >= 0),
                used_count INTEGER DEFAULT 0 CHECK (used_count >= 0),
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ Đã tạo bảng coupons thành công.');

        // 2. Tạo bảng user_coupons (Lưu lịch sử sử dụng để chống dùng lặp lại)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS user_coupons (
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                coupon_id INTEGER REFERENCES coupons(id) ON DELETE CASCADE,
                used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, coupon_id)
            );
        `);
        console.log('✅ Đã tạo bảng user_coupons thành công.');

        // 3. Thêm các cột coupon_id và discount_amount vào bảng orders
        await pool.query(`
            ALTER TABLE orders 
            ADD COLUMN IF NOT EXISTS coupon_id INTEGER REFERENCES coupons(id) ON DELETE SET NULL,
            ADD COLUMN IF NOT EXISTS discount_amount NUMERIC DEFAULT 0 CHECK (discount_amount >= 0);
        `);
        console.log('✅ Đã cập nhật các trường giảm giá cho bảng orders.');

        // 4. Chèn dữ liệu mẫu
        await pool.query(`
            INSERT INTO coupons (code, discount_type, discount_value, min_order_amount, max_discount_amount, start_date, end_date, usage_limit)
            VALUES 
            ('GIAM10', 'PERCENT', 10, 0, 50000, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '30 days', 100),
            ('SDL50K', 'FIXED', 50000, 150000, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '30 days', 50)
            ON CONFLICT (code) DO NOTHING;
        `);
        console.log('✅ Đã chèn các mã giảm giá thử nghiệm: GIAM10 (10%, tối đa 50k), SDL50K (Giảm 50k cho đơn từ 150k).');

        console.log('🎉 Quá trình nâng cấp cơ sở dữ liệu coupon hoàn tất thành công!');
    } catch (err) {
        console.error('❌ Lỗi khi thực thi migration coupons:', err.message);
    } finally {
        pool.end();
    }
}

runMigration();
