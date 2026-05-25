const express = require('express');
const notificationController = require('../controllers/notificationController');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// GET /api/notifications — Lấy danh sách thông báo cá nhân
router.get('/', verifyToken, notificationController.getMyNotifications);

// PUT /api/notifications/read-all — Đánh dấu tất cả thông báo đã đọc
router.put('/read-all', verifyToken, notificationController.markAllAsRead);

// PUT /api/notifications/:id/read — Đánh dấu thông báo cụ thể đã đọc
router.put('/:id/read', verifyToken, notificationController.markAsRead);

module.exports = router;
