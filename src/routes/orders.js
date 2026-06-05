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

router.post('/checkout', orderController.checkout);
router.get('/', orderController.getMyOrders);
router.get('/:id', orderController.getOrderDetails);
router.put('/:id/cancel', orderController.cancelOrder);

module.exports = router;