// ==========================================
// FILE 2: src/controllers/bookController.js
// ==========================================
const BookService = require('../services/bookService');

function validateBookInput(data) {
    const { title, author, isbn, description, price, status } = data;

    if (!title || typeof title !== 'string' || !title.trim()) {
        return 'Tên sách không được để trống!';
    }
    if (title.length > 255) {
        return 'Tên sách quá dài! Vui lòng nhập tối đa 255 ký tự.';
    }

    if (!author || typeof author !== 'string' || !author.trim()) {
        return 'Tác giả không được để trống!';
    }
    if (author.length > 255) {
        return 'Tên tác giả quá dài! Vui lòng nhập tối đa 255 ký tự.';
    }

    if (price === undefined || price === null || price === '') {
        return 'Giá bán không được để trống!';
    }
    const numPrice = Number(price);
    if (isNaN(numPrice)) {
        return 'Giá bán phải là số hợp lệ!';
    }
    if (numPrice < 0) {
        return 'Giá bán không hợp lệ! Giá sách phải từ 0 đ trở lên.';
    }
    if (numPrice > 99999999.99) {
        return 'Giá bán vượt quá giới hạn hệ thống (Tối đa 99.999.999,99 đ)!';
    }

    if (isbn) {
        if (typeof isbn !== 'string') {
            return 'Mã ISBN không hợp lệ!';
        }
        if (isbn.length > 50) {
            return 'Mã ISBN quá dài! Vui lòng nhập tối đa 50 ký tự.';
        }
        const isbnRegex = /^[0-9\-]+$/;
        if (!isbnRegex.test(isbn)) {
            return 'Mã ISBN không hợp lệ! Vui lòng chỉ nhập số và dấu gạch ngang.';
        }
    }

    if (description && description.length > 5000) {
        return 'Mô tả sách quá dài! Vui lòng rút gọn dưới 5000 ký tự.';
    }

    if (status) {
        const validStatuses = ['DRAFT', 'PUBLISHED', 'HIDDEN'];
        if (!validStatuses.includes(status)) {
            return 'Trạng thái sách không hợp lệ! Chỉ cho phép: Công khai (PUBLISHED), Bản nháp (DRAFT), hoặc Tạm ẩn (HIDDEN).';
        }
    }

    return null;
}

function handleDatabaseError(err) {
    const msg = err.message || '';
    if (msg.includes('numeric field overflow')) {
        return 'Giá bán vượt quá giới hạn hệ thống (Tối đa 99.999.999,99 đ)!';
    }
    if (msg.includes('value too long for type character varying')) {
        if (msg.includes('(255)')) {
            return 'Dữ liệu nhập vào quá dài (Tối đa 255 ký tự)!';
        }
        if (msg.includes('(50)')) {
            return 'Mã ISBN quá dài (Tối đa 50 ký tự)!';
        }
        if (msg.includes('(500)')) {
            return 'Đường dẫn ảnh bìa quá dài (Tối đa 500 ký tự)!';
        }
        return 'Dữ liệu nhập vào vượt quá giới hạn độ dài của hệ thống!';
    }
    if (msg.includes('violates check constraint "books_status_check"')) {
        return 'Trạng thái sách không hợp lệ! Chỉ cho phép: DRAFT, PUBLISHED, HIDDEN.';
    }
    return msg;
}

class BookController {
    // GET /api/books
    static async getAllBooks(req, res) {
        try {
            // Lấy tham số từ URL (VD: ?limit=10&page=1&search=harry&categoryId=1&sortBy=price_asc&maxPrice=150000)
            const limit = parseInt(req.query.limit) || 10;
            const page = parseInt(req.query.page) || 1;
            const offset = (page - 1) * limit;
            const search = req.query.search || '';
            const categoryId = req.query.categoryId || null;
            const sortBy = req.query.sortBy || 'newest';
            const maxPrice = req.query.maxPrice ? parseFloat(req.query.maxPrice) : null;
            // Admin mode: lấy cả sách ẩn và bản nháp (khi có query adminMode=true)
            const adminMode = req.query.adminMode === 'true';
            const isFeatured = req.query.isFeatured;

            const books = await BookService.getBooks({ limit, offset, search, categoryId, sortBy, maxPrice, adminMode, isFeatured });

            res.status(200).json({
                message: 'Lấy danh sách thành công',
                data: books,
                pagination: { page, limit, total_in_page: books.length }
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }

    // POST /api/books (Chỉ Admin/Curator)
    static async createBook(req, res) {
        try {
            const { title, author, isbn, description, price, categories, cover_url, status, is_featured, is_bestseller, display_order, images } = req.body;

            const validationError = validateBookInput({ title, author, isbn, description, price, status });
            if (validationError) {
                return res.status(400).json({ error: validationError });
            }

            // Tạo sách và truyền mảng ID danh mục cùng ảnh chi tiết phụ (nếu có)
            const book = await BookService.createBook(
                { title, author, isbn, description, price: Number(price), cover_url, status: status || 'PUBLISHED', is_featured: !!is_featured, is_bestseller: !!is_bestseller, display_order: parseInt(display_order) || 0 },
                categories,
                images
            );

            res.status(201).json({
                message: 'Thêm sách thành công!',
                data: book
            });
        } catch (err) {
            res.status(400).json({ error: handleDatabaseError(err) });
        }
    }

    // GET /api/books/:id
    static async getBook(req, res) {
        try {
            const { id } = req.params;
            const book = await BookService.getBookDetails(id);
            if (!book) {
                return res.status(404).json({ error: 'Không tìm thấy cuốn sách này' });
            }
            res.status(200).json({ data: book });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }

    // PUT /api/books/:id (Chỉ Admin/Curator)
    static async updateBook(req, res) {
        try {
            const { id } = req.params;
            const { title, author, isbn, description, price, categories, cover_url, status, is_featured, is_bestseller, display_order, images } = req.body;

            const validationError = validateBookInput({ title, author, isbn, description, price, status });
            if (validationError) {
                return res.status(400).json({ error: validationError });
            }

            const pool = require('../config/database');
            const query = `
                UPDATE books
                SET title = $1, author = $2, isbn = $3, description = $4, price = $5, cover_url = $6, status = $7, is_featured = $8, is_bestseller = $9, display_order = $10
                WHERE id = $11
                RETURNING *
            `;
            const result = await pool.query(query, [title, author, isbn || null, description || null, Number(price), cover_url || null, status || 'PUBLISHED', !!is_featured, !!is_bestseller, parseInt(display_order) || 0, id]);

            if (result.rowCount === 0) {
                return res.status(404).json({ error: 'Không tìm thấy cuốn sách này!' });
            }

            // Cập nhật thể loại
            if (Array.isArray(categories)) {
                // Xóa thể loại cũ
                await pool.query('DELETE FROM book_categories WHERE book_id = $1', [id]);
                // Thêm thể loại mới
                for (const categoryId of categories) {
                    await pool.query(
                        'INSERT INTO book_categories (book_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                        [id, categoryId]
                    );
                }
            }

            // Cập nhật ảnh chi tiết phụ
            if (Array.isArray(images)) {
                // Xóa ảnh cũ
                await pool.query('DELETE FROM book_images WHERE book_id = $1', [id]);
                // Thêm ảnh mới
                for (const img of images) {
                    if (img.image_url) {
                        await pool.query(
                            'INSERT INTO book_images (book_id, image_url, display_order) VALUES ($1, $2, $3)',
                            [id, img.image_url, parseInt(img.display_order) || 0]
                        );
                    }
                }
            }

            res.status(200).json({
                message: 'Cập nhật sách thành công!',
                data: result.rows[0]
            });
        } catch (err) {
            res.status(500).json({ error: handleDatabaseError(err) });
        }
    }

    // DELETE /api/books/:id (Chỉ Admin)
    static async deleteBook(req, res) {
        try {
            const { id } = req.params;
            const pool = require('../config/database');
            const result = await pool.query('DELETE FROM books WHERE id = $1 RETURNING id', [id]);

            if (result.rowCount === 0) {
                return res.status(404).json({ error: 'Không tìm thấy cuốn sách này!' });
            }

            res.status(200).json({ message: `Đã xóa sách ID=${id} thành công!` });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }
}

module.exports = BookController;
