const pool = require('../config/database');
const CartService = require('../services/cartService');
const OrderService = require('../services/orderService');
const Inventory = require('../models/Inventory');
const AdminController = require('../controllers/adminController');

// Hàm giả lập Mock Response của Express để bắt kết quả từ Controller
function mockResponse() {
    const res = {};
    res.status = (code) => {
        res.statusCode = code;
        return res;
    };
    res.json = (data) => {
        res.body = data;
        return res;
    };
    return res;
}

async function runTest() {
    console.log("=== BẮT ĐẦU KIỂM THỬ TỰ ĐỘNG LUỒNG KHÁCH HÀNG TỰ HỦY ĐƠN & TỒN KHO ===");
    
    const bookId = 2; // "Mắt Biếc"
    const testUserId = 2; // CUSTOMER
    const adminUserId = 1; // ADMIN

    try {
        // Lấy trạng thái kho ban đầu trước khi chạy test
        let initStock = await Inventory.getStatus(bookId);
        const startAvailable = initStock.available_qty;
        const startReserved = initStock.reserved_qty;
        const startSold = initStock.sold_qty;

        console.log("📊 Trạng thái kho ban đầu:", {
            available: startAvailable,
            reserved: startReserved,
            sold: startSold
        });

        // ----------------------------------------------------
        // TEST CASE 1: Khách hàng tự hủy đơn hàng ở trạng thái PENDING (chỉ giải phóng reserved)
        // ----------------------------------------------------
        console.log("\n🧪 TEST CASE 1: Khách hàng tự hủy đơn hàng PENDING...");
        
        // Dọn sạch giỏ và thêm hàng
        await pool.query('DELETE FROM cart_items WHERE cart_id = (SELECT id FROM carts WHERE user_id = $1)', [testUserId]);
        await CartService.addToCart(testUserId, bookId, 2);
        
        // Checkout tạo đơn hàng PENDING
        const order1 = await OrderService.checkout(testUserId, {
            shippingName: "Khách Hàng Hủy PENDING",
            shippingPhone: "0999999999",
            shippingAddress: "Địa Chỉ Test 1"
        }, 'COD', null);
        console.log(`👉 Đã tạo đơn hàng #${order1.id} (status: ${order1.status})`);

        // Check kho: reserved_qty tăng 2
        let stock1 = await Inventory.getStatus(bookId);
        console.log("  - Kho sau khi đặt hàng:", { available: stock1.available_qty, reserved: stock1.reserved_qty, sold: stock1.sold_qty });
        if (stock1.reserved_qty !== startReserved + 2) throw new Error("Lỗi: reserved_qty không tăng thêm 2!");

        // Khách hàng tự hủy đơn hàng
        console.log(`  - Khách hàng thực hiện hủy đơn hàng #${order1.id}...`);
        await OrderService.cancelOrder(order1.id, testUserId);
        
        // Check kho: reserved_qty giảm về ban đầu, available và sold không đổi
        let stock1AfterCancel = await Inventory.getStatus(bookId);
        console.log("  - Kho sau khi hủy:", { available: stock1AfterCancel.available_qty, reserved: stock1AfterCancel.reserved_qty, sold: stock1AfterCancel.sold_qty });
        if (stock1AfterCancel.reserved_qty !== startReserved) throw new Error("Lỗi: reserved_qty không quay về ban đầu!");
        if (stock1AfterCancel.available_qty !== startAvailable) throw new Error("Lỗi: available_qty bị thay đổi trái quy định!");
        console.log("✅ TEST CASE 1 THÀNH CÔNG: Đã giải phóng giữ kho thành công khi hủy đơn PENDING.");

        // ----------------------------------------------------
        // TEST CASE 2: Khách hàng tự hủy đơn hàng ở trạng thái CONFIRMED (hoàn trả available & sold)
        // ----------------------------------------------------
        console.log("\n🧪 TEST CASE 2: Khách hàng tự hủy đơn hàng CONFIRMED...");
        
        // Thêm hàng và checkout
        await CartService.addToCart(testUserId, bookId, 2);
        const order2 = await OrderService.checkout(testUserId, {
            shippingName: "Khách Hàng Hủy CONFIRMED",
            shippingPhone: "0999999999",
            shippingAddress: "Địa Chỉ Test 2"
        }, 'COD', null);
        console.log(`👉 Đã tạo đơn hàng #${order2.id} (status: ${order2.status})`);

        // Admin duyệt đơn hàng sang CONFIRMED
        console.log(`  - Admin xác nhận đơn hàng #${order2.id}...`);
        const reqMock = { params: { orderId: order2.id }, body: { status: 'CONFIRMED' }, user: { id: adminUserId, role: 'ADMIN' } };
        const resMock = mockResponse();
        await AdminController.updateOrderStatus(reqMock, resMock);
        if (resMock.statusCode !== 200) throw new Error("Lỗi xác nhận đơn hàng!");

        // Check kho: available giảm 2, sold tăng 2, reserved về ban đầu
        let stock2 = await Inventory.getStatus(bookId);
        console.log("  - Kho sau khi xác nhận:", { available: stock2.available_qty, reserved: stock2.reserved_qty, sold: stock2.sold_qty });
        if (stock2.available_qty !== startAvailable - 2) throw new Error("Lỗi: available_qty không giảm đi 2!");
        if (stock2.sold_qty !== startSold + 2) throw new Error("Lỗi: sold_qty không tăng thêm 2!");

        // Khách hàng tự hủy đơn hàng (trạng thái CONFIRMED)
        console.log(`  - Khách hàng thực hiện hủy đơn hàng CONFIRMED #${order2.id}...`);
        await OrderService.cancelOrder(order2.id, testUserId);

        // Check kho: available và sold được phục hồi
        let stock2AfterCancel = await Inventory.getStatus(bookId);
        console.log("  - Kho sau khi khách hủy:", { available: stock2AfterCancel.available_qty, reserved: stock2AfterCancel.reserved_qty, sold: stock2AfterCancel.sold_qty });
        if (stock2AfterCancel.available_qty !== startAvailable) throw new Error("Lỗi: available_qty không phục hồi về ban đầu!");
        if (stock2AfterCancel.sold_qty !== startSold) throw new Error("Lỗi: sold_qty không phục hồi về ban đầu!");
        console.log("✅ TEST CASE 2 THÀNH CÔNG: Đã hoàn trả kho vật lý thành công khi hủy đơn CONFIRMED.");

        // ----------------------------------------------------
        // TEST CASE 3: Khách hàng KHÔNG thể hủy đơn hàng ở trạng thái DELIVERING (Đang giao)
        // ----------------------------------------------------
        console.log("\n🧪 TEST CASE 3: Chặn khách hàng hủy đơn hàng đang giao (DELIVERING)...");
        
        // Thêm hàng và checkout
        await CartService.addToCart(testUserId, bookId, 2);
        const order3 = await OrderService.checkout(testUserId, {
            shippingName: "Khách Hàng Hủy DELIVERING",
            shippingPhone: "0999999999",
            shippingAddress: "Địa Chỉ Test 3"
        }, 'COD', null);
        console.log(`👉 Đã tạo đơn hàng #${order3.id} (status: ${order3.status})`);

        // Admin duyệt đơn sang CONFIRMED -> DELIVERING
        console.log(`  - Admin duyệt sang CONFIRMED và tiếp tục sang DELIVERING...`);
        const reqC = { params: { orderId: order3.id }, body: { status: 'CONFIRMED' }, user: { id: adminUserId, role: 'ADMIN' } };
        await AdminController.updateOrderStatus(reqC, mockResponse());
        const reqD = { params: { orderId: order3.id }, body: { status: 'DELIVERING' }, user: { id: adminUserId, role: 'ADMIN' } };
        await AdminController.updateOrderStatus(reqD, mockResponse());

        // Khách hàng cố tình gọi hủy đơn hàng
        console.log(`  - Khách hàng cố gắng tự hủy đơn hàng #${order3.id} (Đang giao)...`);
        try {
            await OrderService.cancelOrder(order3.id, testUserId);
            throw new Error("LỖI: Cho phép khách hàng hủy đơn hàng đang giao!");
        } catch (error) {
            console.log(`  - Thất bại theo đúng kỳ vọng: "${error.message}"`);
            console.log("✅ TEST CASE 3 THÀNH CÔNG: Đã chặn khách hàng hủy đơn đang giao thành công.");
        }

        console.log("\n🎉 TẤT CẢ CÁC BÀI KIỂM THỬ LUỒNG HỦY ĐƠN & KHO ĐÃ VƯỢT QUA XUẤT SẮC!");

    } catch (err) {
        console.error("\n❌ PHÁT HIỆN LỖI KHI CHẠY TEST:", err.message);
        console.error(err);
    } finally {
        pool.end();
    }
}

runTest();
