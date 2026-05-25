const express = require('express');
const router = express.Router();
const AdminController = require('../controllers/adminController');
const { verifyToken, requireRole } = require('../middleware/auth');

// Yêu cầu đăng nhập và có quyền ADMIN hoặc CURATOR (tuỳ theo tab, ở đây ta gom chung là Admin/Curator)
// Lưu ý: Đổi role chỉ ADMIN mới làm được, nhưng ở đây dùng chung requireRole(['ADMIN', 'CURATOR']) cho route,
// và xử lý phân quyền chi tiết hơn nếu cần. Theo yêu cầu, ta sẽ cho ADMIN làm hết.
router.use(verifyToken);

// Quản lý Thống kê (Cả Admin và Curator)
router.get('/stats', requireRole(['ADMIN', 'CURATOR']), AdminController.getDashboardStats);

// Quản lý Đơn hàng (Cả Admin và Curator)
router.get('/orders', requireRole(['ADMIN', 'CURATOR']), AdminController.getAllOrders);
router.put('/orders/:orderId/status', requireRole(['ADMIN', 'CURATOR']), AdminController.updateOrderStatus);

// Quản lý Người dùng (Chỉ Admin)
router.get('/users', requireRole(['ADMIN']), AdminController.getAllUsers);
router.put('/users/:userId/role', requireRole(['ADMIN']), AdminController.updateUserRole);
router.put('/users/:userId/status', requireRole(['ADMIN']), AdminController.toggleUserStatus);
router.delete('/users/:userId', requireRole(['ADMIN']), AdminController.deleteUser);
router.get('/users/:userId/activity', requireRole(['ADMIN']), AdminController.getUserActivity);
router.get('/chats/:sessionId/messages', requireRole(['ADMIN']), AdminController.getChatMessages);

module.exports = router;
