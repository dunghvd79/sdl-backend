const Review = require('../models/Review');

class ReviewController {
    // GET /api/books/:id/reviews
    static async getReviews(req, res, next) {
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
            next(err);
        }
    }

    // POST /api/books/:id/reviews (Yêu cầu đăng nhập)
    static async createReview(req, res, next) {
        try {
            const { id } = req.params; // book_id
            const userId = req.user.id;
            const { rating, comment } = req.body;

            const ratingVal = parseInt(rating); // 1–5 sao, nhận xét ≥ 10 ký tự: lược đồ `schemas.review.create` (B36)

            // Kiểm tra quyền mua hàng (bỏ qua cho ADMIN và CURATOR)
            const isEmployee = req.user.role === 'ADMIN' || req.user.role === 'CURATOR';
            if (!isEmployee) {
                const purchased = await Review.hasPurchased(userId, id);
                if (!purchased) {
                    return res.status(403).json({ error: 'Bạn chỉ có thể đánh giá cuốn sách này sau khi đã mua và nhận giao hàng thành công!' });
                }
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
            next(err);
        }
    }
}

module.exports = ReviewController;
