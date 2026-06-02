const express = require('express');
const articleController = require('../controllers/articleController');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Public (Ai cũng xem được)
router.get('/', articleController.getAllArticles);
router.get('/categories', articleController.getUniqueCategories);
router.get('/:id', articleController.getArticle);

// Protected (Phải Đăng nhập + Có quyền ADMIN hoặc CURATOR)
router.post('/', verifyToken, requireRole(['ADMIN', 'CURATOR']), articleController.createArticle);
router.put('/:id', verifyToken, requireRole(['ADMIN', 'CURATOR']), articleController.updateArticle);
router.delete('/:id', verifyToken, requireRole(['ADMIN']), articleController.deleteArticle);

module.exports = router;
