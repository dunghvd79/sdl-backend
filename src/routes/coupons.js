const express = require('express');
const CouponController = require('../controllers/couponController');
const { verifyToken, optionalVerifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// ─── PUBLIC / CUSTOMER: Xem danh sách mã giảm giá đang hoạt động ────────────
router.get('/active', optionalVerifyToken, CouponController.getActiveCoupons);

// Debug API
router.get('/debug-all', async (req, res) => {
    try {
        const pool = require('../config/database');
        const dbRes = await pool.query('SELECT id, code, is_active, end_date, start_date, used_count, usage_limit, NOW() as db_now FROM coupons');
        res.json({ data: dbRes.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Các API bên dưới bắt buộc phải đăng nhập hoàn toàn
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
