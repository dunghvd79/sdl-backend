const pool = require('../config/database');
const AppError = require('../utils/AppError');

// B74: sách chưa có dòng kho = 0 cuốn (không còn tự tạo 10 cuốn "ảo")
const EMPTY_STOCK = { available_qty: 0, reserved_qty: 0, sold_qty: 0 };

class Inventory {
    // Xem trạng thái kho của 1 cuốn sách. Chưa có dòng kho → 0 cuốn; đường đọc không ghi gì vào DB.
    static async getStatus(bookId) {
        const result = await pool.query('SELECT * FROM inventory WHERE book_id = $1', [bookId]);
        return result.rows[0] || { book_id: bookId, ...EMPTY_STOCK };
    }

    // Tồn kho hiển thị của nhiều sách (B78: không nằm trong cache sách, đọc mới mỗi lần — truy vấn theo khoá chính).
    // Trả Map book_id → { available_qty: còn bán được (= tồn - giữ chỗ), reserved_qty }; sách chưa có dòng kho thì không có trong Map.
    static async getDisplayStock(bookIds) {
        const { rows } = await pool.query(
            `SELECT book_id, available_qty - reserved_qty AS available_qty, reserved_qty
             FROM inventory WHERE book_id = ANY($1::int[])`,
            [bookIds]
        );
        return new Map(rows.map(r => [r.book_id, r]));
    }

    // Khoá dòng kho (FOR UPDATE) tới hết transaction của `executor`; chưa có dòng thì tạo dòng 0 cuốn rồi khoá.
    // ON CONFLICT: hai transaction cùng tạo dòng cho một cuốn không lỗi 23505 — bên sau chờ rồi khoá dòng đã có.
    static async lockRow(executor, bookId) {
        const lockQuery = 'SELECT * FROM inventory WHERE book_id = $1 FOR UPDATE';
        const { rows: [existing] } = await executor.query(lockQuery, [bookId]);
        if (existing) return existing;

        await executor.query(
            `INSERT INTO inventory (book_id, available_qty, reserved_qty, sold_qty)
             VALUES ($1, 0, 0, 0) ON CONFLICT (book_id) DO NOTHING`,
            [bookId]
        );
        const { rows: [created] } = await executor.query(lockQuery, [bookId]);
        return created;
    }

    // Kiểm tra xem còn đủ sách bán không
    static async checkAvailability(bookId, quantity) {
        const inventory = await this.getStatus(bookId);
        if (!inventory) throw new AppError('Không tìm thấy thông tin kho của sách này', 400);

        // Số lượng thực bán = Tổng sẵn có - Đang giữ chỗ cho người khác
        const available = inventory.available_qty - inventory.reserved_qty;
        return available >= quantity;
    }

    // GIỮ CHỖ SÁCH (Sử dụng Transaction và Lock DB)
    static async hold(client, bookId, quantity) {
        const isLocalClient = !client;
        const executor = client || await pool.connect();
        try {
            if (isLocalClient) {
                await executor.query('BEGIN'); // Bắt đầu Giao dịch nếu tự tạo client
            }

            // FOR UPDATE: Khóa dòng dữ liệu này lại, không cho ai khác sửa cho đến khi Giao dịch xong
            const inventory = await this.lockRow(executor, bookId);

            const available = inventory.available_qty - inventory.reserved_qty;
            if (available < quantity) throw new AppError(`Kho chỉ còn ${available} cuốn`, 400);

            // Cộng dồn số lượng vào cột "Giữ chỗ" (reserved_qty)
            const queryUpdate = `
                UPDATE inventory
                SET reserved_qty = reserved_qty + $2, updated_at = CURRENT_TIMESTAMP
                WHERE book_id = $1 RETURNING *
            `;
            const resultUpdate = await executor.query(queryUpdate, [bookId, quantity]);

            if (isLocalClient) {
                await executor.query('COMMIT'); // Xác nhận Giao dịch thành công
            }
            return resultUpdate.rows[0];
        } catch (err) {
            if (isLocalClient) {
                await executor.query('ROLLBACK'); // Nếu có lỗi, hoàn tác
            }
            throw err;
        } finally {
            if (isLocalClient) {
                executor.release(); // Trả kết nối lại cho Pool
            }
        }
    }

    // ĐIỀU CHỈNH KHO THỦ CÔNG (admin) — trong transaction của bên gọi, KHOÁ DÒNG trước khi tính.
    // mode 'delta': cộng/trừ `amount` vào tồn kho HIỆN TẠI trong DB (không tin số giao diện tính từ dữ liệu cũ).
    // mode 'set'  : đặt thẳng `amount` (kiểm kê / giao diện cũ gửi availableQty).
    // Không cho tồn kho thấp hơn số đang giữ chỗ cho đơn chờ thanh toán.
    static async adjust(client, bookId, { mode, amount, type, reason, userId }) {
        const inventory = await this.lockRow(client, bookId);

        const prevQty = inventory.available_qty;
        const newQty = mode === 'delta' ? prevQty + amount : amount;
        if (newQty < inventory.reserved_qty) {
            throw new AppError(
                `Không thể giảm tồn kho xuống ${newQty}: đang giữ chỗ ${inventory.reserved_qty} cuốn cho đơn chờ thanh toán.`,
                400
            );
        }

        const { rows: [updated] } = await client.query(
            `UPDATE inventory SET available_qty = $2, updated_at = CURRENT_TIMESTAMP
             WHERE book_id = $1 RETURNING *`,
            [bookId, newQty]
        );

        const diff = newQty - prevQty;
        if (diff !== 0) {
            const defaultReason = diff > 0
                ? `Nhập thêm tồn kho thủ công (Từ ${prevQty} sang ${newQty})`
                : `Điều chỉnh giảm tồn kho thủ công (Từ ${prevQty} sang ${newQty})`;
            await this.recordTransaction(client, bookId, type || 'ADJUSTMENT', diff, prevQty, newQty, reason || defaultReason, userId);
        }
        return updated;
    }

    // GHI NHẬT KÝ BIẾN ĐỘNG KHO
    static async recordTransaction(client, bookId, type, quantity, prevQty, newQty, reason, userId) {
        const executor = client || pool;
        const query = `
            INSERT INTO inventory_transactions (book_id, type, quantity, previous_qty, new_qty, reason, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `;
        const result = await executor.query(query, [
            bookId,
            type,
            quantity,
            prevQty,
            newQty,
            reason || null,
            userId || null
        ]);
        return result.rows[0];
    }

    // XÁC NHẬN MUA HÀNG (Trừ kho sẵn có, trừ giữ chỗ, cộng đã bán)
    static async commit(client, bookId, quantity, reason, userId) {
        const isLocalClient = !client;
        const executor = client || await pool.connect();

        try {
            if (isLocalClient) {
                await executor.query('BEGIN');
            }

            // Lock dòng để đảm bảo đồng bộ (chưa có dòng kho → dòng 0 cuốn, B74)
            const inventory = await this.lockRow(executor, bookId);

            const prevQty = inventory.available_qty;
            const newAvailableQty = Math.max(0, inventory.available_qty - quantity);
            const newReservedQty = Math.max(0, inventory.reserved_qty - quantity);
            const newSoldQty = inventory.sold_qty + quantity;

            const updateQuery = `
                UPDATE inventory
                SET available_qty = $2, reserved_qty = $3, sold_qty = $4, updated_at = CURRENT_TIMESTAMP
                WHERE book_id = $1 RETURNING *
            `;
            const updateResult = await executor.query(updateQuery, [bookId, newAvailableQty, newReservedQty, newSoldQty]);

            // Ghi log loại STOCK_OUT (số lượng ghi âm để biểu thị xuất kho)
            await this.recordTransaction(executor, bookId, 'STOCK_OUT', -quantity, prevQty, newAvailableQty, reason, userId);

            if (isLocalClient) {
                await executor.query('COMMIT');
            }
            return updateResult.rows[0];
        } catch (err) {
            if (isLocalClient) {
                await executor.query('ROLLBACK');
            }
            throw err;
        } finally {
            if (isLocalClient) {
                executor.release();
            }
        }
    }

    // HỦY GIỮ CHỖ TRONG TRANSACTION
    static async cancelReservation(client, bookId, quantity, reason, userId) {
        const isLocalClient = !client;
        const executor = client || await pool.connect();

        try {
            if (isLocalClient) {
                await executor.query('BEGIN');
            }

            const getQuery = 'SELECT * FROM inventory WHERE book_id = $1 FOR UPDATE';
            const getResult = await executor.query(getQuery, [bookId]);
            let inventory = getResult.rows[0];

            if (!inventory) {
                if (isLocalClient) await executor.query('COMMIT');
                return null;
            }

            const newReservedQty = Math.max(0, inventory.reserved_qty - quantity);

            const updateQuery = `
                UPDATE inventory
                SET reserved_qty = $2, updated_at = CURRENT_TIMESTAMP
                WHERE book_id = $1 RETURNING *
            `;
            const updateResult = await executor.query(updateQuery, [bookId, newReservedQty]);

            if (isLocalClient) {
                await executor.query('COMMIT');
            }
            return updateResult.rows[0];
        } catch (err) {
            if (isLocalClient) {
                await executor.query('ROLLBACK');
            }
            throw err;
        } finally {
            if (isLocalClient) {
                executor.release();
            }
        }
    }

    // HOÀN HÀNG VỀ KHO (Tăng lại có sẵn, giảm đã bán)
    static async returnStock(client, bookId, quantity, reason, userId) {
        const isLocalClient = !client;
        const executor = client || await pool.connect();

        try {
            if (isLocalClient) {
                await executor.query('BEGIN');
            }

            const getQuery = 'SELECT * FROM inventory WHERE book_id = $1 FOR UPDATE';
            const getResult = await executor.query(getQuery, [bookId]);
            let inventory = getResult.rows[0];

            if (!inventory) {
                if (isLocalClient) await executor.query('COMMIT');
                return null;
            }

            const prevQty = inventory.available_qty;
            const newAvailableQty = inventory.available_qty + quantity;
            const newSoldQty = Math.max(0, inventory.sold_qty - quantity);

            const updateQuery = `
                UPDATE inventory
                SET available_qty = $2, sold_qty = $3, updated_at = CURRENT_TIMESTAMP
                WHERE book_id = $1 RETURNING *
            `;
            const updateResult = await executor.query(updateQuery, [bookId, newAvailableQty, newSoldQty]);

            // Ghi log loại RETURN (số lượng dương để biểu thị nhập lại hàng)
            await this.recordTransaction(executor, bookId, 'RETURN', quantity, prevQty, newAvailableQty, reason, userId);

            if (isLocalClient) {
                await executor.query('COMMIT');
            }
            return updateResult.rows[0];
        } catch (err) {
            if (isLocalClient) {
                await executor.query('ROLLBACK');
            }
            throw err;
        } finally {
            if (isLocalClient) {
                executor.release();
            }
        }
    }
}

module.exports = Inventory;