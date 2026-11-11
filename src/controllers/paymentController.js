const PaymentService = require('../services/paymentService');
const Order = require('../models/Order');
const AppError = require('../utils/AppError');

const rawFrontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
const FRONTEND_URL = rawFrontendUrl.includes('pigeon-bookstore.netlify.app') 
    ? 'https://pigeon-bookstore.pages.dev' 
    : rawFrontendUrl;

class PaymentController {
    // GET /api/payments/url/:orderId
    static async getPaymentUrl(req, res, next) {
        try {
            const { orderId } = req.params;

            // Kiểm tra đơn hàng có tồn tại không
            const order = await Order.findById(orderId);
            if (!order) return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });

            if (order.status !== 'PENDING') {
                return res.status(400).json({ error: 'Đơn hàng này không ở trạng thái chờ thanh toán' });
            }

            // Kiểm tra quyền sở hữu: Chỉ cho phép người sở hữu đơn hàng hoặc admin/curator thanh toán
            const isEmployee = req.user.role === 'ADMIN' || req.user.role === 'CURATOR';
            if (!isEmployee && order.user_id !== req.user.id) {
                return res.status(403).json({ error: 'Bạn không có quyền thanh toán cho đơn hàng này!' });
            }

            // Lấy link thanh toán PayOS (VietQR) thực tế
            const url = await PaymentService.createPayOSPaymentLink(order.id, order.total_amount);

            res.status(200).json({
                message: 'Đã tạo URL thanh toán PayOS',
                paymentUrl: url
            });
        } catch (err) {
            next(err);
        }
    }

    // GET /api/payments/payos_return
    static async payosReturn(req, res, next) {
        try {
            const { code, id, cancel, status } = req.query;

            if (cancel === 'true' || status === 'CANCELLED') {
                console.log(`Payment cancelled for PayOS link ID: ${id}`);
                return res.redirect(`${FRONTEND_URL}/payment-result?status=fail`);
            }

            // Xác thực giao dịch chính thức từ PayOS
            const result = await PaymentService.verifyAndProcessPayOSPayment(id);

            if (result.success) {
                res.redirect(`${FRONTEND_URL}/payment-result?status=success`);
            } else {
                res.redirect(`${FRONTEND_URL}/payment-result?status=fail`);
            }
        } catch (err) {
            console.error('❌ Lỗi xử lý PayOS Return:', err.message);
            res.redirect(`${FRONTEND_URL}/payment-result?status=fail`);
        }
    }

    // GET /api/payments/payos_cancel
    static async payosCancel(req, res, next) {
        try {
            const { id } = req.query;
            console.log(`PayOS Payment cancelled by user. Link ID: ${id}`);
            res.redirect(`${FRONTEND_URL}/payment-result?status=fail`);
        } catch (err) {
            console.error('❌ Lỗi xử lý PayOS Cancel:', err.message);
            res.redirect(`${FRONTEND_URL}/payment-result?status=fail`);
        }
    }

    // POST /api/payments/payos_webhook
    static async payosWebhook(req, res, next) {
        try {
            const webhookBody = req.body;
            
            // Xử lý sự kiện xác nhận webhook URL từ PayOS
            if (webhookBody.desc === 'confirm' || webhookBody.desc === 'Webhook URL confirmed') {
                return res.status(200).json({ success: true, message: 'Webhook URL confirmed' });
            }

            const result = await PaymentService.processPayOSWebhook(webhookBody);
            
            return res.status(200).json({ success: true, message: result.message });
        } catch (err) {
            // Phản hồi cho máy chủ PayOS: lỗi nghiệp vụ (chữ ký sai, không tìm thấy giao dịch) → 400;
            // lỗi khác chuyển cho errorHandler (500 chung, không lộ chi tiết).
            if (err instanceof AppError) {
                console.error('❌ Lỗi xử lý PayOS Webhook:', err.message);
                return res.status(err.statusCode).json({ error: err.message });
            }
            return next(err);
        }
    }

    // POST /api/payments/webhook
    static async webhook(req, res, next) {
        try {
            const webhookData = req.body;
            const result = await PaymentService.processWebhook(webhookData);
            res.status(200).json(result);
        } catch (err) {
            next(err);
        }
    }

    // GET /mock-gateway
    static async renderMockGateway(req, res, next) {
        const { orderId, amount, paymentId } = req.query;
        res.send(`
            <!DOCTYPE html>
            <html lang="vi">
            <head>
                <meta charset="UTF-8">
                <title>SDL Mock Payment Gateway</title>
                <style>
                    body { font-family: sans-serif; text-align: center; padding-top: 100px; }
                    .card { display: inline-block; border: 1px solid #ccc; padding: 40px; border-radius: 12px; }
                    .btn { padding: 10px 20px; font-weight: bold; cursor: pointer; border: none; border-radius: 6px; }
                    .btn-success { background: #10b981; color: white; margin-bottom: 10px; }
                </style>
            </head>
            <body>
                <div class="card">
                    <h2>MOCK GATEWAY</h2>
                    <p>Đơn hàng #${orderId}</p>
                    <p>Số tiền: ${Number(amount).toLocaleString('vi-VN')} đ</p>
                    <button class="btn btn-success" onclick="processMock()">Xác nhận thanh toán giả lập</button>
                </div>
                <script>
                    function processMock() {
                        window.location.href = '${FRONTEND_URL}/payment-result?status=success';
                    }
                </script>
            </body>
            </html>
        `);
    }
}

module.exports = PaymentController;