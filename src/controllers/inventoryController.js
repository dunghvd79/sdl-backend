const pool = require('../config/database');

class InventoryController {
    // GET /api/inventory
    // Lấy danh sách tất cả sách cùng thông tin kho hàng tương ứng
    static async getAll(req, res) {
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
            res.status(500).json({ error: err.message });
        }
    }

    // PUT /api/inventory/:bookId
    // Cập nhật số lượng sẵn có (available_qty) cho một cuốn sách và ghi nhật ký
    static async updateAvailableQty(req, res) {
        const client = await pool.connect();
        try {
            const { bookId } = req.params;
            const { availableQty } = req.body;

            if (availableQty === undefined || availableQty < 0) {
                return res.status(400).json({ error: 'Số lượng không hợp lệ!' });
            }

            const Inventory = require('../models/Inventory');

            await client.query('BEGIN');

            // 1. Lấy thông tin kho cũ
            const oldStatus = await Inventory.getStatus(bookId);
            const prevQty = oldStatus ? oldStatus.available_qty : 0;
            const newQty = parseInt(availableQty, 10);
            const diff = newQty - prevQty;

            // 2. Cập nhật tồn kho
            const updateQuery = `
                INSERT INTO inventory (book_id, available_qty, reserved_qty, sold_qty)
                VALUES ($1, $2, 0, 0)
                ON CONFLICT (book_id)
                DO UPDATE SET
                    available_qty = $2,
                    updated_at    = CURRENT_TIMESTAMP
                RETURNING *
            `;
            const result = await client.query(updateQuery, [bookId, newQty]);

            // 3. Nếu số lượng thay đổi, ghi log ADJUSTMENT
            if (diff !== 0) {
                const reason = `Điều chỉnh tồn kho thủ công (Từ ${prevQty} sang ${newQty})`;
                await Inventory.recordTransaction(client, bookId, 'ADJUSTMENT', diff, prevQty, newQty, reason, req.user.id);
            }

            await client.query('COMMIT');

            res.status(200).json({
                message: 'Cập nhật tồn kho thành công!',
                data: result.rows[0]
            });
        } catch (err) {
            await client.query('ROLLBACK');
            res.status(500).json({ error: err.message });
        } finally {
            client.release();
        }
    }

    // GET /api/inventory/transactions
    // Lấy lịch sử biến động kho (Tối đa 100 giao dịch mới nhất)
    static async getTransactionHistory(req, res) {
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
            res.status(500).json({ error: err.message });
        }
    }
}

module.exports = InventoryController;
