// ==========================================
// FILE 2: src/controllers/orderController.js
// ==========================================
const OrderService = require('../services/orderService');
const { encodeOrderId, encodeBookId } = require('../utils/hashids');

function formatOrder(order) {
    if (!order) return null;
    const formatted = { ...order, hashId: encodeOrderId(order.id, order.created_at) };
    if (Array.isArray(formatted.items)) {
        formatted.items = formatted.items.map(item => ({
            ...item,
            hashId: encodeBookId(item.bookId)
        }));
    }
    return formatted;
}

class OrderController {
    // POST /api/orders/checkout
    static async checkout(req, res) {
        try {
            const { shippingName, shippingPhone, shippingAddress, shippingNotes, paymentMethod, couponCode, selectedBookIds } = req.body;

            if (!shippingName || shippingName.trim() === '') {
                return res.status(400).json({ error: 'Họ tên người nhận không được để trống' });
            }
            if (!shippingPhone || shippingPhone.trim() === '') {
                return res.status(400).json({ error: 'Số điện thoại nhận hàng không được để trống' });
            }
            if (!shippingPhone.trim().match(/^(0|\+84)[3|5|7|8|9][0-9]{8}$/)) {
                return res.status(400).json({ error: 'Số điện thoại không hợp lệ' });
            }
            if (!shippingAddress || shippingAddress.trim() === '') {
                return res.status(400).json({ error: 'Địa chỉ giao hàng không được để trống' });
            }
            if (!paymentMethod || !['COD', 'ONLINE'].includes(paymentMethod)) {
                return res.status(400).json({ error: 'Phương thức thanh toán không hợp lệ (phải là COD hoặc ONLINE)' });
            }

            const order = await OrderService.checkout(req.user.id, {
                shippingName: shippingName.trim(),
                shippingPhone: shippingPhone.trim(),
                shippingAddress: shippingAddress.trim(),
                shippingNotes: shippingNotes ? shippingNotes.trim() : ''
            }, paymentMethod, couponCode, selectedBookIds);

            res.status(201).json({
                message: 'Đặt hàng thành công!',
                data: formatOrder(order)
            });
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    }

    // GET /api/orders
    static async getMyOrders(req, res) {
        try {
            const orders = await OrderService.getUserOrders(req.user.id);
            res.status(200).json({ data: orders.map(formatOrder) });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }

    // GET /api/orders/:id
    static async getOrderDetails(req, res) {
        try {
            const { id } = req.params;
            const order = await OrderService.getOrderById(id);
            if (!order) {
                return res.status(404).json({ error: 'Không tìm thấy đơn hàng!' });
            }

            // Kiểm tra quyền: Chỉ cho phép người sở hữu đơn hàng hoặc admin/curator xem
            const isEmployee = req.user.role === 'ADMIN' || req.user.role === 'CURATOR';
            if (!isEmployee && order.user_id !== req.user.id) {
                return res.status(403).json({ error: 'Bạn không có quyền truy cập thông tin đơn hàng này!' });
            }

            res.status(200).json({ data: formatOrder(order) });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }

    // PUT /api/orders/:id/cancel
    static async cancelOrder(req, res) {
        try {
            const { id } = req.params;
            const userId = req.user.id;
            const { cancelReason } = req.body;

            const updatedOrder = await OrderService.cancelOrder(id, userId, cancelReason);

            res.status(200).json({
                message: 'Hủy đơn hàng thành công!',
                data: formatOrder(updatedOrder)
            });
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    }
}

module.exports = OrderController;
