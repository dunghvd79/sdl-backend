const CartService = require('../services/cartService');
const { encodeBookId, decodeBookId } = require('../utils/hashids');

function formatCart(cart) {
    if (!cart) return { items: [] };
    const formatted = { ...cart };
    if (Array.isArray(formatted.items)) {
        formatted.items = formatted.items.map(item => {
            const formattedItem = {
                ...item,
                hashId: encodeBookId(item.bookId)
            };
            if (formattedItem.book) {
                formattedItem.book = {
                    ...formattedItem.book,
                    hashId: encodeBookId(formattedItem.book.id)
                };
            }
            return formattedItem;
        });
    }
    return formatted;
}

class CartController {
    // GET /api/cart
    static async getCart(req, res) {
        try {
            // Lấy ID của user đang đăng nhập từ token
            const cart = await CartService.getCart(req.user.id);
            res.status(200).json({ data: formatCart(cart) });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }

    // POST /api/cart/add
    static async addToCart(req, res) {
        try {
            const { bookId, quantity } = req.body;
            if (!bookId || !quantity) return res.status(400).json({ error: 'Thiếu bookId hoặc quantity' });

            let targetBookId = bookId;
            if (typeof bookId === 'string' && isNaN(bookId)) {
                targetBookId = decodeBookId(bookId);
            }

            const item = await CartService.addToCart(req.user.id, targetBookId, quantity);
            res.status(200).json({ message: 'Đã thêm sách vào giỏ', data: item ? { ...item, hashId: encodeBookId(item.bookId) } : null });
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    }

    // POST /api/cart/add-batch
    static async addBatchToCart(req, res) {
        try {
            const { items } = req.body;
            if (!Array.isArray(items) || items.length === 0) {
                return res.status(400).json({ error: 'Danh sách sản phẩm không hợp lệ' });
            }
            const targetItems = items.map(item => {
                let targetBookId = item.bookId;
                if (typeof item.bookId === 'string' && isNaN(item.bookId)) {
                    targetBookId = decodeBookId(item.bookId);
                }
                return { ...item, bookId: targetBookId };
            });
            const data = await CartService.addBatchToCart(req.user.id, targetItems);
            res.status(200).json({ message: 'Đã thêm danh sách sách vào giỏ', data });
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    }

    // DELETE /api/cart/remove/:bookId
    static async removeFromCart(req, res) {
        try {
            const { bookId } = req.params;
            let targetBookId = bookId;
            if (typeof bookId === 'string' && isNaN(bookId)) {
                targetBookId = decodeBookId(bookId);
            }
            await CartService.removeFromCart(req.user.id, targetBookId);
            res.status(200).json({ message: 'Đã xóa sách khỏi giỏ hàng' });
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    }

    // POST /api/cart/checkout
    static async prepareCheckout(req, res) {
        try {
            const result = await CartService.prepareCheckout(req.user.id);
            res.status(200).json(result);
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    }
}

module.exports = CartController;