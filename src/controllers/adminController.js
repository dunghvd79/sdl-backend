const pool = require('../config/database');
const User = require('../models/User');

class AdminController {
    // ==========================================
    // QUẢN LÝ ĐƠN HÀNG
    // ==========================================

    // GET /api/admin/orders?status=&date=&page=&limit=
    static async getAllOrders(req, res) {
        try {
            const { status, date, page = 1, limit = 20 } = req.query;
            const offset = (page - 1) * limit;

            let query = `
                SELECT o.id, o.total_amount, o.status, o.created_at, o.payment_method,
                       o.shipping_name, o.shipping_phone, o.shipping_address, o.shipping_notes,
                       o.discount_amount, c.code as coupon_code,
                       u.email, u.full_name,
                       json_agg(json_build_object('title', b.title, 'quantity', oi.quantity, 'price', oi.price)) as items
                FROM orders o
                JOIN users u ON o.user_id = u.id
                JOIN order_items oi ON o.id = oi.order_id
                JOIN books b ON oi.book_id = b.id
                LEFT JOIN coupons c ON o.coupon_id = c.id
            `;

            const params = [];
            const conditions = [];
            
            if (status && status !== 'Tất cả') {
                params.push(status);
                conditions.push(`o.status = $${params.length}`);
            }

            if (date) {
                params.push(date);
                conditions.push(`DATE(o.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh') = $${params.length}`);
            }

            if (conditions.length > 0) {
                query += ` WHERE ` + conditions.join(' AND ');
            }

            query += ` GROUP BY o.id, o.total_amount, o.status, o.created_at, o.payment_method, o.shipping_name, o.shipping_phone, o.shipping_address, o.shipping_notes, o.discount_amount, c.code, u.email, u.full_name`;
            query += ` ORDER BY o.created_at DESC`;
            
            params.push(limit, offset);
            query += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

            const result = await pool.query(query, params);

            res.status(200).json({ data: result.rows });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // PUT /api/admin/orders/:orderId/status
    static async updateOrderStatus(req, res) {
        try {
            const { orderId } = req.params;
            const { status } = req.body;

            const validStatuses = ['PENDING', 'CONFIRMED', 'PACKAGING', 'DELIVERING', 'DELIVERED', 'CANCELLED'];
            if (!validStatuses.includes(status)) {
                return res.status(400).json({ error: 'Trạng thái không hợp lệ' });
            }

            const Order = require('../models/Order');
            const Inventory = require('../models/Inventory');

            const order = await Order.findById(orderId);
            if (!order) {
                return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
            }

            const oldStatus = order.status;
            const newStatus = status;

            const client = await pool.connect();
            try {
                await client.query('BEGIN');

                if (oldStatus !== newStatus) {
                    if (oldStatus === 'PENDING' && ['CONFIRMED', 'PACKAGING', 'DELIVERING', 'DELIVERED'].includes(newStatus)) {
                        if (order.items && order.items.length > 0) {
                            for (const item of order.items) {
                                await Inventory.commit(client, item.bookId, item.quantity, `Xác nhận đơn hàng #${orderId}`, req.user.id);
                            }
                        }
                    } else if (oldStatus === 'PENDING' && newStatus === 'CANCELLED') {
                        if (order.items && order.items.length > 0) {
                            for (const item of order.items) {
                                await Inventory.cancelReservation(client, item.bookId, item.quantity, `Hủy đơn hàng #${orderId}`, req.user.id);
                            }
                        }
                    } else if (['CONFIRMED', 'PACKAGING', 'DELIVERING', 'DELIVERED'].includes(oldStatus) && newStatus === 'CANCELLED') {
                        if (order.items && order.items.length > 0) {
                            for (const item of order.items) {
                                await Inventory.returnStock(client, item.bookId, item.quantity, `Hủy đơn hàng #${orderId} (Hoàn hàng)`, req.user.id);
                            }
                        }
                    }
                }

                const query = 'UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *';
                const result = await client.query(query, [newStatus, orderId]);

                // Tự động chèn thông báo trạng thái đơn hàng cho khách hàng
                const statusLabels = {
                    PENDING: 'Chờ xử lý',
                    CONFIRMED: 'Đã xác nhận',
                    PACKAGING: 'Đang đóng gói',
                    DELIVERING: 'Đang giao hàng',
                    DELIVERED: 'Đã giao thành công',
                    CANCELLED: 'Đã hủy'
                };
                const newStatusLabel = statusLabels[newStatus] || newStatus;
                await client.query(
                    'INSERT INTO notifications (user_id, title, content, type) VALUES ($1, $2, $3, $4)',
                    [
                        order.user_id,
                        'Cập nhật trạng thái đơn hàng',
                        `Đơn hàng #${orderId} của bạn đã được chuyển sang trạng thái: ${newStatusLabel}.`,
                        'ORDER'
                    ]
                );

                await client.query('COMMIT');

                res.status(200).json({
                    message: 'Cập nhật trạng thái thành công',
                    data: result.rows[0]
                });
            } catch (err) {
                await client.query('ROLLBACK');
                throw err;
            } finally {
                client.release();
            }
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // ==========================================
    // QUẢN LÝ NGƯỜI DÙNG (Cho Bước 5)
    // ==========================================

    // GET /api/admin/users?search=&role=
    static async getAllUsers(req, res) {
        try {
            const { search, role } = req.query;
            let query = `
                SELECT id, email, full_name, role, is_active, created_at 
                FROM users 
            `;
            const params = [];
            const conditions = [];

            if (search) {
                params.push(`%${search}%`);
                conditions.push(`(email ILIKE $${params.length} OR full_name ILIKE $${params.length})`);
            }

            if (role) {
                params.push(role);
                conditions.push(`role = $${params.length}`);
            }

            if (conditions.length > 0) {
                query += ` WHERE ` + conditions.join(' AND ');
            }

            query += ` ORDER BY created_at DESC`;

            const result = await pool.query(query, params);
            res.status(200).json({ data: result.rows });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // PUT /api/admin/users/:userId/role
    static async updateUserRole(req, res) {
        try {
            const { userId } = req.params;
            const { role } = req.body;

            // Không cho phép Admin tự đổi role của chính mình
            if (parseInt(userId) === req.user.id) {
                return res.status(400).json({ error: 'Không thể tự thay đổi quyền của chính mình!' });
            }

            const validRoles = ['CUSTOMER', 'CURATOR', 'ADMIN'];
            if (!validRoles.includes(role)) {
                return res.status(400).json({ error: 'Role không hợp lệ' });
            }

            const query = 'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, email, full_name, role, is_active';
            const result = await pool.query(query, [role, userId]);

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Không tìm thấy người dùng' });
            }

            res.status(200).json({
                message: 'Cập nhật quyền thành công',
                data: result.rows[0]
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // PUT /api/admin/users/:userId/status
    static async toggleUserStatus(req, res) {
        try {
            const { userId } = req.params;
            const { isActive } = req.body;

            // Ngăn cản Admin tự khóa tài khoản của chính mình
            if (parseInt(userId) === req.user.id) {
                return res.status(400).json({ error: 'Không thể tự khóa hoặc mở khóa tài khoản của chính mình!' });
            }

            if (typeof isActive !== 'boolean') {
                return res.status(400).json({ error: 'Trạng thái isActive phải là giá trị boolean (true/false)' });
            }

            const updatedUser = await User.toggleStatus(userId, isActive);
            if (!updatedUser) {
                return res.status(404).json({ error: 'Không tìm thấy người dùng' });
            }

            res.status(200).json({
                message: 'Cập nhật trạng thái tài khoản thành công',
                data: updatedUser
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // DELETE /api/admin/users/:userId
    static async deleteUser(req, res) {
        const client = await pool.connect();
        try {
            const { userId } = req.params;

            // Ngăn cản Admin tự xóa tài khoản của chính mình
            if (parseInt(userId) === req.user.id) {
                return res.status(400).json({ error: 'Không thể tự xóa tài khoản của chính mình!' });
            }

            // Bắt đầu transaction
            await client.query('BEGIN');

            // 1. Xóa chi tiết giỏ hàng
            await client.query(`
                DELETE FROM cart_items 
                WHERE cart_id IN (SELECT id FROM carts WHERE user_id = $1)
            `, [userId]);

            // 2. Xóa giỏ hàng
            await client.query('DELETE FROM carts WHERE user_id = $1', [userId]);

            // 3. Xóa hồ sơ mở rộng (user_profiles)
            await client.query('DELETE FROM user_profiles WHERE user_id = $1', [userId]);

            // 4. Xóa đánh giá (reviews)
            await client.query('DELETE FROM reviews WHERE user_id = $1', [userId]);

            // 5. Xóa lịch sử mã giảm giá (user_coupons)
            await client.query('DELETE FROM user_coupons WHERE user_id = $1', [userId]);

            // 6. Xóa tin nhắn chat RAG
            await client.query(`
                DELETE FROM messages 
                WHERE session_id IN (SELECT id FROM chat_sessions WHERE user_id = $1)
            `, [userId]);

            // 7. Xóa phiên chat RAG (chat_sessions)
            await client.query('DELETE FROM chat_sessions WHERE user_id = $1', [userId]);

            // 8. Xóa chi tiết đơn hàng
            await client.query(`
                DELETE FROM order_items 
                WHERE order_id IN (SELECT id FROM orders WHERE user_id = $1)
            `, [userId]);

            // 9. Xóa đơn hàng
            await client.query('DELETE FROM orders WHERE user_id = $1', [userId]);

            // 10. Xóa người dùng trong bảng users
            const deleteResult = await client.query('DELETE FROM users WHERE id = $1 RETURNING id, email, full_name', [userId]);

            if (deleteResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ error: 'Không tìm thấy người dùng' });
            }

            await client.query('COMMIT');

            res.status(200).json({
                message: 'Xóa tài khoản người dùng và dữ liệu liên quan thành công',
                data: deleteResult.rows[0]
            });
        } catch (error) {
            await client.query('ROLLBACK');
            res.status(500).json({ error: error.message });
        } finally {
            client.release();
        }
    }

    // GET /api/admin/stats
    static async getDashboardStats(req, res) {
        try {
            // 1. Tổng doanh thu & giảm giá (không tính CANCELLED)
            const revenueQuery = `
                SELECT COALESCE(SUM(total_amount), 0) as total_revenue,
                       COALESCE(SUM(discount_amount), 0) as total_discount
                FROM orders 
                WHERE status != 'CANCELLED'
            `;
            const revenueRes = await pool.query(revenueQuery);
            const { total_revenue, total_discount } = revenueRes.rows[0];

            // 2. Thống kê đơn hàng theo trạng thái
            const orderStatusQuery = `
                SELECT status, COUNT(*) as count 
                FROM orders 
                GROUP BY status
            `;
            const orderStatusRes = await pool.query(orderStatusQuery);
            const orderStats = orderStatusRes.rows.reduce((acc, row) => {
                acc[row.status] = parseInt(row.count);
                return acc;
            }, {});

            // Đảm bảo đủ các trạng thái đơn hàng
            const allStatuses = ['PENDING', 'CONFIRMED', 'PACKAGING', 'DELIVERING', 'DELIVERED', 'CANCELLED'];
            allStatuses.forEach(status => {
                if (!(status in orderStats)) {
                    orderStats[status] = 0;
                }
            });

            // 3. Thống kê người dùng theo role
            const userRoleQuery = `
                SELECT role, COUNT(*) as count 
                FROM users 
                GROUP BY role
            `;
            const userRoleRes = await pool.query(userRoleQuery);
            const userStats = userRoleRes.rows.reduce((acc, row) => {
                acc[row.role] = parseInt(row.count);
                return acc;
            }, {});

            const allRoles = ['CUSTOMER', 'CURATOR', 'ADMIN'];
            allRoles.forEach(role => {
                if (!(role in userStats)) {
                    userStats[role] = 0;
                }
            });

            // 4. Thống kê tiến độ RAG (sách)
            const totalBooksRes = await pool.query('SELECT COUNT(*) as count FROM books');
            const totalBooks = parseInt(totalBooksRes.rows[0].count);

            const vectorizedBooksRes = await pool.query('SELECT COUNT(*) as count FROM books WHERE rag_indexed_at IS NOT NULL');
            const vectorizedBooks = parseInt(vectorizedBooksRes.rows[0].count);

            // 5. Top 5 sách bán chạy nhất
            const topBooksQuery = `
                SELECT b.id, b.title, b.author, COALESCE(SUM(oi.quantity), 0) as total_sold
                FROM order_items oi
                JOIN books b ON oi.book_id = b.id
                JOIN orders o ON oi.order_id = o.id
                WHERE o.status != 'CANCELLED'
                GROUP BY b.id, b.title, b.author
                ORDER BY total_sold DESC
                LIMIT 5
            `;
            const topBooksRes = await pool.query(topBooksQuery);

            // 6. 5 đơn hàng mới nhất
            const recentOrdersQuery = `
                SELECT o.id, o.total_amount, o.status, o.created_at, u.full_name, u.email
                FROM orders o
                JOIN users u ON o.user_id = u.id
                ORDER BY o.created_at DESC
                LIMIT 5
            `;
            const recentOrdersRes = await pool.query(recentOrdersQuery);

            res.status(200).json({
                revenue: parseFloat(total_revenue),
                discount: parseFloat(total_discount),
                ordersCount: parseInt(Object.values(orderStats).reduce((a, b) => a + b, 0)),
                orderStats,
                userStats,
                ragStats: {
                    total: totalBooks,
                    vectorized: vectorizedBooks
                },
                topBooks: topBooksRes.rows,
                recentOrders: recentOrdersRes.rows
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // GET /api/admin/users/:userId/activity
    static async getUserActivity(req, res) {
        try {
            const { userId } = req.params;

            // 1. Lấy thông tin cơ bản
            const userRes = await pool.query(`
                SELECT id, email, full_name, role, is_active, phone, address, created_at 
                FROM users 
                WHERE id = $1
            `, [userId]);

            if (userRes.rows.length === 0) {
                return res.status(404).json({ error: 'Không tìm thấy người dùng' });
            }
            const profile = userRes.rows[0];

            // 2. Thống kê số liệu
            const statsRes = await pool.query(`
                SELECT 
                    (SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE user_id = $1 AND status != 'CANCELLED') as total_spent,
                    (SELECT COUNT(*) FROM orders WHERE user_id = $1) as total_orders,
                    (SELECT COUNT(*) FROM reviews WHERE user_id = $1) as total_reviews,
                    (SELECT COUNT(*) FROM chat_sessions WHERE user_id = $1) as total_chats
            `, [userId]);
            const stats = statsRes.rows[0];

            // 3. Lấy lịch sử đơn hàng
            const ordersRes = await pool.query(`
                SELECT id, total_amount, status, created_at, payment_method
                FROM orders
                WHERE user_id = $1
                ORDER BY created_at DESC
            `, [userId]);

            // 4. Lấy các đánh giá viết bởi user
            const reviewsRes = await pool.query(`
                SELECT r.id, r.rating, r.comment, r.created_at, r.book_id, b.title as book_title
                FROM reviews r
                JOIN books b ON r.book_id = b.id
                WHERE r.user_id = $1
                ORDER BY r.created_at DESC
            `, [userId]);

            // 5. Lấy danh sách các cuộc trò chuyện RAG
            const chatsRes = await pool.query(`
                SELECT cs.id, cs.book_id, b.title as book_title, cs.started_at
                FROM chat_sessions cs
                JOIN books b ON cs.book_id = b.id
                WHERE cs.user_id = $1
                ORDER BY cs.started_at DESC
            `, [userId]);

            res.status(200).json({
                data: {
                    profile,
                    stats: {
                        totalSpent: parseFloat(stats.total_spent),
                        totalOrders: parseInt(stats.total_orders),
                        totalReviews: parseInt(stats.total_reviews),
                        totalChats: parseInt(stats.total_chats)
                    },
                    orders: ordersRes.rows,
                    reviews: reviewsRes.rows,
                    chats: chatsRes.rows
                }
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // GET /api/admin/chats/:sessionId/messages
    static async getChatMessages(req, res) {
        try {
            const { sessionId } = req.params;
            const messagesRes = await pool.query(`
                SELECT id, sender, content, created_at
                FROM messages
                WHERE session_id = $1
                ORDER BY created_at ASC
            `, [sessionId]);
            res.status(200).json({ data: messagesRes.rows });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = AdminController;
