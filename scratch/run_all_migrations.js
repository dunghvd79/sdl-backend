const { execSync } = require('child_process');
const pool = require('../src/config/database');

async function runAll() {
    console.log('🏁 Bắt đầu chạy chuỗi migration nâng cấp database...');
    
    // 1. Tạo các bảng Phase 4 (carts, cart_items, inventory...) một cách an toàn
    try {
        console.log('🔹 Tạo các bảng carts, cart_items, inventory...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS carts (
                id SERIAL PRIMARY KEY,
                user_id INT REFERENCES users(id) ON DELETE CASCADE UNIQUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS cart_items (
                id SERIAL PRIMARY KEY,
                cart_id INT REFERENCES carts(id) ON DELETE CASCADE,
                book_id INT REFERENCES books(id) ON DELETE CASCADE,
                quantity INT NOT NULL DEFAULT 1,
                price_at_add DECIMAL NOT NULL,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(cart_id, book_id)
            );

            CREATE TABLE IF NOT EXISTS inventory (
                book_id INT PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
                available_qty INT DEFAULT 0,
                reserved_qty INT DEFAULT 0,
                sold_qty INT DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS inventory_transactions (
                id SERIAL PRIMARY KEY,
                book_id INT REFERENCES books(id) ON DELETE CASCADE,
                type VARCHAR(50) CHECK (type IN ('STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT', 'RETURN')),
                quantity INT NOT NULL,
                previous_qty INT NOT NULL,
                new_qty INT NOT NULL,
                reason TEXT,
                created_by INT REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ Tạo các bảng Phase 4 thành công!');
    } catch (e) {
        console.error('❌ Lỗi tạo các bảng Phase 4:', e.message);
    }

    // Đóng pool để các script chạy sau không bị xung đột
    await pool.end();

    // Danh sách các file migration cần chạy theo thứ tự
    const scripts = [
        'src/utils/migration_coupons.js',
        'src/utils/migration_purchase.js',
        'src/utils/migration_reviews.js',
        'src/utils/migration_shipping.js',
        'src/utils/migration_wishlist_notification.js',
        'src/utils/migrate_articles.js',
        'src/utils/migration_product_manager.js',
        'src/utils/migration_admin_updates.js',
        'src/utils/migrate_display_order.js',
        'src/utils/migrate_featured.js',
        'src/utils/migrate_fts.js'
    ];

    for (const script of scripts) {
        console.log(`\n🏃 Đang chạy script: ${script}...`);
        try {
            const output = execSync(`node ${script}`, { encoding: 'utf-8' });
            console.log(output);
        } catch (err) {
            console.error(`❌ Lỗi khi chạy script ${script}:`, err.message);
        }
    }

    console.log('\n🎉 Đã hoàn thành tất cả các migrations thiết lập database!');
}

runAll();
