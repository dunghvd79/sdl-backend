const pool = require('../config/database');
const CartService = require('../services/cartService');
const OrderService = require('../services/orderService');
const Inventory = require('../models/Inventory');
const Payment = require('../models/Payment');

async function runTest() {
    console.log("=== BẮT ĐẦU KIỂM THỬ TỰ ĐỘNG TÍNH NĂNG COD & THANH TOÁN NÂNG CAO (TDD) ===");
    
    const bookId = 2; // "Mắt Biếc"
    const testUserId = 2; // CUSTOMER

    try {
        // Dọn dẹp dữ liệu rác trước khi test
        await pool.query('DELETE FROM cart_items WHERE cart_id = (SELECT id FROM carts WHERE user_id = $1)', [testUserId]);
        await pool.query('DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE user_id = $1)', [testUserId]);
        await pool.query('DELETE FROM payments WHERE order_id IN (SELECT id FROM orders WHERE user_id = $1)', [testUserId]);
        await pool.query('DELETE FROM orders WHERE user_id = $1', [testUserId]);
        
        // Reset tồn kho cho sách chạy test
        await pool.query(`
            INSERT INTO inventory (book_id, available_qty, reserved_qty, sold_qty) 
            VALUES ($1, 100, 0, 0) 
            ON CONFLICT (book_id) DO UPDATE 
            SET available_qty = 100, reserved_qty = 0, sold_qty = 0
        `, [bookId]);

        // Trạng thái kho ban đầu
        let initStock = await Inventory.getStatus(bookId);
        const startAvailable = initStock.available_qty;
        const startReserved = initStock.reserved_qty;

        console.log("📊 Trạng thái kho ban đầu:", {
            available: startAvailable,
            reserved: startReserved
        });

        // ----------------------------------------------------
        // TEST CASE 1: Đơn hàng ONLINE hết hạn sau 15 phút -> Tự động hủy và giải phóng kho
        // ----------------------------------------------------
        console.log("\n🧪 TEST CASE 1: Tự động hủy đơn hàng ONLINE hết hạn thanh toán...");
        
        // 1. Thêm sách vào giỏ
        await CartService.addToCart(testUserId, bookId, 1);
        
        // 2. Đặt hàng ONLINE (Giỏ hàng chưa bị xóa)
        const order1 = await OrderService.checkout(testUserId, {
            shippingName: "Test Auto Cancel",
            shippingPhone: "0999999999",
            shippingAddress: "Địa Chỉ Test 1"
        }, 'ONLINE', null);
        console.log(`👉 Đã tạo đơn hàng ONLINE #${order1.id} (status: ${order1.status}, payment: ${order1.payment_method})`);

        // Tạo giao dịch thanh toán trong bảng payments
        await Payment.create(order1.id, order1.total_amount, 'PAYOS');
        
        let stock1 = await Inventory.getStatus(bookId);
        if (stock1.reserved_qty !== startReserved + 1) throw new Error("Thất bại: reserved_qty không tăng sau checkout");

        // 3. Giả lập đơn hàng tạo từ 20 phút trước
        await pool.query("UPDATE orders SET created_at = CURRENT_TIMESTAMP - INTERVAL '20 minutes' WHERE id = $1", [order1.id]);
        
        // 4. Chạy hàm quét hủy đơn hàng hết hạn
        console.log("  - Đang chạy quét đơn hàng hết hạn...");
        const expiredCount = await OrderService.checkAndCancelExpiredOrders();
        console.log(`  - Đã quét xong. Số lượng đơn bị hủy: ${expiredCount}`);

        if (expiredCount === 0) throw new Error("Thất bại: checkAndCancelExpiredOrders không tìm thấy đơn hết hạn!");

        // 5. Kiểm tra trạng thái đơn hàng & kho
        const checkOrder1 = await OrderService.getOrderById(order1.id);
        console.log(`  - Trạng thái đơn hàng sau quét: ${checkOrder1.status} | Lý do: ${checkOrder1.cancel_reason}`);
        if (checkOrder1.status !== 'CANCELLED') throw new Error("Thất bại: Đơn hàng chưa chuyển sang CANCELLED");

        let stock1After = await Inventory.getStatus(bookId);
        console.log(`  - Kho sau khi quét: available: ${stock1After.available_qty}, reserved: ${stock1After.reserved_qty}`);
        if (stock1After.reserved_qty !== startReserved) throw new Error("Thất bại: reserved_qty không được giải phóng");

        const checkPayment1 = await Payment.findByOrderId(order1.id);
        console.log(`  - Trạng thái giao dịch trong bảng payments: ${checkPayment1.status}`);
        if (checkPayment1.status !== 'FAILED') throw new Error("Thất bại: Giao dịch thanh toán chưa chuyển sang FAILED");

        console.log("✅ TEST CASE 1 THÀNH CÔNG!");

        // ----------------------------------------------------
        // TEST CASE 2: Đổi phương thức thanh toán từ ONLINE sang COD cho đơn hàng PENDING
        // ----------------------------------------------------
        console.log("\n🧪 TEST CASE 2: Chuyển đổi phương thức thanh toán từ ONLINE sang COD...");
        
        // 1. Thêm sách vào giỏ
        await CartService.addToCart(testUserId, bookId, 1);

        // 2. Đặt hàng ONLINE (Giỏ hàng chưa bị xóa)
        const order2 = await OrderService.checkout(testUserId, {
            shippingName: "Test Change Payment Method",
            shippingPhone: "0999999999",
            shippingAddress: "Địa Chỉ Test 2"
        }, 'ONLINE', null);
        console.log(`👉 Đã tạo đơn hàng ONLINE #${order2.id} (status: ${order2.status}, payment: ${order2.payment_method})`);

        await Payment.create(order2.id, order2.total_amount, 'PAYOS');

        // Kiểm tra xem giỏ hàng còn sách không
        const cartBefore = await CartService.getCart(testUserId);
        const hasItemBefore = cartBefore.items.some(i => i.bookId === bookId);
        if (!hasItemBefore) throw new Error("Lỗi giả lập: Sách phải còn trong giỏ đối với đơn ONLINE chưa thanh toán!");

        // 3. Thực hiện chuyển sang COD
        console.log(`  - Thực hiện đổi phương thức thanh toán đơn #${order2.id} sang COD...`);
        await OrderService.changeToCod(order2.id, testUserId);

        // 4. Kiểm tra xem đơn hàng đã đổi sang COD chưa, và giỏ hàng đã được xóa chưa
        const checkOrder2 = await OrderService.getOrderById(order2.id);
        console.log(`  - Phương thức thanh toán sau đổi: ${checkOrder2.payment_method}`);
        if (checkOrder2.payment_method !== 'COD') throw new Error("Thất bại: Đơn hàng chưa chuyển sang COD");

        const cartAfter = await CartService.getCart(testUserId);
        const hasItemAfter = cartAfter.items.some(i => i.bookId === bookId);
        console.log(`  - Giỏ hàng còn sách không: ${hasItemAfter}`);
        if (hasItemAfter) throw new Error("Thất bại: Giỏ hàng chưa được xóa sách sau khi chuyển sang COD");

        const checkPayment2 = await Payment.findByOrderId(order2.id);
        console.log(`  - Trạng thái giao dịch cũ trong bảng payments: ${checkPayment2.status}`);
        if (checkPayment2.status !== 'FAILED') throw new Error("Thất bại: Giao dịch thanh toán ONLINE cũ chưa chuyển sang FAILED");

        console.log("✅ TEST CASE 2 THÀNH CÔNG!");

        // ----------------------------------------------------
        // TEST CASE 3: Hủy đơn hàng ONLINE đã thanh toán -> Ghi nhận trạng thái REFUND_PENDING
        // ----------------------------------------------------
        console.log("\n🧪 TEST CASE 3: Hủy đơn hàng ONLINE đã thanh toán...");
        
        // 1. Thêm sách vào giỏ
        await CartService.addToCart(testUserId, bookId, 1);

        // 2. Đặt hàng ONLINE
        const order3 = await OrderService.checkout(testUserId, {
            shippingName: "Test Refund Log",
            shippingPhone: "0999999999",
            shippingAddress: "Địa Chỉ Test 3"
        }, 'ONLINE', null);
        console.log(`👉 Đã tạo đơn hàng ONLINE #${order3.id} (status: ${order3.status})`);

        const payRecord = await Payment.create(order3.id, order3.total_amount, 'PAYOS');
        
        // Giả lập thanh toán thành công
        await Payment.updateStatus(payRecord.id, 'PAYOS_TX_12345', 'SUCCESS');
        await pool.query("UPDATE orders SET status = 'CONFIRMED' WHERE id = $1", [order3.id]);
        await pool.query("UPDATE inventory SET available_qty = available_qty - 1, reserved_qty = reserved_qty - 1, sold_qty = sold_qty + 1 WHERE book_id = $1", [bookId]);

        // 3. Khách hàng thực hiện hủy đơn
        console.log(`  - Khách hàng thực hiện hủy đơn đã thanh toán #${order3.id}...`);
        await OrderService.cancelOrder(order3.id, testUserId, "Muốn hủy đơn");

        // 4. Kiểm tra trạng thái đơn và giao dịch payments
        const checkOrder3 = await OrderService.getOrderById(order3.id);
        console.log(`  - Trạng thái đơn hàng sau hủy: ${checkOrder3.status}`);
        if (checkOrder3.status !== 'CANCELLED') throw new Error("Thất bại: Đơn hàng chưa chuyển sang CANCELLED");

        const checkPayment3 = await Payment.findByOrderId(order3.id);
        console.log(`  - Trạng thái giao dịch trong bảng payments sau hủy: ${checkPayment3.status}`);
        if (checkPayment3.status !== 'REFUND_PENDING') throw new Error("Thất bại: Giao dịch thanh toán chưa chuyển sang REFUND_PENDING");

        console.log("✅ TEST CASE 3 THÀNH CÔNG!");

        console.log("\n🎉 TẤT CẢ CÁC BÀI KIỂM THỬ TDD CHO TÍNH NĂNG MỚI ĐÃ THÀNH CÔNG!");

    } catch (err) {
        console.error("\n❌ PHÁT HIỆN LỖI KHI CHẠY TEST:", err.message);
        console.error(err);
    } finally {
        pool.end();
    }
}

runTest();
