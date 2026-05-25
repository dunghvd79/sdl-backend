const pool = require('../config/database');

class WishlistController {
    // POST /api/wishlists/toggle
    static async toggle(req, res) {
        try {
            const { bookId } = req.body;
            const userId = req.user.id;

            if (!bookId) {
                return res.status(400).json({ error: 'Mã sách (bookId) không được để trống!' });
            }

            // 1. Kiểm tra xem sách có tồn tại không
            const bookCheck = await pool.query('SELECT id FROM books WHERE id = $1', [bookId]);
            if (bookCheck.rows.length === 0) {
                return res.status(404).json({ error: 'Không tìm thấy sách!' });
            }

            // 2. Kiểm tra xem đã thả tim chưa
            const checkRes = await pool.query(
                'SELECT id FROM wishlists WHERE user_id = $1 AND book_id = $2',
                [userId, bookId]
            );

            let isLiked = false;
            if (checkRes.rows.length > 0) {
                // Đã có -> Xóa đi (Unlike)
                await pool.query(
                    'DELETE FROM wishlists WHERE user_id = $1 AND book_id = $2',
                    [userId, bookId]
                );
                isLiked = false;
            } else {
                // Chưa có -> Thêm mới (Like)
                await pool.query(
                    'INSERT INTO wishlists (user_id, book_id) VALUES ($1, $2)',
                    [userId, bookId]
                );
                isLiked = true;
            }

            res.status(200).json({
                message: isLiked ? 'Đã thêm vào danh sách yêu thích!' : 'Đã xóa khỏi danh sách yêu thích!',
                data: { isLiked }
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // GET /api/wishlists
    static async getMyWishlist(req, res) {
        try {
            const userId = req.user.id;

            const result = await pool.query(`
                SELECT b.id, b.title, b.author, b.description, b.price, b.cover_url, b.status, b.rag_indexed_at, w.created_at as liked_at
                FROM wishlists w
                JOIN books b ON w.book_id = b.id
                WHERE w.user_id = $1
                ORDER BY w.created_at DESC
            `, [userId]);

            res.status(200).json({ data: result.rows });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // GET /api/wishlists/admin/stats (Chỉ dành cho ADMIN/CURATOR)
    static async getWishlistStats(req, res) {
        try {
            const result = await pool.query(`
                SELECT b.id, b.title, b.author, b.cover_url, COUNT(w.id) as like_count
                FROM books b
                LEFT JOIN wishlists w ON b.id = w.book_id
                GROUP BY b.id, b.title, b.author, b.cover_url
                ORDER BY like_count DESC
                LIMIT 20
            `);

            res.status(200).json({ data: result.rows });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = WishlistController;
