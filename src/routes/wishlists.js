const express = require('express');
const wishlistController = require('../controllers/wishlistController');
const { verifyToken, requireRole } = require('../middleware/auth');

const { validate } = require('../middleware/validate');
const schemas = require('../validators/schemas');

const router = express.Router();

// POST /api/wishlists/toggle — Thêm/Xóa sách khỏi danh sách yêu thích
router.post('/toggle', verifyToken, validate({ body: schemas.wishlist.toggle }), wishlistController.toggle);

// GET /api/wishlists — Lấy danh sách yêu thích cá nhân
router.get('/', verifyToken, wishlistController.getMyWishlist);

// GET /api/wishlists/admin/stats — Thống kê sách được thả tim nhiều nhất (Admin/Curator)
router.get(
    '/admin/stats',
    verifyToken,
    requireRole(['ADMIN', 'CURATOR']),
    wishlistController.getWishlistStats
);

module.exports = router;
