const Review = require('../models/Review');

class ReviewController {
    // GET /api/books/:id/reviews
    static async getReviews(req, res) {
        try {
            const { id } = req.params; // book_id
            
            const stats = await Review.getStats(id);
            const reviews = await Review.getByBookId(id);

            res.status(200).json({
                message: 'Lấy danh sách đánh giá thành công',
                data: {
                    stats,
                    reviews
                }
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }

    // POST /api/books/:id/reviews (Yêu cầu đăng nhập)
    static async createReview(req, res) {
        try {
            const { id } = req.params; // book_id
            const userId = req.user.id;
            const { rating, comment } = req.body;

            const ratingVal = parseInt(rating);
            if (isNaN(ratingVal) || ratingVal < 1 || ratingVal > 5) {
                return res.status(400).json({ error: 'Đánh giá phải từ 1 đến 5 sao!' });
            }

            const review = await Review.create({
                bookId: id,
                userId,
                rating: ratingVal,
                comment: comment || ''
            });

            res.status(201).json({
                message: 'Gửi đánh giá thành công!',
                data: review
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }
}

module.exports = ReviewController;
