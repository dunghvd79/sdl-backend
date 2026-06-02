const express = require('express');
const CouponController = require('../controllers/couponController');
const { verifyToken, optionalVerifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// ─── PUBLIC / CUSTOMER: Xem danh sách mã giảm giá đang hoạt động ────────────
router.get('/active', optionalVerifyToken, CouponController.getActiveCoupons);

// Các API bên dưới bắt buộc phải đăng nhập hoàn toàn
router.use(verifyToken);

// ─── CUSTOMER: Kiểm tra / áp dụng mã giảm giá khi thanh toán ───────────────
router.get('/validate', CouponController.validateCoupon);

// ─── ADMIN / CURATOR: Quản lý mã giảm giá ───────────────────────────────────
router.get('/', requireRole(['ADMIN']), CouponController.getAllCoupons);
router.post('/', requireRole(['ADMIN']), CouponController.createCoupon);
router.put('/:id', requireRole(['ADMIN']), CouponController.updateCoupon);
router.patch('/:id/toggle', requireRole(['ADMIN']), CouponController.toggleCoupon);
router.delete('/:id', requireRole(['ADMIN']), CouponController.deleteCoupon);

module.exports = router;
