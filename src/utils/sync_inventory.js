const pool = require('../config/database');

async function syncInventory() {
    console.log("=== BẮT ĐẦU ĐỒNG BỘ HÓA VÀ SỬA CHỮA DỮ LIỆU TỒN KHO ===");
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');

        // 1. Phân tích các giao dịch kho để tìm các Order ID đã được xử lý xuất kho
        console.log("🔍 Đang quét lịch sử giao dịch kho (inventory_transactions)...");
        const txRes = await client.query('SELECT reason FROM inventory_transactions WHERE reason IS NOT NULL');
        const processedOrders = new Set();
        
        for (const row of txRes.rows) {
            const match = row.reason.match(/#(\d+)/);
            if (match) {
                const orderId = parseInt(match[1], 10);
                processedOrders.add(orderId);
            }
        }
        console.log(`👉 Đã tìm thấy ${processedOrders.size} đơn hàng đã từng trừ kho:`, Array.from(processedOrders));

        // 2. Tìm tất cả các đơn hàng thành công hoặc đang xử lý (CONFIRMED, PACKAGING, DELIVERING, DELIVERED)
        console.log("\n🔍 Đang quét các đơn hàng thành công/đang xử lý trong DB...");
        const ordersRes = await client.query(`
            SELECT id, status, total_amount, created_at 
            FROM orders 
            WHERE status IN ('CONFIRMED', 'PACKAGING', 'DELIVERING', 'DELIVERED')
            ORDER BY id ASC
        `);
        console.log(`👉 Tổng số đơn hàng thành công/đang xử lý trong DB: ${ordersRes.rows.length}`);

        let syncCount = 0;

        for (const order of ordersRes.rows) {
            const orderId = order.id;
            if (processedOrders.has(orderId)) {
                console.log(`  - Đơn hàng #${orderId} (${order.status}): Đã được trừ kho trước đó. Bỏ qua.`);
                continue;
            }

            console.log(`  - Đơn hàng #${orderId} (${order.status}): CHƯA trừ kho. Bắt đầu xử lý đồng bộ...`);
            
            // Lấy các mặt hàng trong đơn hàng này
            const itemsRes = await client.query(`
                SELECT book_id, quantity 
                FROM order_items 
                WHERE order_id = $1
            `, [orderId]);

            for (const item of itemsRes.rows) {
                const bookId = item.book_id;
                const quantity = item.quantity;

                // Khóa dòng tồn kho của cuốn sách
                const getQuery = 'SELECT * FROM inventory WHERE book_id = $1 FOR UPDATE';
                const getResult = await client.query(getQuery, [bookId]);
                let inventory = getResult.rows[0];

                if (!inventory) {
                    // Nếu sách chưa có trong bảng inventory, tự động tạo mới
                    const insertQuery = `
                        INSERT INTO inventory (book_id, available_qty, reserved_qty, sold_qty)
                        VALUES ($1, 10, 0, 0)
                        RETURNING *
                    `;
                    const insertResult = await client.query(insertQuery, [bookId]);
                    inventory = insertResult.rows[0];
                }

                const prevQty = inventory.available_qty;
                const newAvailableQty = Math.max(0, inventory.available_qty - quantity);
                const newSoldQty = inventory.sold_qty + quantity;

                // Cập nhật tồn kho
                const updateQuery = `
                    UPDATE inventory
                    SET available_qty = $2, sold_qty = $3, updated_at = CURRENT_TIMESTAMP
                    WHERE book_id = $1
                `;
                await client.query(updateQuery, [bookId, newAvailableQty, newSoldQty]);

                // Ghi nhật ký biến động kho
                const logQuery = `
                    INSERT INTO inventory_transactions (book_id, type, quantity, previous_qty, new_qty, reason)
                    VALUES ($1, 'STOCK_OUT', $2, $3, $4, $5)
                `;
                const reason = `Đồng bộ xuất kho tự động (Đơn hàng #${orderId})`;
                await client.query(logQuery, [bookId, -quantity, prevQty, newAvailableQty, reason]);

                console.log(`    * Sách ID #${bookId}: Sẵn có ${prevQty} -> ${newAvailableQty} | Đã bán ${inventory.sold_qty} -> ${newSoldQty}`);
            }

            processedOrders.add(orderId);
            syncCount++;
        }
        console.log(`👉 Đã đồng bộ thành công ${syncCount} đơn hàng cũ chưa trừ kho.`);

        // 3. Reset và tính toán lại cột reserved_qty dựa trên các đơn hàng PENDING thực tế
        console.log("\n🔍 Bắt đầu cập nhật và làm sạch cột Đang giữ (reserved_qty)...");
        
        // Tính tổng số lượng giữ cho từng sách từ các đơn hàng PENDING
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

        // Cập nhật tất cả bản ghi inventory
        const allInventoryRes = await client.query('SELECT book_id, reserved_qty FROM inventory');
        let cleanCount = 0;
        
        for (const inv of allInventoryRes.rows) {
            const bookId = inv.book_id;
            const correctReserved = pendingMap.get(bookId) || 0;
            
            if (inv.reserved_qty !== correctReserved) {
                await client.query(`
                    UPDATE inventory 
                    SET reserved_qty = $1, updated_at = CURRENT_TIMESTAMP 
                    WHERE book_id = $2
                `, [correctReserved, bookId]);
                console.log(`  - Sách ID #${bookId}: Đang giữ (reserved_qty) sửa từ ${inv.reserved_qty} -> ${correctReserved}`);
                cleanCount++;
            }
        }
        console.log(`👉 Đã sửa lượng "Đang giữ" của ${cleanCount} cuốn sách.`);

        await client.query('COMMIT');
        console.log("\n✅ HOÀN TẤT ĐỒNG BỘ HÓA TỒN KHO THÀNH CÔNG RỰC RỠ!");
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("\n❌ GẶP LỖI KHI ĐỒNG BỘ HÓA TỒN KHO:", err);
    } finally {
        client.release();
        pool.end();
    }
}

syncInventory();
