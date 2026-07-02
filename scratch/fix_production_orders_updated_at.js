const { Pool } = require('pg');

const productionConnectionString = 'postgresql://sdl_database_new_user:XvBZdbja7OJ9F4TlTJoNNbVX9DqiebFD@dpg-d8v159cm0tmc738p8bsg-a.singapore-postgres.render.com/sdl_database_new';

const pool = new Pool({
    connectionString: productionConnectionString,
    ssl: {
        rejectUnauthorized: false
    }
});

async function fixOrdersTable() {
    console.log('=== BẮT ĐẦU SỬA BẢNG ORDERS TRÊN PRODUCTION ===');
    const client = await pool.connect();
    
    try {
        // 1. Thêm cột updated_at vào bảng orders nếu chưa tồn tại
        const alterQuery = `
            ALTER TABLE orders 
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        `;
        await client.query(alterQuery);
        console.log('✅ Đã thêm thành công cột "updated_at" vào bảng "orders".');

        // 2. Kiểm tra lại cấu hình bảng
        const checkQuery = `
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'orders' AND column_name = 'updated_at';
        `;
        const res = await client.query(checkQuery);
        if (res.rows.length > 0) {
            console.log('🔍 Xác nhận: Cột "updated_at" hiện đã tồn tại trong Database.');
            console.log(res.rows[0]);
        } else {
            console.log('❌ Lỗi: Không thể tìm thấy cột sau khi thực hiện ALTER TABLE.');
        }

    } catch (err) {
        console.error('❌ Lỗi thực thi:', err.message);
    } finally {
        client.release();
        await pool.end();
        console.log('🔌 Kết nối đóng.');
    }
}

fixOrdersTable();
