const express = require('express');
const articleController = require('../controllers/articleController');
const { verifyToken, optionalVerifyToken, requireRole } = require('../middleware/auth');
const { decodeArticleId } = require('../utils/hashids');

const { validate } = require('../middleware/validate');
const schemas = require('../validators/schemas');

const rl = require('../middleware/rateLimits');

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
// optionalVerifyToken: chỉ nhân viên mới xem được bài nháp / đã ẩn (adminMode, status) — B52
router.get('/', optionalVerifyToken, validate({ query: schemas.article.list }), articleController.getAllArticles);
router.get('/categories', optionalVerifyToken, articleController.getUniqueCategories);
router.get('/:id', optionalVerifyToken, articleController.getArticle);

// Protected (Phải Đăng nhập + Có quyền ADMIN hoặc CURATOR)
router.post('/', verifyToken, requireRole(['ADMIN', 'CURATOR']), rl.writeLimiter, validate({ body: schemas.article.write }), articleController.createArticle);
router.put('/:id', verifyToken, requireRole(['ADMIN', 'CURATOR']), rl.writeLimiter, validate({ body: schemas.article.write }), articleController.updateArticle);
router.delete('/:id', verifyToken, requireRole(['ADMIN']), rl.writeLimiter, articleController.deleteArticle);

module.exports = router;
