const { Pool } = require('pg');

require('dotenv').config();
const productionConnectionString = process.env.PROD_DATABASE_URL;
if (!productionConnectionString) { console.error('❌ Thiếu biến môi trường PROD_DATABASE_URL (chuỗi kết nối Neon). Xem database/README.md.'); process.exit(1); }

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
