const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// ─── Cấu hình Multer: Lưu file vào thư mục public/uploads/covers ───────────

const UPLOAD_DIR = path.join(__dirname, '../../public/uploads/covers');

// Đảm bảo thư mục tồn tại
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
        // Đặt tên file: cover-<timestamp>-<random>.<ext>
        // VD: cover-1716374800000-abc123.jpg
        const ext = path.extname(file.originalname).toLowerCase();
        const uniqueName = `cover-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
        cb(null, uniqueName);
    }
});

// Kiểm tra loại file (chỉ chấp nhận ảnh)
const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Chỉ chấp nhận file ảnh (JPEG, PNG, WEBP, GIF)'), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024, // Tối đa 5MB
    }
});

// ─── Route: POST /api/upload/cover ──────────────────────────────────────────
// Chỉ Admin và Curator mới được upload
router.post('/cover', verifyToken, requireRole(['ADMIN', 'CURATOR']), upload.single('cover'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Không tìm thấy file ảnh trong request' });
        }

        // Tạo URL công khai trỏ đến file đã lưu
        // Frontend sẽ gọi URL này để hiển thị ảnh bìa
        const fileUrl = `/uploads/covers/${req.file.filename}`;

        res.status(200).json({
            message: 'Upload ảnh bìa thành công!',
            data: {
                url: fileUrl,
                filename: req.file.filename,
                size: req.file.size,
                mimetype: req.file.mimetype
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Middleware xử lý lỗi Multer ────────────────────────────────────────────
router.use((err, req, res, next) => {
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File ảnh quá lớn! Tối đa 5MB.' });
    }
    if (err.message) {
        return res.status(400).json({ error: err.message });
    }
    next(err);
});

module.exports = router;
