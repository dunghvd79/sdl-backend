// ==========================================
// FILE 3: src/routes/orders.js
// ==========================================
const express = require('express');
const orderController = require('../controllers/orderController');
const { verifyToken } = require('../middleware/auth');
const { decodeOrderId } = require('../utils/hashids');

const { validate } = require('../middleware/validate');
const schemas = require('../validators/schemas');

const rl = require('../middleware/rateLimits');

const router = express.Router();

// Tự động giải mã Hashid nếu có trong param :id
router.param('id', (req, res, next, id) => {
    const decoded = decodeOrderId(id);
    if (isNaN(decoded)) {
        return res.status(400).json({ error: 'Mã đơn hàng không hợp lệ!' });
    }
    req.params.id = decoded;
    next();
});

// Tất cả API liên quan đến đơn hàng đều BẮT BUỘC ĐĂNG NHẬP
router.use(verifyToken);

const OrderService = require('../services/orderService');

// Middleware quét lười biếng đơn hàng hết hạn
const lazyCancelExpired = async (req, res, next) => {
    try {
        await OrderService.checkAndCancelExpiredOrders();
    } catch (err) {
        console.error('❌ Lỗi Lazy Check đơn hàng hết hạn:', err.message);
    }
    next();
};

// Mọi route dưới đây đã qua verifyToken (dòng 27): phải đăng nhập. `:id` là mã đơn dạng hashId,
// đã được giải mã thành số ở router.param (dòng 17).

// POST /api/orders/checkout — Đặt hàng từ giỏ hàng (COD hoặc ONLINE).
// Tạo đơn + giữ hàng trong kho trong 1 transaction; ONLINE thì sau đó gọi /api/payments/url/:orderId để lấy link PayOS.
// Body: shippingName, shippingPhone, shippingAddress, shippingNotes?, paymentMethod, couponCode?, selectedBookIds?
// Giới hạn 10 lần / phút / tài khoản (orderLimiter).
router.post('/checkout', rl.orderLimiter, validate({ body: schemas.order.checkout }), lazyCancelExpired, orderController.checkout);

// GET /api/orders — Danh sách đơn hàng CỦA CHÍNH người đang đăng nhập (lịch sử mua hàng).
router.get('/', lazyCancelExpired, orderController.getMyOrders);

// GET /api/orders/:id — Chi tiết một đơn. Chủ đơn xem được; ADMIN/CURATOR xem được mọi đơn (kiểm tra trong controller).
router.get('/:id', lazyCancelExpired, orderController.getOrderDetails);

// PUT /api/orders/:id/cancel — Khách tự huỷ đơn CỦA MÌNH khi đơn còn PENDING / CONFIRMED / PACKAGING.
// Trả hàng về kho; đơn ONLINE đã thanh toán thì payment chuyển REFUND_PENDING. Body: cancelReason?
router.put('/:id/cancel', validate({ body: schemas.order.cancel }), orderController.cancelOrder);

// PUT /api/orders/:id/change-to-cod — Đổi đơn ONLINE đang chờ thanh toán (PENDING) của mình sang trả tiền khi nhận hàng (COD).
router.put('/:id/change-to-cod', orderController.changeToCod);

module.exports = router;