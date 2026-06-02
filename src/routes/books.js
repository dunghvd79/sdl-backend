// ==========================================
// FILE 4: src/routes/books.js
// ==========================================
const express = require('express');
const bookController = require('../controllers/bookController');
const reviewController = require('../controllers/reviewController');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Route tạm thời tạo bảng book_images để gỡ rối nhanh
router.get('/init-db-temp', async (req, res) => {
    try {
        const pool = require('../config/database');
        
        // Truy vấn danh sách ràng buộc của bảng books
        const constraintsRes = await pool.query(`
            SELECT constraint_name, constraint_type 
            FROM information_schema.table_constraints 
            WHERE table_name = 'books'
        `);

        // Truy vấn cấu trúc cột của bảng books
        const columnsRes = await pool.query(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns 
            WHERE table_name = 'books'
        `);

        res.json({ 
            constraints: constraintsRes.rows,
            columns: columnsRes.rows
        });
    } catch (err) {
        res.status(500).json({ error: err.message, stack: err.stack });
    }
});

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