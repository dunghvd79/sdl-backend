const express = require('express');
const inventoryController = require('../controllers/inventoryController');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Yêu cầu đăng nhập cho tất cả các route tồn kho
router.use(verifyToken);

// GET /api/inventory — Lấy toàn bộ danh sách sách + thông tin kho (Cả Admin và Curator)
router.get('/', requireRole(['ADMIN', 'CURATOR']), inventoryController.getAll);

// GET /api/inventory/transactions — Lấy lịch sử biến động kho (Cả Admin và Curator)
router.get('/transactions', requireRole(['ADMIN', 'CURATOR']), inventoryController.getTransactionHistory);

// PUT /api/inventory/:bookId — Cập nhật số lượng tồn kho của 1 cuốn sách (Chỉ Admin mới có quyền)
router.put('/:bookId', requireRole(['ADMIN']), inventoryController.updateAvailableQty);

module.exports = router;
