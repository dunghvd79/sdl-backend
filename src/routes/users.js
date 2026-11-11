const express = require('express');
const { validate } = require('../middleware/validate');
const schemas = require('../validators/schemas');

const router = express.Router();
const UserController = require('../controllers/userController');
const { verifyToken } = require('../middleware/auth');

// Tất cả các route users đều yêu cầu đăng nhập (verifyToken)
router.use(verifyToken);

// Lấy thông tin cá nhân
router.get('/profile', UserController.getProfile);

// Cập nhật thông tin cá nhân (họ tên)
router.put('/profile', validate({ body: schemas.user.updateProfile }), UserController.updateProfile);

// Đổi mật khẩu
router.put('/change-password', validate({ body: schemas.user.changePassword }), UserController.changePassword);

module.exports = router;
