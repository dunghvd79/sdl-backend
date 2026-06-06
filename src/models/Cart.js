const pool = require('../config/database');

class Cart {
    // Lấy toàn bộ giỏ hàng của user (Kèm chi tiết sách bên trong)
    static async getByUserId(userId) {
        const query = `
      SELECT c.*, 
        -- Gom các món hàng lại thành mảng JSON
        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'id', ci.id,
                'bookId', ci.book_id,
                'quantity', ci.quantity,
                'priceAtAdd', ci.price_at_add,
                'book', json_build_object(
                  'id', b.id,
                  'title', b.title,
                  'author', b.author,
                  'price', b.price,
                  'cover_url', b.cover_url,
                  'stock', COALESCE(inv.available_qty - inv.reserved_qty, 10)
                )
              )
            )
            FROM cart_items ci
            LEFT JOIN books b ON ci.book_id = b.id
            LEFT JOIN inventory inv ON ci.book_id = inv.book_id
            WHERE ci.cart_id = c.id
          ), '[]'::json
        ) as items
      FROM carts c
      WHERE c.user_id = $1
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

    // Xóa một số quyển sách được chọn khỏi giỏ
    static async removeItems(cartId, bookIds, client = null) {
        if (!bookIds || bookIds.length === 0) return;
        const intBookIds = bookIds.map(id => parseInt(id)).filter(id => !isNaN(id));
        if (intBookIds.length === 0) return;
        const query = 'DELETE FROM cart_items WHERE cart_id = $1 AND book_id = ANY($2::int[])';
        const executor = client || pool;
        await executor.query(query, [cartId, intBookIds]);
    }
}

module.exports = Cart;