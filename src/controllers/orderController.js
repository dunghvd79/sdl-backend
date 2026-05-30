// ==========================================
// FILE 2: src/controllers/orderController.js
// ==========================================
const OrderService = require('../services/orderService');

class OrderController {
    // POST /api/orders/checkout
    static async checkout(req, res) {
        try {
            const { shippingName, shippingPhone, shippingAddress, shippingNotes, paymentMethod, couponCode } = req.body;

            if (!shippingName || shippingName.trim() === '') {
                return res.status(400).json({ error: 'Họ tên người nhận không được để trống' });
            }
            if (!shippingPhone || shippingPhone.trim() === '') {
                return res.status(400).json({ error: 'Số điện thoại nhận hàng không được để trống' });
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
            }, paymentMethod, couponCode);

            res.status(201).json({
                message: 'Đặt hàng thành công!',
                data: order
            });
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    }

    // GET /api/orders
    static async getMyOrders(req, res) {
        try {
            const orders = await OrderService.getUserOrders(req.user.id);
            res.status(200).json({ data: orders });
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

            res.status(200).json({ data: order });
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
                data: updatedOrder
            });
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    }
}

module.exports = OrderController;
