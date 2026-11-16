const Article = require('../models/Article');
const { encodeArticleId } = require('../utils/hashids');
const { staffAccess, sendTokenExpired } = require('../middleware/auth');

// Chế độ nhân viên cho trang công khai (B52): chỉ bật khi người gọi là nhân viên đã xác thực.
// Trả null nếu đã gửi phản hồi 401 (token nhân viên hết hạn), ngược lại trả true/false.
function resolveStaffView(req, res, wantsStaffView) {
    const access = staffAccess(req);
    if (wantsStaffView && access === 'expired') {
        sendTokenExpired(res);
        return null;
    }
    return access === 'staff';
}

class ArticleController {
    // GET /api/articles
    static async getAllArticles(req, res, next) {
        try {
            const limit = parseInt(req.query.limit) || 10;
            const page = parseInt(req.query.page) || 1;
            const offset = (page - 1) * limit;
            const search = req.query.search || '';
            const category = req.query.category || '';
            const requestedStatus = req.query.status || '';

            // Khách chỉ thấy bài đã xuất bản: bỏ qua cả ?adminMode=true lẫn ?status=DRAFT/HIDDEN (B52)
            const wantsStaffView = req.query.adminMode === 'true' || (requestedStatus !== '' && requestedStatus !== 'PUBLISHED');
            const staff = resolveStaffView(req, res, wantsStaffView);
            if (staff === null) return;
            const adminMode = staff && req.query.adminMode === 'true';
            const status = staff ? requestedStatus : '';

            const articles = await Article.getAll({ limit, offset, search, category, status, adminMode });

            res.status(200).json({
                message: 'Lấy danh sách bài viết thành công',
                data: articles.map(a => ({ ...a, hashId: encodeArticleId(a.id) })),
                pagination: { page, limit, total_in_page: articles.length }
            });
        } catch (err) {
            next(err);
        }
    }

    // GET /api/articles/:id
    static async getArticle(req, res, next) {
        try {
            const { id } = req.params;
            const article = await Article.findById(id);
            if (!article) {
                return res.status(404).json({ error: 'Không tìm thấy bài viết này!' });
            }
            // Bài nháp / đã ẩn: chỉ nhân viên xem được (B52)
            if (article.status !== 'PUBLISHED') {
                const staff = resolveStaffView(req, res, true);
                if (staff === null) return;
                if (!staff) return res.status(404).json({ error: 'Không tìm thấy bài viết này!' });
            }
            res.status(200).json({ data: article ? { ...article, hashId: encodeArticleId(article.id) } : null });
        } catch (err) {
            next(err);
        }
    }

    // POST /api/articles (Chỉ Admin/Curator)
    static async createArticle(req, res, next) {
        try {
            const { title, summary, content, cover_url, category, reading_time, status, is_featured } = req.body;

            if (!title || !title.trim()) {
                return res.status(400).json({ error: 'Tiêu đề không được để trống!' });
            }
            if (!content || !content.trim()) {
                return res.status(400).json({ error: 'Nội dung không được để trống!' });
            }

            const article = await Article.create({
                title,
                summary,
                content,
                cover_url,
                category: category || 'Chiêm nghiệm',
                reading_time: reading_time || '5 phút đọc',
                status: status || 'PUBLISHED',
                is_featured: is_featured === true || is_featured === 'true'
            });

            res.status(201).json({
                message: 'Tạo bài viết thành công!',
                data: article ? { ...article, hashId: encodeArticleId(article.id) } : null
            });
        } catch (err) {
            next(err);
        }
    }

    // PUT /api/articles/:id (Chỉ Admin/Curator)
    static async updateArticle(req, res, next) {
        try {
            const { id } = req.params;
            const { title, summary, content, cover_url, category, reading_time, status, is_featured } = req.body;

            if (!title || !title.trim()) {
                return res.status(400).json({ error: 'Tiêu đề không được để trống!' });
            }
            if (!content || !content.trim()) {
                return res.status(400).json({ error: 'Nội dung không được để trống!' });
            }

            const article = await Article.update(id, {
                title,
                summary,
                content,
                cover_url,
                category,
                reading_time,
                status,
                is_featured: is_featured === true || is_featured === 'true'
            });

            if (!article) {
                return res.status(404).json({ error: 'Không tìm thấy bài viết!' });
            }

            res.status(200).json({
                message: 'Cập nhật bài viết thành công!',
                data: article ? { ...article, hashId: encodeArticleId(article.id) } : null
            });
        } catch (err) {
            next(err);
        }
    }

    // DELETE /api/articles/:id (Chỉ Admin)
    static async deleteArticle(req, res, next) {
        try {
            const { id } = req.params;
            const success = await Article.delete(id);
            if (!success) {
                return res.status(404).json({ error: 'Không tìm thấy bài viết!' });
            }
            res.status(200).json({ message: `Đã xóa bài viết ID=${id} thành công!` });
        } catch (err) {
            next(err);
        }
    }

    // GET /api/articles/categories
    static async getUniqueCategories(req, res, next) {
        try {
            const wantsAdminMode = req.query.adminMode === 'true';
            const staff = resolveStaffView(req, res, wantsAdminMode);
            if (staff === null) return;
            const categories = await Article.getUniqueCategories(wantsAdminMode && staff);   // B52
            res.status(200).json({ data: categories });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = ArticleController;
