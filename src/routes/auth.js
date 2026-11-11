const express = require('express');
const authController = require('../controllers/authController');
const { verifyToken, requireAllowedOrigin } = require('../middleware/auth');

const { validate } = require('../middleware/validate');
const schemas = require('../validators/schemas');

const router = express.Router();

// Các API Public (Không cần đăng nhập)
router.post('/register', validate({ body: schemas.auth.register }), authController.register);
router.post('/login', validate({ body: schemas.auth.login }), authController.login);
router.post('/forgot-password', validate({ body: schemas.auth.forgotPassword }), authController.forgotPassword);
router.post('/reset-password', validate({ body: schemas.auth.resetPassword }), authController.resetPassword);

// Phiên đăng nhập qua cookie sdl_rt (spec 002): chỉ nhận yêu cầu từ giao diện được phép
router.post('/refresh', requireAllowedOrigin, authController.refresh);
router.post('/logout', requireAllowedOrigin, authController.logout);
router.post('/logout-all', requireAllowedOrigin, verifyToken, authController.logoutAll);

// Các API Protected (Phải có Token mới vào được)
router.get('/profile', verifyToken, authController.getProfile);

module.exports = router;
