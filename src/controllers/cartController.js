const CartService = require('../services/cartService');

class CartController {
    // GET /api/cart
    static async getCart(req, res) {
        try {
            // Lấy ID của user đang đăng nhập từ token
            const cart = await CartService.getCart(req.user.id);
            res.status(200).json({ data: cart || { items: [] } });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }

    // POST /api/cart/add
    static async addToCart(req, res) {
        try {
            const { bookId, quantity } = req.body;
            if (!bookId || !quantity) return res.status(400).json({ error: 'Thiếu bookId hoặc quantity' });

            const item = await CartService.addToCart(req.user.id, bookId, quantity);
            res.status(200).json({ message: 'Đã thêm sách vào giỏ', data: item });
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
            const data = await CartService.addBatchToCart(req.user.id, items);
            res.status(200).json({ message: 'Đã thêm danh sách sách vào giỏ', data });
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    }

    // DELETE /api/cart/remove/:bookId
    static async removeFromCart(req, res) {
        try {
            const { bookId } = req.params;
            await CartService.removeFromCart(req.user.id, bookId);
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