const pool = require('../config/database');
const AppError = require('../utils/AppError');

class Inventory {
    // Xem trạng thái kho của 1 cuốn sách (tự khởi tạo nếu chưa có)
    static async getStatus(bookId) {
        const query = 'SELECT * FROM inventory WHERE book_id = $1';
        const result = await pool.query(query, [bookId]);
        if (result.rows[0]) {
            return result.rows[0];
        }

        // Tự động tạo bản ghi kho mới nếu chưa có, mặc định có 10 cuốn
        try {
            const insertQuery = `
                INSERT INTO inventory (book_id, available_qty, reserved_qty, sold_qty)
                VALUES ($1, 10, 0, 0)
                RETURNING *
            `;
            const insertResult = await pool.query(insertQuery, [bookId]);
            return insertResult.rows[0];
        } catch (err) {
            console.error("Lỗi tự tạo tồn kho:", err);
            return null;
        }
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
            const queryGet = 'SELECT * FROM inventory WHERE book_id = $1 FOR UPDATE';
            const resultGet = await executor.query(queryGet, [bookId]);
            let inventory = resultGet.rows[0];

            if (!inventory) {
                // Tự động tạo kho trong transaction nếu chưa có
                const insertQuery = `
                    INSERT INTO inventory (book_id, available_qty, reserved_qty, sold_qty)
                    VALUES ($1, 10, 0, 0)
                    RETURNING *
                `;
                const insertResult = await executor.query(insertQuery, [bookId]);
                inventory = insertResult.rows[0];
            }

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
        await client.query(
            `INSERT INTO inventory (book_id, available_qty, reserved_qty, sold_qty)
             VALUES ($1, 0, 0, 0) ON CONFLICT (book_id) DO NOTHING`,
            [bookId]
        );
        const { rows: [inventory] } = await client.query(
            'SELECT * FROM inventory WHERE book_id = $1 FOR UPDATE',
            [bookId]
        );

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

            // Lock dòng để đảm bảo đồng bộ
            const getQuery = 'SELECT * FROM inventory WHERE book_id = $1 FOR UPDATE';
            const getResult = await executor.query(getQuery, [bookId]);
            let inventory = getResult.rows[0];

            if (!inventory) {
                // Tự tạo bản ghi kho nếu chưa có
                const insertQuery = `
                    INSERT INTO inventory (book_id, available_qty, reserved_qty, sold_qty)
                    VALUES ($1, 10, 0, 0)
                    RETURNING *
                `;
                const insertResult = await executor.query(insertQuery, [bookId]);
                inventory = insertResult.rows[0];
            }

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