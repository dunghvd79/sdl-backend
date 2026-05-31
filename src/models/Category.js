const pool = require('../config/database');

class Category {
    // Lấy tất cả danh mục kèm số lượng sách liên kết
    static async getAll() {
        const query = `
            SELECT c.*, COUNT(bc.book_id)::integer as book_count
            FROM categories c
            LEFT JOIN book_categories bc ON c.id = bc.category_id
            GROUP BY c.id
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
}

module.exports = Category;