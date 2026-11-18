// FILE 1: src/services/orderService.js
// ==========================================
const Order = require('../models/Order');
const Cart = require('../models/Cart');
const pool = require('../config/database');
const Coupon = require('../models/Coupon');
const { invalidateBookCache } = require('../config/redis');
const Inventory = require('../models/Inventory');
const AppError = require('../utils/AppError');
const Payment = require('../models/Payment');
const crypto = require('crypto');
const { ORDER_STATUS_LABELS, isValidStatus, canTransition } = require('../utils/orderStatus');
const { sortByBookId } = require('../utils/lockOrder');

class OrderService {
    // Biến Giỏ hàng thành Đơn hàng
    static async checkout(userId, shippingInfo = {}, paymentMethod = 'ONLINE', couponCode = null, selectedBookIds = null) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // 1. Lấy giỏ hàng hiện tại của User
            const cart = await Cart.getByUserId(userId);
            if (!cart || !cart.items || cart.items.length === 0) {
                throw new AppError('Giỏ hàng trống, không thể thanh toán!', 400);
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
                throw new AppError('Không có sản phẩm nào được chọn để thanh toán!', 400);
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
                // Khoá dòng coupon tới khi COMMIT: đơn đồng thời dùng cùng mã phải chờ, rồi đọc used_count mới nhất (B45)
                const coupon = await Coupon.findByCode(couponCode, client, { forUpdate: true });
                if (!coupon) {
                    throw new AppError('Mã giảm giá không tồn tại', 400);
                }
                if (!coupon.is_active) {
                    throw new AppError('Mã giảm giá đã bị vô hiệu hóa', 400);
                }
                const now = new Date();
                const start = new Date(coupon.start_date);
                const end = new Date(coupon.end_date);
                if (now < start) {
                    throw new AppError('Mã giảm giá chưa đến thời gian áp dụng', 400);
                }
                if (now > end) {
                    throw new AppError('Mã giảm giá đã hết hạn sử dụng', 400);
                }
                if (coupon.used_count >= coupon.usage_limit) {
                    throw new AppError('Mã giảm giá đã hết lượt sử dụng', 400);
                }

                // Kiểm tra xem người dùng đã dùng mã giảm giá này chưa
                const isUsed = await Coupon.checkUserUsed(userId, coupon.id, client);
                if (isUsed) {
                    throw new AppError('Bạn đã sử dụng mã giảm giá này cho đơn hàng khác rồi', 400);
                }

                // Kiểm tra giá trị đơn hàng tối thiểu
                if (totalAmount < Number(coupon.min_order_amount)) {
                    throw new AppError(`Mã giảm giá này chỉ áp dụng cho đơn hàng tối thiểu từ ${Number(coupon.min_order_amount).toLocaleString('vi-VN')} đ`, 400);
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
            // Giữ chỗ (khoá dòng kho) theo book_id tăng dần: thứ tự món trong giỏ không cố định → chống deadlock (B72)
            for (const item of sortByBookId(itemsToOrder)) {
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
            await invalidateBookCache(); // giữ hàng làm đổi tồn kho đang hiển thị
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

    // ==========================================
    // HUỶ ĐƠN & ĐỔI TRẠNG THÁI (B42, B47)
    // Mọi luồng huỷ (khách, admin) đi qua _cancelInTransaction → không thể lệch nhau nữa.
    // ==========================================

    // Huỷ đơn bên trong một transaction ĐANG MỞ, với trạng thái đã đọc SAU khi khoá dòng đơn.
    // - Đơn còn PENDING: hàng mới giữ chỗ → nhả giữ chỗ.
    // - Đơn đã trừ kho (CONFIRMED / PACKAGING): hoàn hàng về kho.
    // - Đã thu tiền online: payment SUCCESS → REFUND_PENDING (B42).
    static async _cancelInTransaction(client, order, currentStatus, { actorId, reason = null, actorLabel }) {
        for (const item of sortByBookId(order.items || [])) { // khoá kho theo book_id tăng dần (B72)
            if (currentStatus === 'PENDING') {
                await Inventory.cancelReservation(client, item.bookId, item.quantity, `${actorLabel} hủy đơn hàng #${order.id}`, actorId);
            } else {
                await Inventory.returnStock(client, item.bookId, item.quantity, `${actorLabel} hủy đơn hàng #${order.id} (Hoàn hàng)`, actorId);
            }
        }
        await Payment.markRefundPending(client, order.id);
        return Order.setStatus(client, order.id, 'CANCELLED', reason);
    }

    // Khách hàng hủy đơn hàng (được huỷ khi chưa giao: PENDING, CONFIRMED, PACKAGING — theo ORDER_TRANSITIONS)
    static async cancelOrder(orderId, userId, cancelReason = null) {
        // Đọc đơn (kèm danh sách món) để kiểm tra chủ đơn. Trạng thái dùng để quyết định thì đọc lại sau khi khoá.
        const order = await Order.findById(orderId);
        if (!order) {
            throw new AppError('Không tìm thấy đơn hàng!', 400);
        }
        if (order.user_id !== userId) {
            throw new AppError('Bạn không có quyền hủy đơn hàng này!', 400);
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Khoá đơn rồi mới đọc trạng thái: nếu PayOS vừa xác nhận thanh toán thì thấy CONFIRMED → hoàn kho đúng
            const currentStatus = await Order.lockStatus(client, orderId);
            if (!canTransition(currentStatus, 'CANCELLED')) {
                throw new AppError('Đơn hàng đã được giao hoặc đang vận chuyển, không thể tự hủy. Vui lòng liên hệ bộ phận hỗ trợ!', 400);
            }

            const cancelled = await this._cancelInTransaction(client, order, currentStatus, {
                actorId: userId, reason: cancelReason, actorLabel: 'Khách hàng'
            });

            await client.query('COMMIT');
            await invalidateBookCache(); // trả hàng về kho
            return cancelled;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // Admin đổi trạng thái đơn theo bảng ORDER_TRANSITIONS (B46).
    // Trả { order, changed }: changed = false khi đơn đã ở đúng trạng thái này (PUT idempotent, không làm gì).
    static async updateStatusByAdmin(orderId, newStatus, { reason = null, adminId }) {
        if (!isValidStatus(newStatus)) {
            throw new AppError('Trạng thái không hợp lệ', 400);
        }

        // Đọc đơn (kèm danh sách món) để biết trừ/hoàn kho sách nào. KHÔNG dùng order.status để quyết định.
        const order = await Order.findById(orderId);
        if (!order) {
            throw new AppError('Không tìm thấy đơn hàng', 404);
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Khoá đơn và đọc trạng thái HIỆN TẠI (B41): PayOS có thể vừa xác nhận đơn này
            const oldStatus = await Order.lockStatus(client, orderId);

            if (oldStatus === newStatus) {
                // Không đổi gì: trả dòng orders hiện tại (cùng hình dạng với nhánh có đổi — RETURNING *)
                const { rows: [current] } = await client.query('SELECT * FROM orders WHERE id = $1', [orderId]);
                await client.query('ROLLBACK');
                return { order: current, changed: false };
            }
            if (!canTransition(oldStatus, newStatus)) {
                throw new AppError(
                    `Không thể chuyển đơn hàng từ "${ORDER_STATUS_LABELS[oldStatus]}" sang "${ORDER_STATUS_LABELS[newStatus]}"`,
                    400
                );
            }

            let updated;
            if (newStatus === 'CANCELLED') {
                // Huỷ: dùng chung với khách (kho + REFUND_PENDING)
                updated = await this._cancelInTransaction(client, order, oldStatus, {
                    actorId: adminId, reason, actorLabel: 'Quản trị viên'
                });
            } else {
                // Xác nhận đơn chờ: trừ kho thật. Các bước tiến/lùi khác không đổi kho (đã trừ lúc xác nhận).
                if (oldStatus === 'PENDING' && newStatus === 'CONFIRMED') {
                    for (const item of sortByBookId(order.items || [])) { // B72
                        await Inventory.commit(client, item.bookId, item.quantity, `Xác nhận đơn hàng #${orderId}`, adminId);
                    }
                }
                updated = await Order.setStatus(client, orderId, newStatus);
            }

            // Báo cho khách (cùng transaction: lỗi thì không có thông báo "ma")
            await client.query(
                'INSERT INTO notifications (user_id, title, content, type) VALUES ($1, $2, $3, $4)',
                [
                    order.user_id,
                    'Cập nhật trạng thái đơn hàng',
                    `Đơn hàng #${orderId} của bạn đã được chuyển sang trạng thái: ${ORDER_STATUS_LABELS[newStatus]}.`,
                    'ORDER'
                ]
            );

            await client.query('COMMIT');
            await invalidateBookCache(); // xác nhận / huỷ làm đổi tồn kho
            return { order: updated, changed: true };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // Admin đổi trạng thái hàng loạt (B48). items: [{ id: hashId gốc, orderId: số đã giải mã | null }].
    // Mỗi đơn chạy updateStatusByAdmin trong transaction RIÊNG: một đơn lỗi không kéo cả lô rollback.
    // Lỗi nghiệp vụ (AppError) trả nguyên câu; lỗi khác chỉ ghi log kèm errorId, không lộ ra ngoài (spec 001).
    static async bulkUpdateStatusByAdmin(items, newStatus, { reason = null, adminId }) {
        const succeeded = [];
        const failed = [];
        for (const { id, orderId } of items) {
            if (orderId === null) {
                failed.push({ id, error: 'Mã đơn hàng không hợp lệ!' });
                continue;
            }
            try {
                await this.updateStatusByAdmin(orderId, newStatus, { reason, adminId });
                succeeded.push(id);
            } catch (err) {
                if (err instanceof AppError) {
                    failed.push({ id, error: err.message });
                } else {
                    const errorId = crypto.randomUUID();
                    console.error(`[error ${errorId}] bulk-status order ${orderId}:`, err);
                    failed.push({ id, error: `Đã xảy ra lỗi hệ thống (mã lỗi: ${errorId})` });
                }
            }
        }
        return { succeeded, failed };
    }

    // Tự động hủy đơn ONLINE hết hạn 15 phút chưa thanh toán
    static async checkAndCancelExpiredOrders() {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // 1. Tìm tất cả đơn hàng ONLINE, PENDING đã quá 15 phút
            const expiredQuery = `
                SELECT id 
                FROM orders 
                WHERE payment_method = 'ONLINE' 
                  AND status = 'PENDING' 
                  AND created_at < CURRENT_TIMESTAMP - INTERVAL '15 minutes'
                ORDER BY id
                FOR UPDATE
            `;
            const expiredRes = await client.query(expiredQuery);
            const expiredOrders = expiredRes.rows;

            if (expiredOrders.length === 0) {
                await client.query('COMMIT');
                return 0;
            }

            const expiredOrderIds = expiredOrders.map(o => o.id);

            // 2. Nhả giữ chỗ của MỌI đơn hết hạn trong một vòng, theo book_id tăng dần (B72): duyệt từng đơn thì
            //    transaction này khoá kho theo thứ tự đơn, có thể ngược với một đơn đang đặt → deadlock
            const { rows: items } = await client.query(
                'SELECT order_id, book_id, quantity FROM order_items WHERE order_id = ANY($1) ORDER BY book_id, order_id',
                [expiredOrderIds]
            );
            for (const item of items) {
                await Inventory.cancelReservation(client, item.book_id, item.quantity, `Hủy đơn hàng hết hạn thanh toán #${item.order_id}`, null);
            }

            // Cập nhật trạng thái giao dịch payments tương ứng thành FAILED
            await client.query(`
                UPDATE payments
                SET status = 'FAILED'
                WHERE order_id = ANY($1) AND status = 'PENDING'
            `, [expiredOrderIds]);

            // 3. Cập nhật trạng thái của các đơn hàng này thành CANCELLED
            const updateOrdersQuery = `
                UPDATE orders 
                SET status = 'CANCELLED', 
                    cancel_reason = 'Hết hạn thời gian thanh toán (15 phút)', 
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ANY($1)
            `;
            await client.query(updateOrdersQuery, [expiredOrderIds]);

            await client.query('COMMIT');
            await invalidateBookCache(); // nhả hàng giữ chỗ của đơn quá hạn
            return expiredOrderIds.length;
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

    // Chuyển đổi từ ONLINE sang COD cho đơn hàng PENDING
    static async changeToCod(orderId, userId) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // 1. Kiểm tra đơn hàng có tồn tại, thuộc về user và đang là ONLINE & PENDING không
            const getOrderQuery = 'SELECT * FROM orders WHERE id = $1 FOR UPDATE';
            const orderRes = await client.query(getOrderQuery, [orderId]);
            const order = orderRes.rows[0];

            if (!order) {
                throw new AppError('Không tìm thấy đơn hàng!', 400);
            }
            if (order.user_id !== userId) {
                throw new AppError('Bạn không có quyền thay đổi đơn hàng này!', 400);
            }
            if (order.status !== 'PENDING') {
                throw new AppError('Chỉ có thể thay đổi phương thức thanh toán cho đơn hàng đang chờ xử lý!', 400);
            }
            if (order.payment_method !== 'ONLINE') {
                throw new AppError('Chỉ hỗ trợ chuyển đổi từ thanh toán ONLINE sang COD!', 400);
            }

            // 2. Cập nhật phương thức thanh toán thành COD
            const updateOrderQuery = `
                UPDATE orders 
                SET payment_method = 'COD', updated_at = CURRENT_TIMESTAMP 
                WHERE id = $1 
                RETURNING *
            `;
            const updateOrderRes = await client.query(updateOrderQuery, [orderId]);

            // 3. Đánh dấu các giao dịch payments ONLINE cũ thành FAILED
            await client.query(`
                UPDATE payments 
                SET status = 'FAILED'
                WHERE order_id = $1 AND status = 'PENDING'
            `, [orderId]);

            // 4. Dọn sạch các sản phẩm tương ứng trong đơn khỏi giỏ hàng của user
            const itemsQuery = 'SELECT book_id FROM order_items WHERE order_id = $1';
            const itemsRes = await client.query(itemsQuery, [orderId]);
            const bookIds = itemsRes.rows.map(item => item.book_id);

            const cart = await Cart.getByUserId(userId);
            if (cart && bookIds.length > 0) {
                await Cart.removeItems(cart.id, bookIds, client);
            }

            await client.query('COMMIT');
            return updateOrderRes.rows[0];
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }
}

module.exports = OrderService;

