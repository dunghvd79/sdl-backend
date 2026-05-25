const pool = require('../config/database');

class Review {
    // Thêm đánh giá mới
    static async create({ bookId, userId, rating, comment }) {
        const query = `
            INSERT INTO reviews (book_id, user_id, rating, comment)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (book_id, user_id) 
            DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment, created_at = CURRENT_TIMESTAMP
            RETURNING *
        `;
        const result = await pool.query(query, [bookId, userId, rating, comment]);
        return result.rows[0];
    }

    // Lấy tất cả đánh giá của 1 cuốn sách
    static async getByBookId(bookId) {
        const query = `
            SELECT r.*, 
                   COALESCE(up.full_name, u.email) as user_name,
                   up.avatar_url
            FROM reviews r
            JOIN users u ON r.user_id = u.id
            LEFT JOIN user_profiles up ON u.id = up.user_id
            WHERE r.book_id = $1
            ORDER BY r.created_at DESC
        `;
        const result = await pool.query(query, [bookId]);
        return result.rows;
    }

    // Tính điểm trung bình cộng số sao và tổng số đánh giá
    static async getStats(bookId) {
        const query = `
            SELECT COALESCE(AVG(rating), 0)::float as avg_rating,
                   COUNT(id)::int as review_count
            FROM reviews
            WHERE book_id = $1
        `;
        const result = await pool.query(query, [bookId]);
        return result.rows[0] || { avg_rating: 0, review_count: 0 };
    }
}

module.exports = Review;
