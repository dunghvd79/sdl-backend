// ==========================================
// FILE 3: src/routes/ai.js
// Nhiệm vụ: Mở đường dẫn cho Frontend gọi vào
// ==========================================
const express = require('express');
const multer = require('multer');
const aiController = require('../controllers/aiController');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Cấu hình multer: lưu file vào bộ nhớ RAM (buffer) thay vì đĩa
// Giới hạn tối đa 50MB cho file PDF
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Chỉ chấp nhận file PDF!'), false);
        }
    }
});

// POST /api/ai/ask — Hỏi đáp AI (tất cả user đã đăng nhập)
router.post('/ask', verifyToken, aiController.ask);

// GET /api/ai/chats/:bookId/history — Lấy lịch sử chat của customer đối với 1 cuốn sách
router.get('/chats/:bookId/history', verifyToken, aiController.getChatHistory);

// POST /api/ai/upload/:bookId — Upload PDF để vector hóa (chỉ ADMIN/CURATOR)
router.post(
    '/upload/:bookId',
    verifyToken,
    requireRole(['ADMIN', 'CURATOR']),
    upload.single('file'),    // 'file' là tên field trong form-data
    aiController.uploadBookPDF
);

module.exports = router;