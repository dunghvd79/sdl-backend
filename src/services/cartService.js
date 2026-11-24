const pool = require('../config/database');
const Cart = require('../models/Cart');
const Inventory = require('../models/Inventory');
const Book = require('../models/Book');
const AppError = require('../utils/AppError');

class CartService {
    // Lấy hoặc tạo mới giỏ hàng cho User
    static async getOrCreateCart(userId) {
        let cart = await Cart.getByUserId(userId);
        if (!cart) {
            cart = await Cart.createForUser(userId);
        }
        return cart;
    }

    // Thêm sách vào giỏ
    static async addToCart(userId, bookId, quantity) {
        // 1. Lấy giỏ hàng của user
        const cart = await this.getOrCreateCart(userId);

        // 2. Kiểm tra sách có tồn tại không
        const book = await Book.findById(bookId);
        if (!book) throw new AppError('Không tìm thấy cuốn sách này', 400);

        // 3. Kiểm tra Tồn kho xem còn đủ không
        const isAvailable = await Inventory.checkAvailability(bookId, quantity);
        if (!isAvailable) throw new AppError('Số lượng sách trong kho không đủ để đáp ứng', 400);

        // 4. Nếu ổn tất cả, thêm vào giỏ hàng
        const item = await Cart.addItem(cart.id, bookId, quantity, book.price);
        return item;
    }

    // Thêm nhiều sách vào giỏ cùng lúc ("Mua lại" đơn cũ). B85: tất cả hoặc không món nào —
    // kiểm tra HẾT các món trước (đọc cả lô bằng một câu SQL), rồi mới ghi trong một transaction.
    static async addBatchToCart(userId, items) {
        const wanted = items.filter(item => item.bookId && item.quantity); // mã sách giải mã lỗi → bỏ qua như trước
        if (wanted.length === 0) return [];

        const books = await Book.findForCart(wanted.map(item => Number(item.bookId)));
        for (const { bookId, quantity } of wanted) {
            const book = books.get(Number(bookId));
            if (!book) throw new AppError(`Không tìm thấy cuốn sách có ID ${bookId}`, 400);
            if (book.sellable_qty < quantity) {
                throw new AppError(`Số lượng sách "${book.title}" trong kho không đủ để đáp ứng`, 400);
            }
        }

        const cart = await this.getOrCreateCart(userId);
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const results = [];
            for (const { bookId, quantity } of wanted) {
                const book = books.get(Number(bookId));
                results.push(await Cart.addItem(cart.id, book.id, quantity, book.price, client));
            }
            await client.query('COMMIT');
            return results;
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

    // Lấy thông tin giỏ hàng
    static async getCart(userId) {
        return Cart.getByUserId(userId);
    }

    // Xóa 1 sản phẩm khỏi giỏ
    static async removeFromCart(userId, bookId) {
        const cart = await Cart.getByUserId(userId);
        if (!cart) throw new AppError('Giỏ hàng trống', 400);
        await Cart.removeItem(cart.id, bookId);
    }

    // Bắt đầu Thanh toán (Kiểm tra sẵn có của hàng trong kho)
    static async prepareCheckout(userId, selectedBookIds = null) {
        const cart = await Cart.getByUserId(userId);
        if (!cart || !cart.items || cart.items.length === 0) {
            throw new AppError('Giỏ hàng của bạn đang trống', 400);
        }

        let itemsToCheck = cart.items;
        if (selectedBookIds && Array.isArray(selectedBookIds) && selectedBookIds.length > 0) {
            const { decodeBookId } = require('../utils/hashids');
            const decodedIds = selectedBookIds.map(id => {
                if (typeof id === 'string' && isNaN(id)) {
                    return decodeBookId(id);
                }
                return parseInt(id);
            });
            itemsToCheck = cart.items.filter(item => decodedIds.includes(item.bookId));
        }

        if (itemsToCheck.length === 0) {
            throw new AppError('Vui lòng chọn ít nhất một sản phẩm để thanh toán', 400);
        }

        // Chỉ kiểm tra tồn kho xem còn đủ không chứ KHÔNG giữ kho sớm (tránh rò rỉ)
        for (const item of itemsToCheck) {
            const isAvailable = await Inventory.checkAvailability(item.bookId, item.quantity);
            if (!isAvailable) {
                const book = await Book.findById(item.bookId);
                const title = book ? `"${book.title}"` : `ID #${item.bookId}`;
                throw new AppError(`Sách ${title} trong kho không đủ để đáp ứng`, 400);
            }
        }
        return { message: 'Sẵn sàng tạo Đơn hàng', cart };
    }

    // Xóa nhiều sản phẩm khỏi giỏ hàng
    static async removeBulkFromCart(userId, bookIds) {
        const cart = await Cart.getByUserId(userId);
        if (!cart) throw new AppError('Giỏ hàng trống', 400);
        await Cart.removeItems(cart.id, bookIds);
    }
}

module.exports = CartService;