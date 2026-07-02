const { Pool } = require('pg');

const productionConnectionString = 'postgresql://sdl_database_new_user:XvBZdbja7OJ9F4TlTJoNNbVX9DqiebFD@dpg-d8v159cm0tmc738p8bsg-a.singapore-postgres. Sing-postgres.render.com/sdl_database_new';
// Wait, the host in connection string was:
// postgresql://sdl_database_new_user:XvBZdbja7OJ9F4TlTJoNNbVX9DqiebFD@dpg-d8v159cm0tmc738p8bsg-a.singapore-postgres.render.com/sdl_database_new
const connStr = 'postgresql://sdl_database_new_user:XvBZdbja7OJ9F4TlTJoNNbVX9DqiebFD@dpg-d8v159cm0tmc738p8bsg-a.singapore-postgres.render.com/sdl_database_new';

const pool = new Pool({
    connectionString: connStr,
    ssl: {
        rejectUnauthorized: false
    }
});

async function fixOrderItemsTable() {
    console.log('=== BẮT ĐẦU SỬA BẢNG ORDER_ITEMS TRÊN PRODUCTION ===');
    const client = await pool.connect();
    
    try {
        // 1. Kiểm tra xem cột price_at_purchase có tồn tại không
        const checkOldColQuery = `
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'order_items' AND column_name = 'price_at_purchase';
        `;
        const oldColRes = await client.query(checkOldColQuery);
        
        if (oldColRes.rows.length > 0) {
            console.log('🔍 Phát hiện cột "price_at_purchase". Đang tiến hành đổi tên sang "price"...');
            await client.query('ALTER TABLE order_items RENAME COLUMN price_at_purchase TO price;');
            console.log('✅ Đã đổi tên thành công.');
        } else {
            console.log('ℹ️ Cột "price_at_purchase" không tồn tại hoặc đã được đổi tên từ trước.');
        }

        // 2. Xác nhận cột price tồn tại
        const checkNewColQuery = `
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'order_items' AND column_name = 'price';
        `;
        const newColRes = await client.query(checkNewColQuery);
        if (newColRes.rows.length > 0) {
            console.log('🔍 Xác nhận: Cột "price" hiện đã tồn tại trong bảng "order_items":');
            console.log(newColRes.rows[0]);
        } else {
            console.log('❌ Lỗi: Cột "price" không tồn tại trong bảng "order_items".');
        }

    } catch (err) {
        console.error('❌ Lỗi thực thi:', err.message);
    } finally {
        client.release();
        await pool.end();
        console.log('🔌 Kết nối đóng.');
    }
}

fixOrderItemsTable();
