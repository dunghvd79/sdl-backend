const express = require('express');
const router = express.Router();
const AdminController = require('../controllers/adminController');
const { verifyToken, requireRole } = require('../middleware/auth');
const { decodeOrderId } = require('../utils/hashids');

// Tự động giải mã Hashid nếu có trong param :orderId
router.param('orderId', (req, res, next, orderId) => {
    const decoded = decodeOrderId(orderId);
    if (isNaN(decoded)) {
        return res.status(400).json({ error: 'Mã đơn hàng không hợp lệ!' });
    }
    req.params.orderId = decoded;
    next();
});

// Yêu cầu đăng nhập và có quyền ADMIN hoặc CURATOR (tuỳ theo tab, ở đây ta gom chung là Admin/Curator)
// Lưu ý: Đổi role chỉ ADMIN mới làm được, nhưng ở đây dùng chung requireRole(['ADMIN', 'CURATOR']) cho route,
// và xử lý phân quyền chi tiết hơn nếu cần. Theo yêu cầu, ta sẽ cho ADMIN làm hết.
router.use(verifyToken);

// Quản lý Thống kê (Chỉ Admin)
router.get('/stats', requireRole(['ADMIN']), AdminController.getDashboardStats);

// Quản lý Đơn hàng (Cả Admin và Curator xem, nhưng chỉ Admin mới có quyền cập nhật trạng thái)
router.get('/orders', requireRole(['ADMIN', 'CURATOR']), AdminController.getAllOrders);
router.put('/orders/:orderId/status', requireRole(['ADMIN']), AdminController.updateOrderStatus);

// Quản lý Người dùng (Chỉ Admin)
router.get('/users', requireRole(['ADMIN']), AdminController.getAllUsers);
router.put('/users/:userId/role', requireRole(['ADMIN']), AdminController.updateUserRole);
router.put('/users/:userId/status', requireRole(['ADMIN']), AdminController.toggleUserStatus);
router.delete('/users/:userId', requireRole(['ADMIN']), AdminController.deleteUser);
router.get('/users/:userId/activity', requireRole(['ADMIN']), AdminController.getUserActivity);
router.get('/chats/:sessionId/messages', requireRole(['ADMIN']), AdminController.getChatMessages);

module.exports = router;
