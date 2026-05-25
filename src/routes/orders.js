// ==========================================
// FILE 3: src/routes/orders.js
// ==========================================
const express = require('express');
const orderController = require('../controllers/orderController');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// Tất cả API liên quan đến đơn hàng đều BẮT BUỘC ĐĂNG NHẬP
router.use(verifyToken);

router.post('/checkout', orderController.checkout);
router.get('/', orderController.getMyOrders);
router.get('/:id', orderController.getOrderDetails);
router.put('/:id/cancel', orderController.cancelOrder);

module.exports = router;