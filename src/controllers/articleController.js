const Article = require('../models/Article');

class ArticleController {
    // GET /api/articles
    static async getAllArticles(req, res) {
        try {
            const limit = parseInt(req.query.limit) || 10;
            const page = parseInt(req.query.page) || 1;
            const offset = (page - 1) * limit;
            const search = req.query.search || '';
            const category = req.query.category || '';
            const status = req.query.status || '';
            const adminMode = req.query.adminMode === 'true';

            const articles = await Article.getAll({ limit, offset, search, category, status, adminMode });

            res.status(200).json({
                message: 'Lấy danh sách bài viết thành công',
                data: articles,
                pagination: { page, limit, total_in_page: articles.length }
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }

    // GET /api/articles/:id
    static async getArticle(req, res) {
        try {
            const { id } = req.params;
            const article = await Article.findById(id);
            if (!article) {
                return res.status(404).json({ error: 'Không tìm thấy bài viết này!' });
            }
            res.status(200).json({ data: article });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }

    // POST /api/articles (Chỉ Admin/Curator)
    static async createArticle(req, res) {
        try {
            const { title, summary, content, cover_url, category, reading_time, status } = req.body;

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
                status: status || 'PUBLISHED'
            });

            res.status(201).json({
                message: 'Tạo bài viết thành công!',
                data: article
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }

    // PUT /api/articles/:id (Chỉ Admin/Curator)
    static async updateArticle(req, res) {
        try {
            const { id } = req.params;
            const { title, summary, content, cover_url, category, reading_time, status } = req.body;

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
                status
            });

            if (!article) {
                return res.status(404).json({ error: 'Không tìm thấy bài viết!' });
            }

            res.status(200).json({
                message: 'Cập nhật bài viết thành công!',
                data: article
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }

    // DELETE /api/articles/:id (Chỉ Admin)
    static async deleteArticle(req, res) {
        try {
            const { id } = req.params;
            const success = await Article.delete(id);
            if (!success) {
                return res.status(404).json({ error: 'Không tìm thấy bài viết!' });
            }
            res.status(200).json({ message: `Đã xóa bài viết ID=${id} thành công!` });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }
}

module.exports = ArticleController;
