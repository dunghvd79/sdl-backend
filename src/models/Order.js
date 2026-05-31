const pool = require('../config/database');

class Order {
    // 1. Tạo đơn hàng mới (Chỉ tạo tờ hóa đơn tổng)
    static async create(client, userId, totalAmount, shippingName, shippingPhone, shippingAddress, shippingNotes, paymentMethod = 'ONLINE', couponId = null, discountAmount = 0) {
        const query = `
      INSERT INTO orders (user_id, total_amount, status, shipping_name, shipping_phone, shipping_address, shipping_notes, payment_method, coupon_id, discount_amount, created_at, updated_at)
      VALUES ($1, $2, 'PENDING', $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *
    `;
        const params = [userId, totalAmount, shippingName, shippingPhone, shippingAddress, shippingNotes, paymentMethod, couponId, discountAmount];
        const result = client ? await client.query(query, params) : await pool.query(query, params);
        return result.rows[0];
    }

    // 2. Thêm từng món hàng vào hóa đơn
    static async addItem(client, orderId, bookId, quantity, price) {
        const query = `
      INSERT INTO order_items (order_id, book_id, quantity, price)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
        const params = [orderId, bookId, quantity, price];
        const result = client ? await client.query(query, params) : await pool.query(query, params);
        return result.rows[0];
    }

    // 3. Lấy toàn bộ đơn hàng của 1 User (Lịch sử mua hàng)
    static async getUserOrders(userId) {
        const query = `
      SELECT o.*,
        -- Gom các món hàng trong đơn thành mảng JSON để Frontend dễ đọc
        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'id', oi.id,
                'bookId', oi.book_id,
                'quantity', oi.quantity,
                'price', oi.price,
                'bookTitle', b.title,
                'cover_url', b.cover_url
              )
            )
            FROM order_items oi
            LEFT JOIN books b ON oi.book_id = b.id
            WHERE oi.order_id = o.id
          ), '[]'::json
        ) as items
      FROM orders o
      WHERE o.user_id = $1
      ORDER BY o.created_at DESC
    `;
        const result = await pool.query(query, [userId]);
        return result.rows;
    }

    // 4. Lấy chi tiết 1 đơn hàng cụ thể
    static async findById(orderId) {
        const query = `
      SELECT o.*, u.full_name, u.email, c.code as coupon_code,
        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'bookId', oi.book_id,
                'quantity', oi.quantity,
                'price', oi.price,
                'bookTitle', b.title,
                'bookAuthor', b.author,
                'cover_url', b.cover_url
              )
            )
            FROM order_items oi
            LEFT JOIN books b ON oi.book_id = b.id
            WHERE oi.order_id = o.id
          ), '[]'::json
        ) as items
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      LEFT JOIN coupons c ON o.coupon_id = c.id
      WHERE o.id = $1
    `;
        const result = await pool.query(query, [orderId]);
        return result.rows[0] || null;
    }

    // 5. Cập nhật trạng thái đơn hàng (Dành cho Admin/Webhook thanh toán)
    static async updateStatus(orderId, status) {
        const query = `
      UPDATE orders 
      SET status = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;
        const result = await pool.query(query, [orderId, status]);
        return result.rows[0];
    }
}

module.exports = Order;