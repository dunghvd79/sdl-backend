const pool = require('../config/database');
const Payment = require('../models/Payment');
const Cart = require('../models/Cart');
const Inventory = require('../models/Inventory');
// Ghi nhận một đơn đã được cổng thanh toán báo PAID. Idempotent: return URL và webhook có thể
// cùng gọi, gọi lặp lại hoặc đồng thời, nhưng kho chỉ bị trừ đúng một lần.
// Chỉ chuyển PENDING -> CONFIRMED; câu UPDATE có điều kiện khoá dòng đơn hàng nên yêu cầu
// đến sau sẽ thấy đơn đã CONFIRMED và không làm gì thêm.
async function confirmPaidOrder(orderId, paymentId, transactionId, stockOutReason) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { rows: [order] } = await client.query(
            `UPDATE orders SET status = 'CONFIRMED', updated_at = CURRENT_TIMESTAMP
             WHERE id = $1 AND status = 'PENDING'
             RETURNING id, user_id`,
            [orderId]
        );

        if (!order) {
            const { rows: [current] } = await client.query('SELECT status FROM orders WHERE id = $1', [orderId]);
            if (current && current.status === 'CANCELLED') {
                // Tiền đã về nhưng đơn đã huỷ (vd quá hạn 15 phút): không làm sống lại đơn,
                // ghi nhận để quản trị viên hoàn tiền.
                await client.query(
                    "UPDATE payments SET transaction_id = $2, status = 'REFUND_PENDING' WHERE id = $1",
                    [paymentId, transactionId]
                );
                await client.query('COMMIT');
                return { success: false, message: 'Đơn hàng đã bị hủy trước khi thanh toán hoàn tất. Giao dịch sẽ được hoàn tiền.' };
            }
            // Đơn đã được xác nhận trước đó: không xử lý lại.
            await client.query('COMMIT');
            return { success: true, orderId, alreadyProcessed: true };
        }

        await client.query(
            "UPDATE payments SET transaction_id = $2, status = 'SUCCESS' WHERE id = $1",
            [paymentId, transactionId]
        );

        const { rows: items } = await client.query(
            'SELECT book_id, quantity FROM order_items WHERE order_id = $1',
            [orderId]
        );
        for (const item of items) {
            await Inventory.commit(client, item.book_id, item.quantity, stockOutReason, order.user_id);
        }

        const cart = await Cart.getByUserId(order.user_id);
        if (cart && items.length > 0) {
            await Cart.removeItems(cart.id, items.map(item => item.book_id), client);
        }

        await client.query('COMMIT');
        return { success: true, orderId };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

// Hàm khởi tạo PayOS trễ (lazy initialization) để tránh lỗi crash khi .env chưa được cấu hình
let payosInstance = null;
function getPayOS() {
    if (!payosInstance) {
        const clientId = (process.env.PAYOS_CLIENT_ID || '').trim();
        const apiKey = (process.env.PAYOS_API_KEY || '').trim();
        const checksumKey = (process.env.PAYOS_CHECKSUM_KEY || '').trim();

        if (!clientId || !apiKey || !checksumKey) {
            throw new Error('Chưa cấu hình thông tin kết nối PayOS trong file .env (Thiếu PAYOS_CLIENT_ID, PAYOS_API_KEY hoặc PAYOS_CHECKSUM_KEY)');
        }

        const PayOSLib = require('@payos/node');
        const PayOSClass = PayOSLib.PayOS || PayOSLib;
        payosInstance = new PayOSClass({
            clientId,
            apiKey,
            checksumKey
        });
    }
    return payosInstance;
}

class PaymentService {
    // ----------------------------------------------------
    // CÁC HÀM XỬ LÝ PAYOS
    // ----------------------------------------------------

    // 1. Tạo Link thanh toán PayOS (VietQR) thực tế
    static async createPayOSPaymentLink(orderId, amount) {
        // Lưu lịch sử giao dịch ban đầu với trạng thái PENDING
        const payment = await Payment.create(orderId, amount, 'PAYOS');

        const payos = getPayOS();

        const orderCode = Number(orderId);
        if (isNaN(orderCode)) {
            throw new Error('Mã đơn hàng không hợp lệ (Phải là số nguyên để gửi tới PayOS)');
        }

        // URL phản hồi
        const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';
        const returnUrl = `${backendUrl}/api/payments/payos_return`;
        const cancelUrl = `${backendUrl}/api/payments/payos_cancel`;

        const paymentData = {
            orderCode: orderCode,
            amount: Math.round(amount),
            description: `Thanh toan don hang #${orderId}`,
            cancelUrl: cancelUrl,
            returnUrl: returnUrl
        };

        const paymentLink = await payos.paymentRequests.create(paymentData);
        return paymentLink.checkoutUrl;
    }

    // 2. Xác thực và xử lý thanh toán từ PayOS (gọi khi redirect)
    static async verifyAndProcessPayOSPayment(paymentLinkId) {
        const payos = getPayOS();
        
        // Gọi API của PayOS để lấy thông tin giao dịch chính thức
        const paymentLinkInfo = await payos.paymentRequests.get(paymentLinkId);
        if (!paymentLinkInfo) {
            throw new Error('Không lấy được thông tin chi tiết của link thanh toán từ PayOS');
        }

        const orderId = paymentLinkInfo.orderCode;
        
        // Tìm giao dịch tương ứng trong CSDL
        const payment = await Payment.findByOrderId(orderId);
        if (!payment) {
            throw new Error('Không tìm thấy giao dịch thanh toán cho đơn hàng #' + orderId);
        }

        // Nếu trạng thái là PAID (Đã thanh toán thành công)
        if (paymentLinkInfo.status === 'PAID') {
            return confirmPaidOrder(orderId, payment.id, paymentLinkId, `Xuất kho bán hàng (PayOS Đơn hàng #${orderId})`);
        } else if (paymentLinkInfo.status === 'CANCELLED') {
            await Payment.updateStatus(payment.id, paymentLinkId, 'FAILED');
            return { success: false, message: 'Giao dịch đã bị hủy bởi người dùng' };
        } else {
            return { success: false, message: 'Giao dịch chưa hoàn thành. Trạng thái: ' + paymentLinkInfo.status };
        }
    }

    // 3. Xử lý webhook ngầm nền từ PayOS gửi về
    static async processPayOSWebhook(webhookBody) {
        const payos = getPayOS();
        
        // Xác thực chữ ký số webhook an toàn bằng SDK
        const verifiedData = await payos.webhooks.verify(webhookBody);
        if (!verifiedData) {
            throw new Error('Chữ ký Webhook của PayOS không hợp lệ');
        }

        const orderId = verifiedData.orderCode;
        
        // Tìm giao dịch tương ứng trong CSDL
        const payment = await Payment.findByOrderId(orderId);
        if (!payment) {
            throw new Error('Không tìm thấy giao dịch thanh toán cho đơn hàng #' + orderId);
        }

        // Webhook gửi thông tin thành công qua trường code = "00"
        if (webhookBody.success || webhookBody.code === '00') {
            const result = await confirmPaidOrder(orderId, payment.id, verifiedData.paymentLinkId, `Xuất kho bán hàng (PayOS Webhook Đơn hàng #${orderId})`);
            return {
                success: result.success,
                message: result.success ? 'Thanh toán qua Webhook thành công' : result.message
            };
        } else {
            await Payment.updateStatus(payment.id, verifiedData.paymentLinkId, 'FAILED');
            return { success: false, message: 'Thanh toán qua Webhook thất bại hoặc bị hủy' };
        }
    }

}

module.exports = PaymentService;