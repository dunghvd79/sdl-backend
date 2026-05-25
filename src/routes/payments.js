const express = require('express');
const paymentController = require('../controllers/paymentController');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// 1. API lấy link thanh toán (Người dùng gọi - CẦN ĐĂNG NHẬP)
router.get('/url/:orderId', verifyToken, paymentController.getPaymentUrl);

// 2. API Nhận phản hồi thanh toán qua Trình duyệt của PayOS (KHÔNG CẦN ĐĂNG NHẬP)
router.get('/payos_return', paymentController.payosReturn);

// 3. API Nhận yêu cầu hủy thanh toán của PayOS (KHÔNG CẦN ĐĂNG NHẬP)
router.get('/payos_cancel', paymentController.payosCancel);

// 4. API Webhook nhận kết quả thanh toán nền của PayOS (PayOS gọi server-to-server - KHÔNG CẦN ĐĂNG NHẬP)
router.post('/payos_webhook', paymentController.payosWebhook);

// 5. CÁC ROUTE VNPAY (GIỮ LẠI LÀM FALLBACK/TƯƠNG THÍCH)
router.get('/vnpay_return', paymentController.vnpayReturn);
router.get('/vnpay_ipn', paymentController.vnpayIpn);
router.post('/webhook', paymentController.webhook);

module.exports = router;