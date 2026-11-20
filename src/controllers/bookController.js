// ==========================================
// FILE 2: src/controllers/bookController.js
// ==========================================
const BookService = require('../services/bookService');
const { encodeBookId } = require('../utils/hashids');
const { getCache, setCache, clearCachePattern } = require('../config/redis');
const { staffAccess, sendTokenExpired } = require('../middleware/auth');

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
    // Mã danh mục không tồn tại (B77: cả lần tạo / sửa đã ROLLBACK)
    if (err.code === '23503' && err.constraint === 'book_categories_category_id_fkey') {
        return 'Danh mục không tồn tại!';
    }
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
    // Lỗi không nhận diện được: KHÔNG trả nguyên văn (spec 001) — để errorHandler che đi
    return null;
}

class BookController {
    // GET /api/books
    static async getAllBooks(req, res, next) {
        try {
            // Lấy tham số từ URL (VD: ?limit=10&page=1&search=harry&categoryId=1&sortBy=price_asc&maxPrice=150000)
            const limit = parseInt(req.query.limit) || 10;
            const page = parseInt(req.query.page) || 1;
            const offset = (page - 1) * limit;
            const search = req.query.search || '';
            const categoryId = req.query.categoryId || null;
            const sortBy = req.query.sortBy || 'newest';
            const maxPrice = req.query.maxPrice ? parseFloat(req.query.maxPrice) : null;
            // Admin mode: lấy cả sách ẩn và bản nháp — CHỈ khi người gọi là nhân viên đã xác thực (B52).
            // Khách gửi ?adminMode=true thì bị bỏ qua (vẫn chỉ thấy sách đã xuất bản).
            const wantsAdminMode = req.query.adminMode === 'true';
            const access = staffAccess(req);
            if (wantsAdminMode && access === 'expired') return sendTokenExpired(res);
            const adminMode = wantsAdminMode && access === 'staff';
            const isFeatured = req.query.isFeatured || '';

            const cacheKey = `books:all:${limit}_${page}_${search}_${categoryId}_${sortBy}_${maxPrice}_${adminMode}_${isFeatured}`;
            const cachedData = await getCache(cacheKey);
            if (cachedData) {
                return res.status(200).json(cachedData);
            }

            const books = await BookService.getBooks({ limit, offset, search, categoryId, sortBy, maxPrice, adminMode, isFeatured });

            const responseData = {
                message: 'Lấy danh sách thành công',
                data: books.map(book => ({ ...book, hashId: encodeBookId(book.id) })),
                pagination: { page, limit, total_in_page: books.length }
            };

            await setCache(cacheKey, responseData, 3600);

            res.status(200).json(responseData);
        } catch (err) {
            next(err);
        }
    }

    // POST /api/books (Chỉ Admin/Curator)
    static async createBook(req, res, next) {
        try {
            const { title, author, isbn, description, price, categories, cover_url, status, is_featured, is_bestseller, display_order, images } = req.body;

            const validationError = validateBookInput({ title, author, isbn, description, price, status });
            if (validationError) {
                return res.status(400).json({ error: validationError });
            }

            // Tạo sách + danh mục + ảnh chi tiết phụ trong một transaction; service xoá cache sau COMMIT
            const book = await BookService.createBook(
                { title, author, isbn, description, price: Number(price), cover_url, status: status || 'PUBLISHED', is_featured: !!is_featured, is_bestseller: !!is_bestseller, display_order: parseInt(display_order) || 0 },
                categories,
                images
            );

            res.status(201).json({
                message: 'Thêm sách thành công!',
                data: book ? { ...book, hashId: encodeBookId(book.id) } : null
            });
        } catch (err) {
            const known = handleDatabaseError(err);
            if (known) return res.status(400).json({ error: known });
            next(err);
        }
    }

    // GET /api/books/:id
    static async getBook(req, res, next) {
        try {
            const { id } = req.params;
            const cacheKey = `books:detail:${id}`;
            let responseData = await getCache(cacheKey);
            if (!responseData) {
                const book = await BookService.getBookDetails(id);
                if (!book) {
                    return res.status(404).json({ error: 'Không tìm thấy cuốn sách này' });
                }
                responseData = { ...book, hashId: encodeBookId(book.id) };
                await setCache(cacheKey, responseData, 3600);
            }

            // Sách nháp / đã ẩn: chỉ nhân viên xem được (B52). Kiểm SAU khi đọc cache, vì cache dùng chung cho mọi
            // người xem — nhân viên xem trước làm sách nháp nằm trong cache, khách không được đọc lại từ đó.
            if (responseData.status !== 'PUBLISHED') {
                const access = staffAccess(req);
                if (access === 'expired') return sendTokenExpired(res);
                if (access !== 'staff') {
                    return res.status(404).json({ error: 'Không tìm thấy cuốn sách này' });
                }
            }

            res.status(200).json({ data: responseData });
        } catch (err) {
            next(err);
        }
    }

    // PUT /api/books/:id (Chỉ Admin/Curator)
    static async updateBook(req, res, next) {
        try {
            const { id } = req.params;
            const { title, author, isbn, description, price, categories, cover_url, status, is_featured, is_bestseller, display_order, images } = req.body;

            const validationError = validateBookInput({ title, author, isbn, description, price, status });
            if (validationError) {
                return res.status(400).json({ error: validationError });
            }

            // B77: sách + danh mục + ảnh trong một transaction; cache xoá sau COMMIT và TRƯỚC khi trả response
            const book = await BookService.updateBook(
                id,
                { title, author, isbn, description, price: Number(price), cover_url, status: status || 'PUBLISHED', is_featured: !!is_featured, is_bestseller: !!is_bestseller, display_order: parseInt(display_order) || 0 },
                categories,
                images
            );

            if (!book) {
                return res.status(404).json({ error: 'Không tìm thấy cuốn sách này!' });
            }

            res.status(200).json({
                message: 'Cập nhật sách thành công!',
                data: { ...book, hashId: encodeBookId(book.id) }
            });
        } catch (err) {
            const known = handleDatabaseError(err);
            if (known) return res.status(400).json({ error: known });
            next(err);
        }
    }

    // DELETE /api/books/:id (Chỉ Admin)
    static async deleteBook(req, res, next) {
        try {
            const { id } = req.params;
            const pool = require('../config/database');
            const result = await pool.query('DELETE FROM books WHERE id = $1 RETURNING id', [id]);

            if (result.rowCount === 0) {
                return res.status(404).json({ error: 'Không tìm thấy cuốn sách này!' });
            }

            // Invalidate cache
            await clearCachePattern('books:*');

            res.status(200).json({ message: `Đã xóa sách ID=${id} thành công!` });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = BookController;
