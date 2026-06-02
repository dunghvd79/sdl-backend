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
        
        // 1. Tự động khắc phục lỗi thiếu PRIMARY KEY trên bảng books
        try {
            await pool.query(`
                ALTER TABLE books ADD PRIMARY KEY (id);
            `);
        } catch (pkErr) {
            console.log("Books primary key info/error:", pkErr.message);
        }

        // 2. Tạo bảng book_images cho bộ sưu tập ảnh chi tiết
        await pool.query(`
            CREATE TABLE IF NOT EXISTS book_images (
                id SERIAL PRIMARY KEY,
                book_id INT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
                image_url TEXT NOT NULL,
                display_order INT NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        res.json({ 
            message: "Successfully added primary key to books and created book_images table!" 
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