// ==========================================
// FILE 2: src/controllers/bookController.js
// ==========================================
const BookService = require('../services/bookService');
const { encodeBookId } = require('../utils/hashids');
const { getCache, setCache, clearCachePattern } = require('../config/redis');
const { staffAccess, sendTokenExpired } = require('../middleware/auth');
const Inventory = require('../models/Inventory');

// B78: cache sách KHÔNG chứa tồn kho — tồn kho đổi theo từng đơn hàng, nếu nằm trong cache thì mỗi đơn phải xoá toàn
// bộ `books:*`. Ghi cache thì bỏ hai trường tồn kho; đọc từ cache thì ghép tồn kho mới từ bảng inventory.
function withoutStock(book) {
    const { available_qty, reserved_qty, ...rest } = book; // eslint-disable-line no-unused-vars
    return rest;
}

async function withLiveStock(books) {
    if (books.length === 0) return books;
    const stock = await Inventory.getDisplayStock(books.map(b => b.id));
    return books.map(b => {
        const s = stock.get(b.id);
        return { ...b, available_qty: s ? s.available_qty : 0, reserved_qty: s ? s.reserved_qty : 0 };
    });
}

// Mã danh mục không tồn tại: chỉ DB biết (khoá ngoại) — cả lần tạo / sửa đã ROLLBACK (B77).
// Các luật kiểm tra đầu vào khác của sách nằm ở lược đồ Zod `schemas.book.write` (B36).
function isMissingCategory(err) {
    return err.code === '23503' && err.constraint === 'book_categories_category_id_fkey';
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
                return res.status(200).json({ ...cachedData, data: await withLiveStock(cachedData.data) });
            }

            const books = await BookService.getBooks({ limit, offset, search, categoryId, sortBy, maxPrice, adminMode, isFeatured });

            const responseData = {
                message: 'Lấy danh sách thành công',
                data: books.map(book => ({ ...book, hashId: encodeBookId(book.id) })),
                pagination: { page, limit, total_in_page: books.length }
            };

            await setCache(cacheKey, { ...responseData, data: responseData.data.map(withoutStock) }, 3600);

            res.status(200).json(responseData);
        } catch (err) {
            next(err);
        }
    }

    // POST /api/books (Chỉ Admin/Curator)
    static async createBook(req, res, next) {
        try {
            const { title, author, isbn, description, price, categories, cover_url, status, is_featured, is_bestseller, display_order, images } = req.body;

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
            if (isMissingCategory(err)) return res.status(400).json({ error: 'Danh mục không tồn tại!' });
            next(err);
        }
    }

    // GET /api/books/:id
    static async getBook(req, res, next) {
        try {
            const { id } = req.params;
            const cacheKey = `books:detail:${id}`;
            let responseData = await getCache(cacheKey);
            if (responseData) {
                [responseData] = await withLiveStock([responseData]);
            } else {
                const book = await BookService.getBookDetails(id);
                if (!book) {
                    return res.status(404).json({ error: 'Không tìm thấy cuốn sách này' });
                }
                responseData = { ...book, hashId: encodeBookId(book.id) };
                await setCache(cacheKey, withoutStock(responseData), 3600);
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
            if (isMissingCategory(err)) return res.status(400).json({ error: 'Danh mục không tồn tại!' });
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
