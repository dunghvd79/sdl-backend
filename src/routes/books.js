// ==========================================
// FILE 4: src/routes/books.js
// ==========================================
const express = require('express');
const bookController = require('../controllers/bookController');
const reviewController = require('../controllers/reviewController');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Public (Ai cũng xem được)
router.get('/', bookController.getAllBooks);
router.get('/:id', bookController.getBook);
router.get('/:id/reviews', reviewController.getReviews);

// Protected (Phải Đăng nhập + Có quyền ADMIN hoặc CURATOR)
router.post('/', verifyToken, requireRole(['ADMIN', 'CURATOR']), bookController.createBook);
router.put('/:id', verifyToken, requireRole(['ADMIN', 'CURATOR']), bookController.updateBook);
router.delete('/:id', verifyToken, requireRole(['ADMIN']), bookController.deleteBook);

// Protected reviews (Đăng nhập mới gửi được)
router.post('/:id/reviews', verifyToken, reviewController.createReview);

module.exports = router;