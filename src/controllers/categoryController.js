// ==========================================
// FILE 3: src/controllers/categoryController.js
// ==========================================
const Category = require('../models/Category');
const { getCache, setCache, delCache, clearCachePattern } = require('../config/redis');

class CategoryController {
    // GET /api/categories
    static async getAllCategories(req, res) {
        try {
            const cacheKey = 'categories:all';
            const cachedData = await getCache(cacheKey);
            if (cachedData) {
                return res.status(200).json({ data: cachedData });
            }

            const categories = await Category.getAll();
            await setCache(cacheKey, categories, 3600);

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

            // Invalidate cache
            await delCache('categories:all');

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

            // Invalidate cache
            await delCache('categories:all');
            await clearCachePattern('books:*');

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

            // Invalidate cache
            await delCache('categories:all');
            await clearCachePattern('books:*');

            res.status(200).json({ message: `Đã xóa danh mục ID=${id} thành công` });
        } catch (err) {
            // Nếu danh mục đang có sách thuộc về nó thì sẽ tự động xóa liên kết (CASCADE)
            res.status(500).json({ error: err.message });
        }
    }

    // GET /api/categories/:id/books (Chỉ Admin/Curator)
    static async getCategoryBooks(req, res) {
        try {
            const { id } = req.params;
            const category = await Category.findById(id);
            if (!category) return res.status(404).json({ error: 'Không tìm thấy danh mục' });

            const books = await Category.getBooks(id);
            res.status(200).json({ data: { category, books } });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }

    // POST /api/categories/:id/books (Chỉ Admin/Curator)
    static async assignBooksToCategory(req, res) {
        try {
            const { id } = req.params;
            const { bookIds } = req.body;
            if (!Array.isArray(bookIds)) {
                return res.status(400).json({ error: 'Dữ liệu bookIds không hợp lệ, phải là một mảng' });
            }

            const category = await Category.findById(id);
            if (!category) return res.status(404).json({ error: 'Không tìm thấy danh mục' });

            const assigned = await Category.assignBooks(id, bookIds);

            // Invalidate book caches because association changed
            await clearCachePattern('books:*');

            res.status(200).json({ message: 'Gán sách vào danh mục thành công', data: assigned });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }

    // DELETE /api/categories/:id/books/:bookId (Chỉ Admin/Curator)
    static async removeBookFromCategory(req, res) {
        try {
            const { id, bookId } = req.params;

            const category = await Category.findById(id);
            if (!category) return res.status(404).json({ error: 'Không tìm thấy danh mục' });

            const removed = await Category.removeBook(id, bookId);
            if (!removed) {
                return res.status(404).json({ error: 'Sách không thuộc danh mục này' });
            }

            // Invalidate book caches
            await clearCachePattern('books:*');

            res.status(200).json({ message: 'Gỡ sách khỏi danh mục thành công' });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }
}

module.exports = CategoryController;