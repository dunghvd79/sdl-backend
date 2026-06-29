const { Pool } = require('pg');

const localPool = new Pool({
    user: 'sdl_user',
    host: 'localhost',
    database: 'sdl_db',
    password: 'sdl_password_123',
    port: 5432,
    ssl: false
});

const prodPool = new Pool({
    connectionString: 'postgresql://sdl_database_new_user:XvBZdbja7OJ9F4TlTJoNNbVX9DqiebFD@dpg-d8v159cm0tmc738p8bsg-a.singapore-postgres.render.com/sdl_database_new',
    ssl: { rejectUnauthorized: false }
});

async function syncData() {
    console.log('🔄 Bắt đầu đồng bộ dữ liệu Sách từ Local lên Production...');
    try {
        // 1. Đồng bộ categories
        console.log('🔹 Đồng bộ categories...');
        const localCats = await localPool.query('SELECT * FROM categories;');
        for (const cat of localCats.rows) {
            await prodPool.query(
                'INSERT INTO categories (id, name, description) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;',
                [cat.id, cat.name, cat.description]
            );
        }
        console.log(`✅ Đã đồng bộ ${localCats.rows.length} thể loại.`);

        // 2. Đồng bộ books
        console.log('🔹 Đảm bảo cấu trúc cột isbn trong bảng books...');
        await prodPool.query('ALTER TABLE books ADD COLUMN IF NOT EXISTS isbn VARCHAR(50);');

        console.log('🔹 Đồng bộ books...');
        const localBooks = await localPool.query('SELECT * FROM books;');
        for (const book of localBooks.rows) {
            await prodPool.query(
                `INSERT INTO books (id, title, author, isbn, description, price, cover_url, status, is_featured, is_bestseller, display_order, created_at) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) 
                 ON CONFLICT (id) DO UPDATE SET 
                    title = EXCLUDED.title, author = EXCLUDED.author, isbn = EXCLUDED.isbn, 
                    description = EXCLUDED.description, price = EXCLUDED.price, cover_url = EXCLUDED.cover_url,
                    status = EXCLUDED.status, is_featured = EXCLUDED.is_featured, is_bestseller = EXCLUDED.is_bestseller,
                    display_order = EXCLUDED.display_order;`,
                [book.id, book.title, book.author, book.isbn, book.description, book.price, book.cover_url, book.status, book.is_featured, book.is_bestseller, book.display_order, book.created_at]
            );
        }
        console.log(`✅ Đã đồng bộ ${localBooks.rows.length} cuốn sách.`);

        // 3. Đồng bộ book_categories (bảng trung gian)
        console.log('🔹 Đồng bộ book_categories...');
        const localBookCats = await localPool.query('SELECT * FROM book_categories;');
        for (const bc of localBookCats.rows) {
            await prodPool.query(
                'INSERT INTO book_categories (book_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING;',
                [bc.book_id, bc.category_id]
            );
        }
        console.log(`✅ Đã đồng bộ ${localBookCats.rows.length} mối quan hệ sách - thể loại.`);

        // 4. Đồng bộ book_images
        console.log('🔹 Đồng bộ book_images...');
        const localBookImages = await localPool.query('SELECT * FROM book_images;');
        for (const img of localBookImages.rows) {
            await prodPool.query(
                'INSERT INTO book_images (id, book_id, image_url, display_order) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING;',
                [img.id, img.book_id, img.image_url, img.display_order]
            );
        }
        console.log(`✅ Đã đồng bộ ${localBookImages.rows.length} ảnh chi tiết sách.`);

        // 5. Đồng bộ inventory
        console.log('🔹 Đồng bộ inventory...');
        const localInv = await localPool.query('SELECT * FROM inventory;');
        for (const inv of localInv.rows) {
            await prodPool.query(
                'INSERT INTO inventory (book_id, available_qty, reserved_qty, sold_qty) VALUES ($1, $2, $3, $4) ON CONFLICT (book_id) DO UPDATE SET available_qty = EXCLUDED.available_qty, reserved_qty = EXCLUDED.reserved_qty, sold_qty = EXCLUDED.sold_qty;',
                [inv.book_id, inv.available_qty, inv.reserved_qty, inv.sold_qty]
            );
        }
        console.log(`✅ Đã đồng bộ ${localInv.rows.length} bản ghi tồn kho.`);

        // 6. Đồng bộ articles
        console.log('🔹 Đảm bảo cấu trúc cột is_featured trong bảng articles...');
        await prodPool.query('ALTER TABLE articles ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT FALSE;');

        console.log('🔹 Đồng bộ articles...');
        const localArts = await localPool.query('SELECT * FROM articles;');
        for (const art of localArts.rows) {
            await prodPool.query(
                `INSERT INTO articles (id, title, summary, content, cover_url, category, reading_time, status, is_featured, created_at) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
                 ON CONFLICT (id) DO UPDATE SET 
                    title = EXCLUDED.title, summary = EXCLUDED.summary, content = EXCLUDED.content, 
                    cover_url = EXCLUDED.cover_url, category = EXCLUDED.category, reading_time = EXCLUDED.reading_time, 
                    status = EXCLUDED.status, is_featured = EXCLUDED.is_featured;`,
                [art.id, art.title, art.summary, art.content, art.cover_url, art.category, art.reading_time, art.status, art.is_featured, art.created_at]
            );
        }
        console.log(`✅ Đã đồng bộ ${localArts.rows.length} bài viết blog.`);

        // 7. Đồng bộ sequence generators cho PostgreSQL
        console.log('🔹 Đồng bộ sequence generators...');
        await prodPool.query("SELECT setval(pg_get_serial_sequence('books', 'id'), COALESCE((SELECT MAX(id) FROM books), 1), false);");
        await prodPool.query("SELECT setval(pg_get_serial_sequence('categories', 'id'), COALESCE((SELECT MAX(id) FROM categories), 1), false);");
        await prodPool.query("SELECT setval(pg_get_serial_sequence('book_images', 'id'), COALESCE((SELECT MAX(id) FROM book_images), 1), false);");
        await prodPool.query("SELECT setval(pg_get_serial_sequence('articles', 'id'), COALESCE((SELECT MAX(id) FROM articles), 1), false);");
        console.log('✅ Đồng bộ các sequence thành công!');

        console.log('🎉 Đồng bộ dữ liệu lên Production hoàn tất rực rỡ!');
    } catch (e) {
        console.error('❌ Lỗi trong quá trình đồng bộ:', e);
    } finally {
        localPool.end();
        prodPool.end();
    }
}

syncData();
