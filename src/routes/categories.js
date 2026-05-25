// ==========================================
// FILE 5: src/routes/categories.js
// ==========================================
const express = require('express');
const categoryController = require('../controllers/categoryController');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Public - Mọi người đều xem được danh mục
router.get('/', categoryController.getAllCategories);

// Protected (Admin + Curator có thể Thêm và Sửa)
router.post('/', verifyToken, requireRole(['ADMIN', 'CURATOR']), categoryController.createCategory);
router.put('/:id', verifyToken, requireRole(['ADMIN', 'CURATOR']), categoryController.updateCategory);

// Protected (Chỉ ADMIN mới được Xóa)
router.delete('/:id', verifyToken, requireRole(['ADMIN']), categoryController.deleteCategory);

module.exports = router;