const pool = require('../config/database');

class Category {
    // Lấy tất cả danh mục
    static async getAll() {
        const query = 'SELECT * FROM categories ORDER BY name ASC';
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