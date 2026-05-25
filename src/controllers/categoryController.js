// ==========================================
// FILE 3: src/controllers/categoryController.js
// ==========================================
const Category = require('../models/Category');

class CategoryController {
    // GET /api/categories
    static async getAllCategories(req, res) {
        try {
            const categories = await Category.getAll();
            res.status(200).json({ data: categories });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }

    // POST /api/categories (Chỉ Admin/Curator)
    static async createCategory(req, res) {
        try {
            const { name, description } = req.body;
            if (!name) return res.status(400).json({ error: 'Tên danh mục không được để trống' });

            const category = await Category.create({ name, description });
            res.status(201).json({ message: 'Tạo danh mục thành công', data: category });
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    }

    // PUT /api/categories/:id (Chỉ Admin/Curator)
    static async updateCategory(req, res) {
        try {
            const { id } = req.params;
            const { name, description } = req.body;
            if (!name) return res.status(400).json({ error: 'Tên danh mục không được để trống' });

            const category = await Category.update(id, { name, description });
            if (!category) return res.status(404).json({ error: 'Không tìm thấy danh mục' });

            res.status(200).json({ message: 'Cập nhật danh mục thành công', data: category });
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    }

    // DELETE /api/categories/:id (Chỉ Admin)
    static async deleteCategory(req, res) {
        try {
            const { id } = req.params;
            const deleted = await Category.delete(id);
            if (!deleted) return res.status(404).json({ error: 'Không tìm thấy danh mục' });

            res.status(200).json({ message: `Đã xóa danh mục ID=${id} thành công` });
        } catch (err) {
            // Nếu danh mục đang có sách thuộc về nó thì sẽ tự động xóa liên kết (CASCADE)
            res.status(500).json({ error: err.message });
        }
    }
}

module.exports = CategoryController;