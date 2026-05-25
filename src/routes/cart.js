const express = require('express');
const cartController = require('../controllers/cartController');
const { verifyToken } = require('../middleware/auth'); // Chặn người lạ

const router = express.Router();

// BẮT BUỘC ĐĂNG NHẬP: Gắn middleware verifyToken cho tất cả các API giỏ hàng
router.use(verifyToken);

router.get('/', cartController.getCart);
router.post('/add', cartController.addToCart);
router.post('/add-batch', cartController.addBatchToCart);
router.delete('/remove/:bookId', cartController.removeFromCart);
router.post('/checkout', cartController.prepareCheckout);

module.exports = router;