const express = require('express');
const router = express.Router();
const UserController = require('../controllers/userController');
const { verifyToken } = require('../middleware/auth');

// Tất cả các route users đều yêu cầu đăng nhập (verifyToken)
router.use(verifyToken);

// Lấy thông tin cá nhân
router.get('/profile', UserController.getProfile);

// Cập nhật thông tin cá nhân (họ tên)
router.put('/profile', UserController.updateProfile);

// Đổi mật khẩu
router.put('/change-password', UserController.changePassword);

module.exports = router;
