const express = require('express');
const cartController = require('../controllers/cartController');
const { verifyToken } = require('../middleware/auth'); // Chặn người lạ

const { validate } = require('../middleware/validate');
const schemas = require('../validators/schemas');

const router = express.Router();

// BẮT BUỘC ĐĂNG NHẬP: Gắn middleware verifyToken cho tất cả các API giỏ hàng
router.use(verifyToken);

router.get('/', cartController.getCart);
router.post('/add', validate({ body: schemas.cart.add }), cartController.addToCart);
router.post('/add-batch', validate({ body: schemas.cart.addBatch }), cartController.addBatchToCart);
router.delete('/remove/:bookId', cartController.removeFromCart);
router.post('/remove-bulk', validate({ body: schemas.cart.removeBulk }), cartController.removeBulkFromCart);
router.post('/checkout', validate({ body: schemas.cart.checkout }), cartController.prepareCheckout);

module.exports = router;