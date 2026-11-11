const express = require('express');
const authController = require('../controllers/authController');
const { verifyToken, requireAllowedOrigin } = require('../middleware/auth');

const router = express.Router();

// Các API Public (Không cần đăng nhập)
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);

// Phiên đăng nhập qua cookie sdl_rt (spec 002): chỉ nhận yêu cầu từ giao diện được phép
router.post('/refresh', requireAllowedOrigin, authController.refresh);
router.post('/logout', requireAllowedOrigin, authController.logout);
router.post('/logout-all', requireAllowedOrigin, verifyToken, authController.logoutAll);

// Các API Protected (Phải có Token mới vào được)
router.get('/profile', verifyToken, authController.getProfile);

module.exports = router;
