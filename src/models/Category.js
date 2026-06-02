const pool = require('../config/database');

class Category {
    // Lấy tất cả danh mục kèm số lượng sách liên kết (sử dụng subquery để tránh lỗi GROUP BY trên các phiên bản SQL khác nhau)
    static async getAll() {
        const query = `
            SELECT c.*, COALESCE(sub.book_count, 0)::integer as book_count
            FROM categories c
            LEFT JOIN (
                SELECT category_id, COUNT(book_id) as book_count
                FROM book_categories
                GROUP BY category_id
            ) sub ON c.id = sub.category_id
            ORDER BY c.name ASC
        `;
        const result = await pool.query(query);
        return result.rows;
    }

    // Lấy chi tiết 1 danh mục
    static async findById(id) {
        const query = 'SELECT * FROM categories WHERE id = $1';
        const result = await pool.query(query, [id]);
        return result.rows[0] || null;
    }

    // Thêm danh mục mới (Chỉ Admin)
    static async create({ name, description }) {
        const query = `
      INSERT INTO categories (name, description)
      VALUES ($1, $2)
      RETURNING *
    `;
        const result = await pool.query(query, [name, description]);
        return result.rows[0];
    }

    // Cập nhật danh mục
    static async update(id, { name, description }) {
        const query = `
      UPDATE categories
      SET name = $1, description = $2
      WHERE id = $3
      RETURNING *
    `;
        const result = await pool.query(query, [name, description || null, id]);
        return result.rows[0] || null;
    }

    // Xóa danh mục
    static async delete(id) {
        const query = 'DELETE FROM categories WHERE id = $1 RETURNING id';
        const result = await pool.query(query, [id]);
        return result.rows[0];
    }

    // Lấy danh sách tất cả các sách thuộc thể loại này
    static async getBooks(categoryId) {
        const query = `
            SELECT b.id, b.title, b.author, b.price, b.cover_url 
            FROM books b
            JOIN book_categories bc ON b.id = bc.book_id
            WHERE bc.category_id = $1
            ORDER BY b.title ASC
        `;
        const result = await pool.query(query, [categoryId]);
        return result.rows;
    }

    // Gán danh sách sách vào thể loại này (chèn liên kết mới)
    static async assignBooks(categoryId, bookIds) {
        if (!Array.isArray(bookIds) || bookIds.length === 0) return [];
        
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const inserted = [];
            for (const bookId of bookIds) {
                const res = await client.query(`
                    INSERT INTO book_categories (book_id, category_id)
                    VALUES ($1, $2)
                    ON CONFLICT DO NOTHING
                    RETURNING book_id, category_id
                `, [bookId, categoryId]);
                if (res.rows[0]) inserted.push(res.rows[0]);
            }
            await client.query('COMMIT');
            return inserted;
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

    // Gỡ sách khỏi thể loại này
    static async removeBook(categoryId, bookId) {
        const query = `
            DELETE FROM book_categories 
            WHERE category_id = $1 AND book_id = $2
            RETURNING book_id, category_id
        `;
        const result = await pool.query(query, [categoryId, bookId]);
        return result.rows[0] || null;
    }
}

module.exports = Category;