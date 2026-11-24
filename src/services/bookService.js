// ==========================================
// FILE 1: src/services/bookService.js
// ==========================================
const pool = require('../config/database');
const Book = require('../models/Book');
const { invalidateBookCache } = require('../config/redis');

// Chạy `work(client)` trong một transaction; xong COMMIT thì mới xoá cache sách (B77).
// Lỗi giữa chừng (vd. mã danh mục không tồn tại) → ROLLBACK cả lần ghi, cache cũ vẫn khớp DB.
async function inBookTransaction(work) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await work(client);
        await client.query('COMMIT');
        await invalidateBookCache(); // sau COMMIT: trước đó request khác có thể ghi lại cache bằng bản cũ
        return result;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

class BookService {
    // Thêm sách và nối với danh mục, ảnh chi tiết — một transaction
    static async createBook(bookData, categoryIds = [], images = []) {
        return inBookTransaction(async (client) => {
            const book = await Book.create(bookData, client);
            await Book.addCategories(book.id, categoryIds, client);
            if (Array.isArray(images)) await Book.addImages(book.id, images, client);
            return book;
        });
    }

    // Sửa sách; `categories` / `images` là mảng thì thay toàn bộ, không gửi thì giữ nguyên.
    // Không có sách → null (không đổi gì).
    static async updateBook(id, bookData, categories, images) {
        return inBookTransaction(async (client) => {
            const book = await Book.update(id, bookData, client);
            if (!book) return null;
            if (Array.isArray(categories)) await Book.replaceCategories(id, categories, client);
            if (Array.isArray(images)) await Book.replaceImages(id, images, client);
            return book;
        });
    }

    // Lấy danh sách sách
    static async getBooks(filters) {
        return Book.getAll(filters);
    }

    // Lấy chi tiết sách theo ID
    static async getBookDetails(bookId) {
        return Book.findById(bookId);
    }
}

module.exports = BookService;
