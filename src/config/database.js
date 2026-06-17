const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Test connection
pool.query('SELECT NOW()', async (err, res) => {
    if (err) {
        console.error('❌ Lỗi kết nối Database:', err.message);
    } else {
        console.log('✅ Database đã kết nối lúc:', res.rows[0].now);
        
        // Tự động tạo bảng book_images cho bộ sưu tập ảnh chi tiết nếu chưa có
        try {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS book_images (
                    id SERIAL PRIMARY KEY,
                    book_id INT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
                    image_url TEXT NOT NULL,
                    display_order INT NOT NULL DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);
            console.log('✅ Migration: Đã kiểm tra/tạo bảng book_images thành công.');
        } catch (imgTableErr) {
            console.error('❌ Migration book_images gặp lỗi:', imgTableErr.message);
        }
        
        // Tự động chạy Migration bổ sung ràng buộc UNIQUE cho cart_items nếu chưa có
        try {
            await pool.query(`
                ALTER TABLE cart_items 
                ADD CONSTRAINT unique_cart_book UNIQUE (cart_id, book_id);
            `);
            console.log('✅ Migration: Đã thêm ràng buộc UNIQUE (cart_id, book_id) thành công.');
        } catch (migErr) {
            if (migErr.code === '42P16' || migErr.code === '42710' || migErr.message.includes('already exists')) {
                console.log('ℹ️ Migration: Ràng buộc UNIQUE cho cart_items đã tồn tại. Bỏ qua.');
            } else {
                console.error('❌ Migration gặp lỗi:', migErr.message);
            }
        }

        // Tự động chạy Migration bổ sung ràng buộc UNIQUE cho inventory(book_id) nếu chưa có
        try {
            await pool.query(`
                ALTER TABLE inventory 
                ADD CONSTRAINT unique_inventory_book UNIQUE (book_id);
            `);
            console.log('✅ Migration: Đã thêm ràng buộc UNIQUE (book_id) cho bảng inventory thành công.');
        } catch (migErr) {
            if (migErr.code === '42P16' || migErr.code === '42710' || migErr.message.includes('already exists') || migErr.message.includes('already a unique constraint')) {
                console.log('ℹ️ Migration: Ràng buộc UNIQUE cho inventory(book_id) đã tồn tại. Bỏ qua.');
            } else {
                console.error('❌ Migration inventory UNIQUE gặp lỗi:', migErr.message);
            }
        }

        // Tự động chạy Migration bổ sung ràng buộc UNIQUE cho coupons(code) nếu chưa có
        try {
            // Bước 1: Dọn dẹp bản ghi trùng lặp trước (chỉ giữ lại bản ghi id nhỏ nhất cho mỗi code)
            const cleanCouponsRes = await pool.query(`
                DELETE FROM coupons 
                WHERE id NOT IN (
                    SELECT MIN(id) 
                    FROM coupons 
                    GROUP BY UPPER(code)
                );
            `);
            if (cleanCouponsRes.rowCount > 0) {
                console.log(`✅ Migration: Đã dọn dẹp ${cleanCouponsRes.rowCount} mã giảm giá bị trùng lặp.`);
            }

            // Bước 2: Thêm ràng buộc UNIQUE
            await pool.query(`
                ALTER TABLE coupons 
                ADD CONSTRAINT unique_coupons_code UNIQUE (code);
            `);
            console.log('✅ Migration: Đã thêm ràng buộc UNIQUE (code) cho bảng coupons thành công.');
        } catch (migErr) {
            if (migErr.code === '42P16' || migErr.code === '42710' || migErr.message.includes('already exists') || migErr.message.includes('already a unique constraint')) {
                console.log('ℹ️ Migration: Ràng buộc UNIQUE cho coupons(code) đã tồn tại. Bỏ qua.');
            } else {
                console.error('❌ Migration coupons UNIQUE gặp lỗi:', migErr.message);
            }
        }

        // Tự động kiểm tra cấu trúc bảng orders và cập nhật các dòng có created_at bị NULL về thời gian hiện tại
        try {
            const colsRes = await pool.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'orders'
            `);
            console.log('📊 Cấu trúc bảng orders (các cột):', colsRes.rows.map(r => r.column_name).join(', '));

            // Tự động kiểm tra/thêm cột cancel_reason nếu chưa có
            await pool.query(`
                ALTER TABLE orders 
                ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
            `);
            console.log('✅ Migration: Đã kiểm tra/thêm cột cancel_reason vào bảng orders.');

            // Tự động kiểm tra/thêm cột is_bestseller vào bảng books nếu chưa có
            await pool.query(`
                ALTER TABLE books 
                ADD COLUMN IF NOT EXISTS is_bestseller BOOLEAN DEFAULT FALSE;
            `);
            console.log('✅ Migration: Đã kiểm tra/thêm cột is_bestseller vào bảng books.');

            // Tự động sửa lỗi used_count = NULL trên bảng coupons
            try {
                // Đảm bảo cột used_count có giá trị mặc định là 0
                await pool.query(`
                    ALTER TABLE coupons 
                    ALTER COLUMN used_count SET DEFAULT 0;
                `);
                console.log('✅ Migration: Đã thiết lập DEFAULT 0 cho cột used_count bảng coupons.');

                // Cập nhật tất cả các coupon có used_count bị NULL về 0
                const couponUpdate = await pool.query(`
                    UPDATE coupons 
                    SET used_count = 0 
                    WHERE used_count IS NULL;
                `);
                if (couponUpdate.rowCount > 0) {
                    console.log(`✅ Migration: Đã tự động cập nhật used_count từ NULL về 0 cho ${couponUpdate.rowCount} mã giảm giá.`);
                }
            } catch (couponErr) {
                console.error('❌ Migration coupons gặp lỗi:', couponErr.message);
            }

            const updateRes = await pool.query(`
                UPDATE orders 
                SET created_at = CURRENT_TIMESTAMP 
                WHERE created_at IS NULL
            `);
            const updateRes2 = await pool.query(`
                UPDATE orders 
                SET updated_at = CURRENT_TIMESTAMP 
                WHERE updated_at IS NULL
            `);
            if (updateRes.rowCount > 0 || updateRes2.rowCount > 0) {
                console.log(`✅ Migration: Đã tự động cập nhật timestamps cho đơn hàng bị NULL (created_at: ${updateRes.rowCount}, updated_at: ${updateRes2.rowCount}).`);
            }

            // Tự động sửa lỗi created_at = NULL trên bảng inventory_transactions
            try {
                // Thiết lập DEFAULT CURRENT_TIMESTAMP cho created_at trên bảng inventory_transactions nếu chưa có
                await pool.query(`
                    ALTER TABLE inventory_transactions 
                    ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
                `);
                console.log('✅ Migration: Đã thiết lập DEFAULT CURRENT_TIMESTAMP cho cột created_at bảng inventory_transactions.');

                // Quét cập nhật các dòng đang bị NULL về thời gian hiện tại
                const txUpdate = await pool.query(`
                    UPDATE inventory_transactions 
                    SET created_at = CURRENT_TIMESTAMP 
                    WHERE created_at IS NULL;
                `);
                if (txUpdate.rowCount > 0) {
                    console.log(`✅ Migration: Đã tự động cập nhật created_at từ NULL về CURRENT_TIMESTAMP cho ${txUpdate.rowCount} dòng lịch sử kho.`);
                }
            } catch (txErr) {
                console.error('❌ Migration inventory_transactions timestamps gặp lỗi:', txErr.message);
            }

            // Tự động sửa lỗi created_at = NULL trên bảng users
            try {
                // Đảm bảo cột created_at tồn tại và có giá trị mặc định là CURRENT_TIMESTAMP
                await pool.query(`
                    ALTER TABLE users 
                    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
                `);
                await pool.query(`
                    ALTER TABLE users 
                    ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
                `);
                console.log('✅ Migration: Đã kiểm tra/thiết lập DEFAULT CURRENT_TIMESTAMP cho cột created_at bảng users.');

                // Quét cập nhật các dòng đang bị NULL về thời gian hiện tại
                const userUpdate = await pool.query(`
                    UPDATE users 
                    SET created_at = CURRENT_TIMESTAMP 
                    WHERE created_at IS NULL;
                `);
                if (userUpdate.rowCount > 0) {
                    console.log(`✅ Migration: Đã tự động cập nhật created_at từ NULL về CURRENT_TIMESTAMP cho ${userUpdate.rowCount} người dùng.`);
                }
            } catch (userErr) {
                console.error('❌ Migration users timestamps gặp lỗi:', userErr.message);
            }

            // Tự động kiểm tra/thêm cột session_id vào bảng users nếu chưa có
            try {
                await pool.query(`
                    ALTER TABLE users 
                    ADD COLUMN IF NOT EXISTS session_id VARCHAR(255);
                `);
                console.log('✅ Migration: Đã kiểm tra/thêm cột session_id vào bảng users.');
            } catch (sessionColErr) {
                console.error('❌ Migration users session_id gặp lỗi:', sessionColErr.message);
            }

            // Tự động kiểm tra/thêm cột reset_password_token và reset_password_expires vào bảng users
            try {
                await pool.query(`
                    ALTER TABLE users 
                    ADD COLUMN IF NOT EXISTS reset_password_token VARCHAR(255),
                    ADD COLUMN IF NOT EXISTS reset_password_expires TIMESTAMP;
                `);
                console.log('✅ Migration: Đã kiểm tra/thêm cột reset_password_token và reset_password_expires vào bảng users.');
            } catch (resetColErr) {
                console.error('❌ Migration users reset password columns gặp lỗi:', resetColErr.message);
            }

            // Tự động kiểm tra và sửa lỗi id bị NULL hoặc trùng lặp trên bảng users (tự phục hồi dữ liệu)
            try {
                // 1. Quét tìm xem có dòng nào id bị NULL không
                const nullIdRes = await pool.query(`SELECT COUNT(*) FROM users WHERE id IS NULL`);
                const nullCount = parseInt(nullIdRes.rows[0].count);
                if (nullCount > 0) {
                    console.log(`⚠️ Phát hiện ${nullCount} người dùng bị NULL id. Đang tự động sửa...`);
                    // Gán tạm id theo sequence
                    await pool.query(`
                        UPDATE users 
                        SET id = nextval(pg_get_serial_sequence('users', 'id'))
                        WHERE id IS NULL;
                    `);
                    console.log('✅ Đã sửa các id bị NULL.');
                }

                // 2. Kiểm tra xem có id nào bị trùng lặp không (nếu thiếu constraint PRIMARY KEY)
                const dupIdRes = await pool.query(`
                    SELECT id, COUNT(*) 
                    FROM users 
                    GROUP BY id 
                    HAVING COUNT(*) > 1
                `);
                if (dupIdRes.rows.length > 0) {
                    console.log(`⚠️ Phát hiện ${dupIdRes.rows.length} id bị trùng lặp trong bảng users! Đang tự động phân bổ lại id...`);
                    // Phân bổ lại id cho các dòng trùng lặp (chỉ giữ lại 1 dòng có id cũ, các dòng khác update lên id mới)
                    for (const row of dupIdRes.rows) {
                        const targetId = row.id;
                        // Lấy danh sách các ctid của các dòng trùng lặp
                        const rowsRes = await pool.query(`SELECT ctid FROM users WHERE id = $1`, [targetId]);
                        // Giữ dòng đầu tiên, các dòng sau update
                        for (let i = 1; i < rowsRes.rows.length; i++) {
                            const ctid = rowsRes.rows[i].ctid;
                            await pool.query(`
                                UPDATE users 
                                SET id = nextval(pg_get_serial_sequence('users', 'id'))
                                WHERE ctid = $1;
                            `, [ctid]);
                        }
                    }
                    console.log('✅ Đã phân bổ lại các id trùng lặp thành công.');
                }

                // 3. Đồng bộ hóa generator sequence cho users(id) để tránh lỗi trùng lặp khi insert mới
                await pool.query(`
                    SELECT setval(
                        pg_get_serial_sequence('users', 'id'), 
                        COALESCE((SELECT MAX(id) FROM users), 0)
                    );
                `);
                console.log('✅ Migration users id sequence: Đã đồng bộ hóa sequence generator thành công.');
            } catch (userKeyErr) {
                console.error('❌ Migration users keys/id gặp lỗi:', userKeyErr.message);
            }

            // Tự động kiểm tra/thêm cột is_featured vào bảng articles nếu chưa có
            try {
                await pool.query(`
                    ALTER TABLE articles 
                    ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT FALSE;
                `);
                console.log('✅ Migration: Đã kiểm tra/thêm cột is_featured vào bảng articles.');
            } catch (artErr) {
                console.error('❌ Migration articles is_featured gặp lỗi:', artErr.message);
            }

            // Tự động dọn dẹp các dòng trùng lặp trong bảng articles nếu có (giữ lại bản ghi đầu tiên)
            try {
                const cleanArticlesRes = await pool.query(`
                    DELETE FROM articles 
                    WHERE ctid NOT IN (
                        SELECT MIN(ctid) 
                        FROM articles 
                        GROUP BY id
                    );
                `);
                if (cleanArticlesRes.rowCount > 0) {
                    console.log(`✅ Migration articles: Đã dọn dẹp ${cleanArticlesRes.rowCount} bài viết bị trùng lặp.`);
                }
            } catch (cleanArtErr) {
                console.error('❌ Migration articles cleanup gặp lỗi:', cleanArtErr.message);
            }

            // Đảm bảo cột id có ràng buộc PRIMARY KEY nếu chưa có
            try {
                await pool.query(`
                    ALTER TABLE articles ADD PRIMARY KEY (id);
                `);
            } catch (pkErr) {
                if (pkErr.code === '42P16' || pkErr.message.includes('already exists') || pkErr.message.includes('already a primary key') || pkErr.message.includes('multiple primary keys')) {
                    console.log('ℹ️ Migration articles: Ràng buộc PRIMARY KEY cho articles đã tồn tại. Bỏ qua.');
                } else {
                    console.error('❌ Migration articles PRIMARY KEY gặp lỗi:', pkErr.message);
                }
            }

            // Đảm bảo đồng bộ hóa sequence generator của bảng articles để tránh lỗi unique constraint articles_pkey
            try {
                await pool.query(`
                    SELECT setval(
                        pg_get_serial_sequence('articles', 'id'), 
                        COALESCE((SELECT MAX(id) FROM articles), 0)
                    );
                `);
                console.log('✅ Migration articles: Đã đồng bộ hóa sequence generator thành công.');
            } catch (seqErr) {
                console.error('❌ Migration articles sequence reset gặp lỗi:', seqErr.message);
            }

            // Đảm bảo cột created_at trong bảng articles có DEFAULT CURRENT_TIMESTAMP và cập nhật các dòng đang bị NULL
            try {
                await pool.query(`
                    ALTER TABLE articles 
                    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
                `);
                await pool.query(`
                    ALTER TABLE articles 
                    ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
                `);
                console.log('✅ Migration articles: Đã kiểm tra/thiết lập DEFAULT CURRENT_TIMESTAMP cho cột created_at.');

                const artUpdate = await pool.query(`
                    UPDATE articles 
                    SET created_at = CURRENT_TIMESTAMP 
                    WHERE created_at IS NULL;
                `);
                if (artUpdate.rowCount > 0) {
                    console.log(`✅ Migration articles: Đã tự động cập nhật created_at từ NULL về CURRENT_TIMESTAMP cho ${artUpdate.rowCount} bài viết.`);
                }
            } catch (artDateErr) {
                console.error('❌ Migration articles created_at gặp lỗi:', artDateErr.message);
            }

            // Tự động kiểm tra/tạo bảng reviews và bổ sung ràng buộc UNIQUE(book_id, user_id)
            try {
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
                console.log('✅ Migration: Đã kiểm tra/tạo bảng reviews.');

                // Dọn dẹp trùng lặp
                const cleanReviewsRes = await pool.query(`
                    DELETE FROM reviews 
                    WHERE id NOT IN (
                        SELECT MAX(id) 
                        FROM reviews 
                        GROUP BY book_id, user_id
                    );
                `);
                if (cleanReviewsRes.rowCount > 0) {
                    console.log(`✅ Migration reviews: Đã dọn dẹp ${cleanReviewsRes.rowCount} đánh giá bị trùng lặp.`);
                }

                // Thêm ràng buộc UNIQUE nếu chưa có
                await pool.query(`
                    ALTER TABLE reviews 
                    ADD CONSTRAINT unique_book_user_review UNIQUE (book_id, user_id);
                `);
                console.log('✅ Migration reviews: Đã đảm bảo ràng buộc UNIQUE (book_id, user_id) cho bảng reviews.');

                // Quét cập nhật các dòng đang bị NULL về thời gian hiện tại
                const revUpdate = await pool.query(`
                    UPDATE reviews 
                    SET created_at = CURRENT_TIMESTAMP 
                    WHERE created_at IS NULL;
                `);
                if (revUpdate.rowCount > 0) {
                    console.log(`✅ Migration reviews: Đã tự động cập nhật created_at từ NULL về CURRENT_TIMESTAMP cho ${revUpdate.rowCount} đánh giá.`);
                }
            } catch (revErr) {
                if (revErr.code === '42P16' || revErr.code === '42710' || revErr.message.includes('already exists') || revErr.message.includes('already a unique constraint')) {
                    console.log('ℹ️ Migration reviews: Ràng buộc UNIQUE cho reviews đã được đảm bảo. Bỏ qua.');
                } else {
                    console.error('❌ Migration reviews gặp lỗi:', revErr.message);
                }
            }
        } catch (orderErr) {
            console.error('❌ Lỗi kiểm tra/cập nhật bảng orders hoặc coupons:', orderErr.message);
        }
    }
});

module.exports = pool;