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

async function syncProductionInventory() {
    console.log('=== BẮT ĐẦU ĐỒNG BỘ VÀ LÀM SẠCH KHO PRODUCTION ===');
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');

        // 1. Kiểm tra xem có đơn hàng nào trên Production hay chưa
        const ordersRes = await client.query('SELECT COUNT(*) as count FROM orders');
        const orderCount = parseInt(ordersRes.rows[0].count, 10);
        console.log(`📊 Số lượng đơn hàng hiện tại trên Production: ${orderCount}`);

        // 2. Tính toán lượng giữ chỗ thực tế từ các đơn hàng PENDING trên Production
        const pendingRes = await client.query(`
            SELECT oi.book_id, SUM(oi.quantity) as pending_qty
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.id
            WHERE o.status = 'PENDING'
            GROUP BY oi.book_id
        `);
        const pendingMap = new Map();
        for (const row of pendingRes.rows) {
            pendingMap.set(row.book_id, parseInt(row.pending_qty, 10));
        }

        // 3. Tính toán lượng đã bán thực tế từ các đơn hàng hoàn tất trên Production
        const soldRes = await client.query(`
            SELECT oi.book_id, SUM(oi.quantity) as sold_qty
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.id
            WHERE o.status IN ('CONFIRMED', 'PACKAGING', 'DELIVERING', 'DELIVERED')
            GROUP BY oi.book_id
        `);
        const soldMap = new Map();
        for (const row of soldRes.rows) {
            soldMap.set(row.book_id, parseInt(row.sold_qty, 10));
        }

        // 4. Lấy tất cả tồn kho hiện tại để đối chiếu
        const invRes = await client.query('SELECT i.book_id, b.title, i.available_qty, i.reserved_qty, i.sold_qty FROM inventory i JOIN books b ON i.book_id = b.id');
        
        let updateCount = 0;
        for (const inv of invRes.rows) {
            const correctReserved = pendingMap.get(inv.book_id) || 0;
            const correctSold = soldMap.get(inv.book_id) || 0;

            if (inv.reserved_qty !== correctReserved || inv.sold_qty !== correctSold) {
                await client.query(`
                    UPDATE inventory
                    SET reserved_qty = $1, sold_qty = $2, updated_at = CURRENT_TIMESTAMP
                    WHERE book_id = $3
                `, [correctReserved, correctSold, inv.book_id]);

                console.log(`✏️ Đã sửa Sách "${inv.title}" (ID #${inv.book_id}):`);
                console.log(`   - Đang giữ: ${inv.reserved_qty} -> ${correctReserved}`);
                console.log(`   - Đã bán: ${inv.sold_qty} -> ${correctSold}`);
                updateCount++;
            }
        }

        await client.query('COMMIT');
        console.log(`\n🎉 Đã hoàn thành đồng bộ! Tổng số bản ghi kho cần sửa: ${updateCount}`);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Lỗi:', err.message);
    } finally {
        client.release();
        await pool.end();
        console.log('🔌 Kết nối đóng.');
    }
}

syncProductionInventory();
