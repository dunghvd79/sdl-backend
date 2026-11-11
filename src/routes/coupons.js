const express = require('express');
const CouponController = require('../controllers/couponController');
const { verifyToken, optionalVerifyToken, requireRole } = require('../middleware/auth');

const { validate } = require('../middleware/validate');
const schemas = require('../validators/schemas');

const router = express.Router();

// ─── PUBLIC / CUSTOMER: Xem danh sách mã giảm giá đang hoạt động ────────────
router.get('/active', optionalVerifyToken, CouponController.getActiveCoupons);

// Các API bên dưới bắt buộc phải đăng nhập hoàn toàn
router.use(verifyToken);

// ─── CUSTOMER: Kiểm tra / áp dụng mã giảm giá khi thanh toán ───────────────
router.get('/validate', validate({ query: schemas.coupon.validateQuery }), CouponController.validateCoupon);

// ─── ADMIN / CURATOR: Quản lý mã giảm giá ───────────────────────────────────
router.get('/', requireRole(['ADMIN']), CouponController.getAllCoupons);
router.post('/', requireRole(['ADMIN']), validate({ body: schemas.coupon.write }), CouponController.createCoupon);
router.put('/:id', requireRole(['ADMIN']), validate({ body: schemas.coupon.write }), CouponController.updateCoupon);
router.patch('/:id/toggle', requireRole(['ADMIN']), validate({ body: schemas.coupon.toggle }), CouponController.toggleCoupon);
router.delete('/:id', requireRole(['ADMIN']), CouponController.deleteCoupon);

module.exports = router;
