const pool = require('../config/database');

class InventoryController {
    // GET /api/inventory
    // Lấy danh sách tất cả sách cùng thông tin kho hàng tương ứng
    static async getAll(req, res, next) {
        try {
            const query = `
                SELECT 
                    b.id          AS book_id,
                    b.title,
                    b.author,
                    b.price,
                    COALESCE(i.available_qty, 0) AS available_qty,
                    COALESCE(i.reserved_qty, 0)  AS reserved_qty,
                    COALESCE(i.sold_qty, 0)       AS sold_qty,
                    i.updated_at
                FROM books b
                LEFT JOIN inventory i ON b.id = i.book_id
                ORDER BY b.id ASC
            `;
            const result = await pool.query(query);
            res.status(200).json({ data: result.rows });
        } catch (err) {
            next(err);
        }
    }

    // PUT /api/inventory/:bookId
    // Cập nhật số lượng sẵn có (available_qty) cho một cuốn sách và ghi nhật ký
    static async updateAvailableQty(req, res, next) {
        const client = await pool.connect();
        try {
            const { bookId } = req.params;
            const { availableQty, quantity, type, reason } = req.body;

            // Ưu tiên lượng thay đổi (quantity + STOCK_IN/STOCK_OUT): máy chủ tự cộng/trừ trên tồn kho hiện
            // tại, tránh ghi đè số do giao diện tính từ dữ liệu cũ. availableQty = đặt thẳng (kiểm kê / giao diện cũ).
            // Lược đồ `schemas.inventory.update` đã bảo đảm: có quantity thì type là STOCK_IN / STOCK_OUT, không thì
            // có availableQty ≥ 0 (B36).
            let adjustment;
            if (quantity !== undefined && quantity !== null && quantity !== '') {
                const amount = parseInt(quantity, 10);
                adjustment = { mode: 'delta', amount: type === 'STOCK_IN' ? amount : -amount };
            } else {
                adjustment = { mode: 'set', amount: parseInt(availableQty, 10) };
            }

            const Inventory = require('../models/Inventory');

            await client.query('BEGIN');
            const updated = await Inventory.adjust(client, bookId, {
                ...adjustment, type, reason, userId: req.user.id
            });
            await client.query('COMMIT');
            const result = { rows: [updated] };


            res.status(200).json({
                message: 'Cập nhật tồn kho thành công!',
                data: result.rows[0]
            });
        } catch (err) {
            await client.query('ROLLBACK');
            next(err);
        } finally {
            client.release();
        }
    }

    // GET /api/inventory/transactions
    // Lấy lịch sử biến động kho (Tối đa 100 giao dịch mới nhất)
    static async getTransactionHistory(req, res, next) {
        try {
            const query = `
                SELECT 
                    it.id,
                    it.book_id,
                    b.title AS book_title,
                    b.author AS book_author,
                    it.type,
                    it.quantity,
                    it.previous_qty,
                    it.new_qty,
                    it.reason,
                    it.created_at,
                    u.email AS created_by_email,
                    up.full_name AS created_by_name
                FROM inventory_transactions it
                JOIN books b ON it.book_id = b.id
                LEFT JOIN users u ON it.created_by = u.id
                LEFT JOIN user_profiles up ON u.id = up.user_id
                ORDER BY it.created_at DESC
                LIMIT 100
            `;
            const result = await pool.query(query);
            res.status(200).json({ data: result.rows });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = InventoryController;
