const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

const path = require('path');

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files (ảnh bìa đã upload)
app.use('/uploads', express.static(path.join(__dirname, '../../public/uploads')));

// ĐĂNG KÝ ROUTES CỦA DỰ ÁN Ở ĐÂY
app.use('/api/auth', require('../routes/auth'));
app.use('/api/users', require('../routes/users'));
app.use('/api/admin', require('../routes/admin'));
app.use('/api/books', require('../routes/books'));         // route của book
app.use('/api/categories', require('../routes/categories')); // route của category
app.use('/api/cart', require('../routes/cart'));         // route của giỏ hàng
app.use('/api/orders', require('../routes/orders'));     // route của đơn hàng
app.use('/api/payments', require('../routes/payments')); // route của thanh toán
app.use('/api/ai', require('../routes/ai'));             // ✅ route của AI
app.use('/api/inventory', require('../routes/inventory')); // ✅ route quản lý kho (Admin/Curator)
app.use('/api/coupons', require('../routes/coupons'));     // ✅ route mã giảm giá
app.use('/api/upload', require('../routes/upload'));       // ✅ route upload ảnh bìa
app.use('/api/wishlists', require('../routes/wishlists'));   // ✅ route danh sách yêu thích
app.use('/api/notifications', require('../routes/notifications')); // ✅ route trung tâm thông báo
app.use('/api/articles', require('../routes/articles'));         // ✅ route của bài viết (CMS)


// Route thanh toán giả lập (Mock Payment Gateway HTML)
const paymentController = require('../controllers/paymentController');
app.get('/mock-gateway', paymentController.renderMockGateway);

// API kiểm tra server sống hay chết
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok', message: 'Hệ thống Backend SDL đang chạy mượt mà!' });
});

// Middleware bắt lỗi chung
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        error: process.env.NODE_ENV === 'development' ? err.message : 'Internal Server Error'
    });
});

module.exports = app;