const pool = require('../config/database');

class Cart {
    // Lấy toàn bộ giỏ hàng của user (Kèm chi tiết sách bên trong)
    static async getByUserId(userId) {
        const query = `
      SELECT c.*, 
        -- Gom các món hàng lại thành mảng JSON
        COALESCE(
          json_agg(
            json_build_object(
              'id', ci.id,
              'bookId', ci.book_id,
              'quantity', ci.quantity,
              'priceAtAdd', ci.price_at_add,
              'book', json_build_object(
                'id', b.id,
                'title', b.title,
                'author', b.author,
                'price', b.price
              )
            )
          ) FILTER (WHERE ci.id IS NOT NULL), '[]'
        ) as items
      FROM carts c
      LEFT JOIN cart_items ci ON c.id = ci.cart_id
      LEFT JOIN books b ON ci.book_id = b.id
      WHERE c.user_id = $1
      GROUP BY c.id
    `;

        const result = await pool.query(query, [userId]);
        return result.rows[0] || null;
    }

    // Tạo giỏ hàng mới cho user
    static async createForUser(userId) {
        const query = 'INSERT INTO carts (user_id) VALUES ($1) RETURNING *';
        const result = await pool.query(query, [userId]);
        return result.rows[0];
    }

    // Thêm sách vào giỏ
    static async addItem(cartId, bookId, quantity, price) {
        const query = `
      INSERT INTO cart_items (cart_id, book_id, quantity, price_at_add)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (cart_id, book_id) 
      DO UPDATE SET quantity = cart_items.quantity + $3 -- Nếu sách đã có trong giỏ, chỉ cộng dồn số lượng
      RETURNING *
    `;
        const result = await pool.query(query, [cartId, bookId, quantity, price]);
        return result.rows[0];
    }

    // Bỏ 1 cuốn sách khỏi giỏ
    static async removeItem(cartId, bookId) {
        const query = 'DELETE FROM cart_items WHERE cart_id = $1 AND book_id = $2';
        await pool.query(query, [cartId, bookId]);
    }

    // Dọn sạch toàn bộ giỏ hàng (Sau khi đã tạo đơn xong)
    static async clear(cartId) {
        const query = 'DELETE FROM cart_items WHERE cart_id = $1';
        await pool.query(query, [cartId]);
    }
}

module.exports = Cart;