// FILE 1: src/services/orderService.js
// ==========================================
const Order = require('../models/Order');
const Cart = require('../models/Cart');
const pool = require('../config/database');
const Coupon = require('../models/Coupon');
const Inventory = require('../models/Inventory');

class OrderService {
    // Biến Giỏ hàng thành Đơn hàng
    static async checkout(userId, shippingInfo = {}, paymentMethod = 'ONLINE', couponCode = null, selectedBookIds = null) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // 1. Lấy giỏ hàng hiện tại của User
            const cart = await Cart.getByUserId(userId);
            if (!cart || !cart.items || cart.items.length === 0) {
                throw new Error('Giỏ hàng trống, không thể thanh toán!');
            }

            let itemsToOrder = cart.items;
            if (selectedBookIds && Array.isArray(selectedBookIds) && selectedBookIds.length > 0) {
                const { decodeBookId } = require('../utils/hashids');
                const decodedIds = selectedBookIds.map(id => {
                    if (typeof id === 'string' && isNaN(id)) {
                        return decodeBookId(id);
                    }
                    return parseInt(id);
                });
                itemsToOrder = cart.items.filter(item => decodedIds.includes(item.bookId));
            }

            if (!itemsToOrder || itemsToOrder.length === 0) {
                throw new Error('Không có sản phẩm nào được chọn để thanh toán!');
            }

            // 2. Tính tổng tiền của cả đơn hàng
            let totalAmount = 0;
            for (const item of itemsToOrder) {
                totalAmount += item.priceAtAdd * item.quantity;
            }

            // 3. Xử lý coupon nếu có
            let couponId = null;
            let discountAmount = 0;
            if (couponCode && couponCode.trim() !== '') {
                const coupon = await Coupon.findByCode(couponCode);
                if (!coupon) {
                    throw new Error('Mã giảm giá không tồn tại');
                }
                if (!coupon.is_active) {
                    throw new Error('Mã giảm giá đã bị vô hiệu hóa');
                }
                const now = new Date();
                const start = new Date(coupon.start_date);
                const end = new Date(coupon.end_date);
                if (now < start) {
                    throw new Error('Mã giảm giá chưa đến thời gian áp dụng');
                }
                if (now > end) {
                    throw new Error('Mã giảm giá đã hết hạn sử dụng');
                }
                if (coupon.used_count >= coupon.usage_limit) {
                    throw new Error('Mã giảm giá đã hết lượt sử dụng');
                }

                // Kiểm tra xem người dùng đã dùng mã giảm giá này chưa
                const isUsed = await Coupon.checkUserUsed(userId, coupon.id);
                if (isUsed) {
                    throw new Error('Bạn đã sử dụng mã giảm giá này cho đơn hàng khác rồi');
                }

                // Kiểm tra giá trị đơn hàng tối thiểu
                if (totalAmount < Number(coupon.min_order_amount)) {
                    throw new Error(`Mã giảm giá này chỉ áp dụng cho đơn hàng tối thiểu từ ${Number(coupon.min_order_amount).toLocaleString('vi-VN')} đ`);
                }

                // Tính số tiền được giảm
                if (coupon.discount_type === 'PERCENT') {
                    discountAmount = (totalAmount * Number(coupon.discount_value)) / 100;
                    if (coupon.max_discount_amount && discountAmount > Number(coupon.max_discount_amount)) {
                        discountAmount = Number(coupon.max_discount_amount);
                    }
                } else if (coupon.discount_type === 'FIXED') {
                    discountAmount = Number(coupon.discount_value);
                    if (discountAmount > totalAmount) {
                        discountAmount = totalAmount; // Không giảm vượt quá giá trị đơn hàng
                    }
                }
                discountAmount = Math.round(discountAmount);
                couponId = coupon.id;

                // Ghi nhận sử dụng và tăng lượt dùng coupon (trong transaction)
                await Coupon.recordUsage(client, userId, coupon.id);
                await Coupon.incrementUsedCount(client, coupon.id);
            }

            // Số tiền cuối cùng cần thanh toán sau khi áp mã
            const finalAmount = totalAmount - discountAmount;

            // 4. Tạo Tờ Hóa Đơn tổng (Vào bảng orders) - sử dụng client
            const { shippingName, shippingPhone, shippingAddress, shippingNotes } = shippingInfo;
            const order = await Order.create(
                client, 
                userId, 
                finalAmount, 
                shippingName, 
                shippingPhone, 
                shippingAddress, 
                shippingNotes, 
                paymentMethod,
                couponId,
                discountAmount
            );

            // 5. Chép từng món từ Giỏ hàng sang Hóa đơn (Vào bảng order_items) - sử dụng client
            for (const item of itemsToOrder) {
                await Order.addItem(client, order.id, item.bookId, item.quantity, item.priceAtAdd);
                // Giữ chỗ sách trong kho thực tế khi đơn hàng được đặt (trạng thái PENDING)
                await Inventory.hold(client, item.bookId, item.quantity);
            }

            // 6. Xóa sạch giỏ hàng sau khi đã chốt đơn thành công! (Nếu là COD)
            if (paymentMethod === 'COD') {
                const bookIdsToRemove = itemsToOrder.map(item => item.bookId);
                await Cart.removeItems(cart.id, bookIdsToRemove, client);
            }

            await client.query('COMMIT');
            return order;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // Lấy lịch sử mua hàng
    static async getUserOrders(userId) {
        return await Order.getUserOrders(userId);
    }

    // Lấy chi tiết một đơn hàng theo ID
    static async getOrderById(orderId) {
        return await Order.findById(orderId);
    }

    // Khách hàng hủy đơn hàng (chỉ cho phép khi ở trạng thái PENDING, CONFIRMED, PACKAGING)
    static async cancelOrder(orderId, userId, cancelReason = null) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const order = await Order.findById(orderId);
            if (!order) {
                throw new Error('Không tìm thấy đơn hàng!');
            }

            // Kiểm tra quyền sở hữu đơn hàng
            if (order.user_id !== userId) {
                throw new Error('Bạn không có quyền hủy đơn hàng này!');
            }

            const allowedStatuses = ['PENDING', 'CONFIRMED', 'PACKAGING'];
            if (!allowedStatuses.includes(order.status)) {
                throw new Error('Đơn hàng đã được giao hoặc đang vận chuyển, không thể tự hủy. Vui lòng liên hệ bộ phận hỗ trợ!');
            }

            const oldStatus = order.status;

            // Xử lý hoàn kho tương ứng
            if (order.items && order.items.length > 0) {
                for (const item of order.items) {
                    if (oldStatus === 'PENDING') {
                        // Nếu đang chờ duyệt (PENDING): Nhả lượng giữ chỗ
                        await Inventory.cancelReservation(client, item.bookId, item.quantity, `Khách hàng hủy đơn hàng #${orderId}`, userId);
                    } else {
                        // Nếu đã duyệt/đóng gói: Hoàn lại kho vật lý & trừ lượng đã bán
                        await Inventory.returnStock(client, item.bookId, item.quantity, `Khách hàng hủy đơn hàng #${orderId} (Hoàn hàng)`, userId);
                    }
                }
            }

            // Cập nhật trạng thái đơn hàng thành CANCELLED kèm lý do hủy
            const updateQuery = `
                UPDATE orders
                SET status = 'CANCELLED', cancel_reason = $2, updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
                RETURNING *
            `;
            const result = await client.query(updateQuery, [orderId, cancelReason]);

            await client.query('COMMIT');
            return result.rows[0];
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
}

module.exports = OrderService;

