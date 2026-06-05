const express = require('express');
const articleController = require('../controllers/articleController');
const { verifyToken, requireRole } = require('../middleware/auth');
const { decodeArticleId } = require('../utils/hashids');

const router = express.Router();

// Tự động giải mã Hashid nếu có trong param :id
router.param('id', (req, res, next, id) => {
    const decoded = decodeArticleId(id);
    if (isNaN(decoded)) {
        return res.status(400).json({ error: 'Mã bài viết không hợp lệ!' });
    }
    req.params.id = decoded;
    next();
});

// Public (Ai cũng xem được)
router.get('/', articleController.getAllArticles);
router.get('/categories', articleController.getUniqueCategories);
router.get('/:id', articleController.getArticle);

// Protected (Phải Đăng nhập + Có quyền ADMIN hoặc CURATOR)
router.post('/', verifyToken, requireRole(['ADMIN', 'CURATOR']), articleController.createArticle);
router.put('/:id', verifyToken, requireRole(['ADMIN', 'CURATOR']), articleController.updateArticle);
router.delete('/:id', verifyToken, requireRole(['ADMIN']), articleController.deleteArticle);

module.exports = router;
