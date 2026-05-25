// ==========================================
// FILE 1: src/services/bookService.js
// ==========================================
const Book = require('../models/Book');

class BookService {
    // Thêm sách và nối với danh mục
    static async createBook(bookData, categoryIds = []) {
        // 1. Lưu thông tin sách vào bảng books
        const book = await Book.create(bookData);

        // 2. Nếu có gửi kèm danh sách ID danh mục, thì lưu vào bảng trung gian
        if (categoryIds.length > 0) {
            for (const categoryId of categoryIds) {
                await Book.addCategory(book.id, categoryId);
            }
        }

        return book;
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


// ==========================================