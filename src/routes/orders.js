// ==========================================
// FILE 3: src/routes/orders.js
// ==========================================
const express = require('express');
const orderController = require('../controllers/orderController');
const { verifyToken } = require('../middleware/auth');
const { decodeOrderId } = require('../utils/hashids');

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

router.post('/checkout', lazyCancelExpired, orderController.checkout);
router.get('/', lazyCancelExpired, orderController.getMyOrders);
router.get('/:id', lazyCancelExpired, orderController.getOrderDetails);
router.put('/:id/cancel', orderController.cancelOrder);
router.put('/:id/change-to-cod', orderController.changeToCod);

module.exports = router;