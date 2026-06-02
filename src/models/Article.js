const pool = require('../config/database');

class Article {
    // 1. Thêm bài viết mới
    static async create(articleData) {
        const { title, summary, content, cover_url, category = 'Chiêm nghiệm', reading_time = '5 phút đọc', status = 'PUBLISHED', is_featured = false } = articleData;

        const query = `
            INSERT INTO articles (title, summary, content, cover_url, category, reading_time, status, is_featured)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `;
        const result = await pool.query(query, [title, summary, content, cover_url || null, category, reading_time, status, is_featured]);
        return result.rows[0];
    }

    // 2. Lấy chi tiết bài viết theo ID
    static async findById(id) {
        const query = 'SELECT * FROM articles WHERE id = $1';
        const result = await pool.query(query, [id]);
        return result.rows[0] || null;
    }

    // 3. Lấy danh sách bài viết
    static async getAll({ limit = 10, offset = 0, search = '', category = '', status = '', adminMode = false }) {
        let query = 'SELECT * FROM articles';
        const params = [];
        const whereConditions = [];

        // Tìm kiếm theo từ khóa tiêu đề hoặc tóm tắt
        if (search) {
            params.push(`%${search}%`);
            whereConditions.push(`(title ILIKE $${params.length} OR summary ILIKE $${params.length})`);
        }

        // Lọc theo thể loại
        if (category) {
            params.push(category);
            whereConditions.push(`category = $${params.length}`);
        }

        // Lọc theo trạng thái
        if (status) {
            params.push(status);
            whereConditions.push(`status = $${params.length}`);
        } else if (!adminMode) {
            // Khách hàng vãng lai chỉ xem được bài viết PUBLISHED
            whereConditions.push(`status = 'PUBLISHED'`);
        }

        if (whereConditions.length > 0) {
            query += ` WHERE ${whereConditions.join(' AND ')}`;
        }

        // Sắp xếp bài viết: bài viết được ghim lên đầu trang, sau đó theo thời gian giảm dần
        query += ' ORDER BY is_featured DESC, created_at DESC';

        // Phân trang
        params.push(limit, offset);
        query += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

        const result = await pool.query(query, params);
        return result.rows;
    }

    // 4. Cập nhật bài viết
    static async update(id, articleData) {
        const { title, summary, content, cover_url, category, reading_time, status, is_featured } = articleData;

        const query = `
            UPDATE articles
            SET title = $1, summary = $2, content = $3, cover_url = $4, category = $5, reading_time = $6, status = $7, is_featured = $8
            WHERE id = $9
            RETURNING *
        `;
        const result = await pool.query(query, [title, summary, content, cover_url || null, category, reading_time, status, is_featured !== undefined ? is_featured : false, id]);
        return result.rows[0] || null;
    }

    // 5. Xóa bài viết
    static async delete(id) {
        const query = 'DELETE FROM articles WHERE id = $1 RETURNING id';
        const result = await pool.query(query, [id]);
        return result.rowCount > 0;
    }

    // 6. Lấy danh sách chuyên mục duy nhất
    static async getUniqueCategories(adminMode = false) {
        let query = 'SELECT DISTINCT category FROM articles';
        if (!adminMode) {
            query += " WHERE status = 'PUBLISHED'";
        }
        query += ' ORDER BY category ASC';
        const result = await pool.query(query);
        return result.rows.map(r => r.category).filter(Boolean);
    }
}

module.exports = Article;
