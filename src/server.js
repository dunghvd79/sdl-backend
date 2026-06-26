const app = require('./config/app');
require('./config/database'); // Gọi file này để chạy test kết nối DB
const OrderService = require('./services/orderService');
const { startEmailWorker } = require('./queues/emailWorker');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`🚀 Server đang chạy tại cổng ${PORT}`);
    console.log(`🌍 Môi trường: ${process.env.NODE_ENV}`);

    // Khởi chạy BullMQ Email Worker để xử lý gửi email ngầm
    try {
        startEmailWorker();
    } catch (err) {
        console.error('❌ Lỗi khởi động BullMQ Email Worker:', err.message);
    }

    // Thiết lập quét ngầm định kỳ mỗi 5 phút để hủy đơn hàng ONLINE hết hạn
    setInterval(() => {
        OrderService.checkAndCancelExpiredOrders()
            .then(count => {
                if (count > 0) {
                    console.log(`🧹 Background Clean: Đã tự động hủy ${count} đơn hàng ONLINE hết hạn thanh toán.`);
                }
            })
            .catch(err => {
                console.error('❌ Lỗi quét hủy đơn hàng hết hạn ngầm:', err.message);
            });
    }, 5 * 60 * 1000);
});