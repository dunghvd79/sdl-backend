const Payment = require('../models/Payment');
const Order = require('../models/Order');
const Cart = require('../models/Cart');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function getFormattedDate(date) {
    const pad = (num) => String(num).padStart(2, '0');
    return date.getFullYear() +
        pad(date.getMonth() + 1) +
        pad(date.getDate()) +
        pad(date.getHours()) +
        pad(date.getMinutes()) +
        pad(date.getSeconds());
}

// Hàm sắp xếp tham số chuẩn VNPAY cung cấp trong tài liệu kỹ thuật
function sortObject(obj) {
    let sorted = {};
    let str = [];
    let key;
    for (key in obj) {
        if (obj.hasOwnProperty(key)) {
            str.push(encodeURIComponent(key));
        }
    }
    str.sort();
    for (key = 0; key < str.length; key++) {
        sorted[str[key]] = encodeURIComponent(obj[str[key]]).replace(/%20/g, "+");
    }
    return sorted;
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
        const returnUrl = 'http://localhost:3000/api/payments/payos_return';
        const cancelUrl = 'http://localhost:3000/api/payments/payos_cancel';

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
            await Payment.updateStatus(payment.id, paymentLinkId, 'SUCCESS');
            await Order.updateStatus(orderId, 'CONFIRMED');

            // Tìm giỏ hàng của user và dọn sạch
            const order = await Order.findById(orderId);
            if (order && order.user_id) {
                const cart = await Cart.getByUserId(order.user_id);
                if (cart) {
                    await Cart.clear(cart.id);
                }
            }

            // Trừ giữ chỗ và ghi nhận xuất kho thực tế khi thanh toán thành công
            if (order && order.items && order.items.length > 0) {
                const Inventory = require('../models/Inventory');
                for (const item of order.items) {
                    await Inventory.commit(null, item.bookId, item.quantity, `Xuất kho bán hàng (PayOS Đơn hàng #${orderId})`, order.user_id);
                }
            }

            return { success: true, orderId };
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
            await Payment.updateStatus(payment.id, verifiedData.paymentLinkId, 'SUCCESS');
            await Order.updateStatus(orderId, 'CONFIRMED');

            // Tìm giỏ hàng và dọn sạch
            const order = await Order.findById(orderId);
            if (order && order.user_id) {
                const cart = await Cart.getByUserId(order.user_id);
                if (cart) {
                    await Cart.clear(cart.id);
                }
            }

            // Trừ giữ chỗ và ghi nhận xuất kho thực tế
            if (order && order.items && order.items.length > 0) {
                const Inventory = require('../models/Inventory');
                for (const item of order.items) {
                    await Inventory.commit(null, item.bookId, item.quantity, `Xuất kho bán hàng (PayOS Webhook Đơn hàng #${orderId})`, order.user_id);
                }
            }

            return { success: true, message: 'Thanh toán qua Webhook thành công' };
        } else {
            await Payment.updateStatus(payment.id, verifiedData.paymentLinkId, 'FAILED');
            return { success: false, message: 'Thanh toán qua Webhook thất bại hoặc bị hủy' };
        }
    }

    // ----------------------------------------------------
    // CÁC HÀM MẪU VNPAY (GIỮ LẠI LÀM FALLBACK/TƯƠNG THÍCH)
    // ----------------------------------------------------

    // 1. Tạo Link thanh toán VNPay Sandbox thực tế
    static async createPaymentUrl(orderId, amount, ipAddr = '127.0.0.1') {
        // Lưu lịch sử giao dịch ban đầu với trạng thái PENDING
        const payment = await Payment.create(orderId, amount, 'VNPAY');

        const tmnCode = (process.env.VNP_TMN_CODE || 'K4SAIFWJ').trim();
        const hashSecret = (process.env.VNP_HASH_SECRET || 'NCQ4W6WIU0FTQMT4RXOM7WTLLG8LHJ4O').trim();
        const vnpUrl = (process.env.VNP_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html').trim();
        const returnUrl = (process.env.VNP_RETURN_URL || 'http://localhost:3000/api/payments/vnpay_return').trim();

        const createDate = getFormattedDate(new Date());

        // Chuẩn hóa địa chỉ IP: Nếu là IPv6 Localhost (::1 hoặc chứa colons), bắt buộc đưa về IPv4 127.0.0.1
        let clientIp = ipAddr.trim();
        if (clientIp === '::1' || clientIp.includes('::') || clientIp === 'localhost') {
            clientIp = '127.0.0.1';
        }

        let vnp_Params = {};
        vnp_Params['vnp_Version'] = '2.1.0';
        vnp_Params['vnp_Command'] = 'pay';
        vnp_Params['vnp_TmnCode'] = tmnCode;
        vnp_Params['vnp_Locale'] = 'vn';
        vnp_Params['vnp_CurrCode'] = 'VND';
        vnp_Params['vnp_TxnRef'] = String(orderId);
        vnp_Params['vnp_OrderInfo'] = 'Thanh toan don hang ' + orderId;
        vnp_Params['vnp_OrderType'] = 'other';
        vnp_Params['vnp_Amount'] = Math.round(amount * 100);
        vnp_Params['vnp_ReturnUrl'] = returnUrl;
        vnp_Params['vnp_IpAddr'] = clientIp;
        vnp_Params['vnp_CreateDate'] = createDate;

        // Sắp xếp các tham số bằng hàm sortObject chính thức của VNPay
        vnp_Params = sortObject(vnp_Params);

        // Tạo chuỗi ký dữ liệu (signData) ghép nối bằng &
        const signData = Object.keys(vnp_Params)
            .map(key => `${key}=${vnp_Params[key]}`)
            .join('&');

        const hmac = crypto.createHmac("sha512", hashSecret);
        const secureHash = hmac.update(Buffer.from(signData, 'utf-8')).digest("hex");

        // GHI NHẬT KÝ RA FILE ĐỂ CHẨN ĐOÁN LỖI CHÍNH XÁC
        try {
            const debugFilePath = path.join(__dirname, '..', '..', 'vnpay_debug.log');
            const debugLog = `
======== [VNPAY DEBUG - ${new Date().toISOString()}] ========
TMN CODE DÙNG KÝ: "${tmnCode}"
SECRET KEY DÙNG KÝ: "${hashSecret}"
IP GỬI SANG VNPAY: "${clientIp}"
CHUỖI SIGN DATA GHÉP NỐI: "${signData}"
MÃ BĂM SECURE HASH TẠO RA: "${secureHash}"
====================================================
`;
            fs.appendFileSync(debugFilePath, debugLog, 'utf-8');
        } catch (logErr) {
            console.error('❌ Không thể ghi tệp log:', logErr.message);
        }

        vnp_Params['vnp_SecureHash'] = secureHash;
        
        // Tạo URL thanh toán hoàn chỉnh
        const redirectUrl = vnpUrl + '?' + Object.keys(vnp_Params)
            .map(key => `${key}=${vnp_Params[key]}`)
            .join('&');

        return redirectUrl;
    }

    // 2. Xác minh chữ ký số VNPay phản hồi
    static verifyVNPaySignature(vnp_Params) {
        const secureHash = vnp_Params['vnp_SecureHash'];
        
        // Tạo một bản sao để tránh chỉnh sửa object gốc
        const paramsCopy = { ...vnp_Params };
        delete paramsCopy['vnp_SecureHash'];
        delete paramsCopy['vnp_SecureHashType'];

        const hashSecret = (process.env.VNP_HASH_SECRET || 'NCQ4W6WIU0FTQMT4RXOM7WTLLG8LHJ4O').trim();

        // Sắp xếp các tham số phản hồi bằng hàm sortObject chính thức
        const sortedParams = sortObject(paramsCopy);

        const signData = Object.keys(sortedParams)
            .map(key => `${key}=${sortedParams[key]}`)
            .join('&');

        const hmac = crypto.createHmac("sha512", hashSecret);
        const calculatedHash = hmac.update(Buffer.from(signData, 'utf-8')).digest("hex");

        return calculatedHash === secureHash;
    }

    // 3. Xử lý phản hồi thanh toán
    static async processVNPayResult(vnp_Params) {
        const orderId = parseInt(vnp_Params['vnp_TxnRef']);
        const responseCode = vnp_Params['vnp_ResponseCode'];
        const transactionNo = vnp_Params['vnp_TransactionNo'];
        const amount = parseFloat(vnp_Params['vnp_Amount']) / 100;

        // 1. Tìm giao dịch tương ứng trong CSDL
        const payment = await Payment.findByOrderId(orderId);
        if (!payment) {
            throw new Error('Không tìm thấy giao dịch thanh toán cho đơn hàng #' + orderId);
        }

        // 2. Nếu VNPay báo thành công (Mã phản hồi '00')
        if (responseCode === '00') {
            // Cập nhật trạng thái giao dịch thành SUCCESS
            await Payment.updateStatus(payment.id, transactionNo, 'SUCCESS');

            // Cập nhật trạng thái đơn hàng thành CONFIRMED
            await Order.updateStatus(orderId, 'CONFIRMED');

            // Tìm giỏ hàng của user và dọn sạch
            const order = await Order.findById(orderId);
            if (order && order.user_id) {
                const Cart = require('../models/Cart');
                const cart = await Cart.getByUserId(order.user_id);
                if (cart) {
                    await Cart.clear(cart.id);
                }
            }

            // Trừ giữ chỗ và ghi nhận xuất kho thực tế khi thanh toán thành công
            if (order && order.items && order.items.length > 0) {
                const Inventory = require('../models/Inventory');
                for (const item of order.items) {
                    await Inventory.commit(null, item.bookId, item.quantity, `Xuất kho bán hàng (VNPay Đơn hàng #${orderId})`, order.user_id);
                }
            }

            return { success: true, message: 'Thanh toán đơn hàng thành công' };
        } else {
            // Nếu giao dịch thất bại hoặc bị hủy
            await Payment.updateStatus(payment.id, transactionNo, 'FAILED');
            return { success: false, message: 'Giao dịch bị hủy hoặc thất bại' };
        }
    }
}

module.exports = PaymentService;