const { Pool } = require('pg');

const productionConnectionString = 'postgresql://sdl_database_new_user:XvBZdbja7OJ9F4TlTJoNNbVX9DqiebFD@dpg-d8v159cm0tmc738p8bsg-a.singapore-postgres.render.com/sdl_database_new';

const pool = new Pool({
    connectionString: productionConnectionString,
    ssl: {
        rejectUnauthorized: false
    }
});

async function checkAllBooks() {
    try {
        console.log('📚 Đang đọc danh sách sách từ Production Database...');
        const res = await pool.query('SELECT id, title, status, is_featured, is_bestseller, stock_quantity, cover_url FROM books ORDER BY id DESC;');
        console.table(res.rows);
    } catch (err) {
        console.error('❌ Lỗi:', err.message);
    } finally {
        await pool.end();
    }
}

checkAllBooks();
