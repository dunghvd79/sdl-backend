const express = require('express');
const CouponController = require('../controllers/couponController');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Tất cả API liên quan đến coupon đều bắt buộc đăng nhập
router.use(verifyToken);

// ─── CUSTOMER: Kiểm tra / áp dụng mã giảm giá khi thanh toán ───────────────
router.get('/validate', CouponController.validateCoupon);

// ─── ADMIN / CURATOR: Quản lý mã giảm giá ───────────────────────────────────
router.get('/', requireRole(['ADMIN', 'CURATOR']), CouponController.getAllCoupons);
router.post('/', requireRole(['ADMIN', 'CURATOR']), CouponController.createCoupon);
router.put('/:id', requireRole(['ADMIN', 'CURATOR']), CouponController.updateCoupon);
router.patch('/:id/toggle', requireRole(['ADMIN', 'CURATOR']), CouponController.toggleCoupon);
router.delete('/:id', requireRole(['ADMIN']), CouponController.deleteCoupon);

module.exports = router;
