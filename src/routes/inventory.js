const express = require('express');
const inventoryController = require('../controllers/inventoryController');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Tất cả route kho hàng đều yêu cầu đăng nhập VÀ phải có quyền ADMIN hoặc CURATOR
router.use(verifyToken, requireRole(['ADMIN', 'CURATOR']));

// GET /api/inventory — Lấy toàn bộ danh sách sách + thông tin kho
router.get('/', inventoryController.getAll);

// GET /api/inventory/transactions — Lấy lịch sử biến động kho
router.get('/transactions', inventoryController.getTransactionHistory);

// PUT /api/inventory/:bookId — Cập nhật số lượng tồn kho của 1 cuốn sách
router.put('/:bookId', inventoryController.updateAvailableQty);

module.exports = router;
