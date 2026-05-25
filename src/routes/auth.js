const express = require('express');
const authController = require('../controllers/authController');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// Các API Public (Không cần đăng nhập)
router.post('/register', authController.register);
router.post('/login', authController.login);

// Các API Protected (Phải có Token mới vào được)
// Ta gắn middleware verifyToken vào trước controller getProfile
router.get('/profile', verifyToken, authController.getProfile);

module.exports = router;