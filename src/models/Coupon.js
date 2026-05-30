const pool = require('../config/database');

class Coupon {
    // Tìm coupon theo code (không phân biệt hoa thường)
    static async findByCode(code) {
        const query = 'SELECT * FROM coupons WHERE UPPER(code) = UPPER($1)';
        const result = await pool.query(query, [code.trim()]);
        return result.rows[0] || null;
    }

    // Tìm coupon theo ID
    static async findById(id) {
        const query = 'SELECT * FROM coupons WHERE id = $1';
        const result = await pool.query(query, [id]);
        return result.rows[0] || null;
    }

    // Lấy tất cả coupon (Admin)
    static async getAll() {
        const query = `
            SELECT c.*, 
                   (SELECT COUNT(*) FROM user_coupons uc WHERE uc.coupon_id = c.id) as actual_used_count
            FROM coupons c
            ORDER BY c.created_at DESC
        `;
        const result = await pool.query(query);
        return result.rows;
    }

    // Tạo coupon mới (Admin)
    static async create({ code, discount_type, discount_value, min_order_amount, max_discount_amount, start_date, end_date, usage_limit }) {
        const query = `
            INSERT INTO coupons (code, discount_type, discount_value, min_order_amount, max_discount_amount, start_date, end_date, usage_limit)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `;
        const result = await pool.query(query, [
            code.trim().toUpperCase(),
            discount_type,
            discount_value,
            min_order_amount || 0,
            max_discount_amount || null,
            start_date || new Date(),
            end_date,
            usage_limit || 100
        ]);
        return result.rows[0];
    }

    // Cập nhật coupon (Admin)
    static async update(id, { code, discount_type, discount_value, min_order_amount, max_discount_amount, start_date, end_date, usage_limit, is_active }) {
        const query = `
            UPDATE coupons
            SET code = $1, discount_type = $2, discount_value = $3, min_order_amount = $4,
                max_discount_amount = $5, start_date = $6, end_date = $7, usage_limit = $8, is_active = $9
            WHERE id = $10
            RETURNING *
        `;
        const result = await pool.query(query, [
            code.trim().toUpperCase(),
            discount_type,
            discount_value,
            min_order_amount || 0,
            max_discount_amount || null,
            start_date,
            end_date,
            usage_limit || 100,
            is_active !== undefined ? is_active : true,
            id
        ]);
        return result.rows[0] || null;
    }

    // Vô hiệu hóa / Kích hoạt coupon (toggle)
    static async toggleActive(id, isActive) {
        const query = 'UPDATE coupons SET is_active = $1 WHERE id = $2 RETURNING *';
        const result = await pool.query(query, [isActive, id]);
        return result.rows[0] || null;
    }

    // Xóa coupon (Admin)
    static async delete(id) {
        const query = 'DELETE FROM coupons WHERE id = $1 RETURNING id';
        const result = await pool.query(query, [id]);
        return result.rows[0] || null;
    }

    // Kiểm tra xem user đã dùng coupon này chưa
    static async checkUserUsed(userId, couponId) {
        const query = 'SELECT 1 FROM user_coupons WHERE user_id = $1 AND coupon_id = $2';
        const result = await pool.query(query, [userId, couponId]);
        return result.rows.length > 0;
    }

    // Ghi nhận việc sử dụng coupon của user (hỗ trợ transaction)
    static async recordUsage(client, userId, couponId) {
        const query = 'INSERT INTO user_coupons (user_id, coupon_id) VALUES ($1, $2)';
        if (client) {
            await client.query(query, [userId, couponId]);
        } else {
            await pool.query(query, [userId, couponId]);
        }
    }

    // Tăng lượt sử dụng của coupon lên 1 (hỗ trợ transaction)
    static async incrementUsedCount(client, couponId) {
        const query = 'UPDATE coupons SET used_count = used_count + 1 WHERE id = $1';
        if (client) {
            await client.query(query, [couponId]);
        } else {
            await pool.query(query, [couponId]);
        }
    }

    // Lấy danh sách coupon đang hoạt động (Public / Customer)
    static async getActive(userId = null) {
        let query;
        let params = [];
        if (userId) {
            query = `
                SELECT c.id, c.code, c.discount_type, c.discount_value, c.min_order_amount, 
                       c.max_discount_amount, c.start_date, c.end_date, c.usage_limit, c.used_count,
                       (CASE WHEN uc.user_id IS NOT NULL THEN true ELSE false END) as is_used
                FROM coupons c
                LEFT JOIN user_coupons uc ON uc.coupon_id = c.id AND uc.user_id = $1
                WHERE c.is_active = true AND c.end_date >= NOW() AND c.used_count < c.usage_limit
                ORDER BY c.created_at DESC
            `;
            params = [userId];
        } else {
            query = `
                SELECT c.id, c.code, c.discount_type, c.discount_value, c.min_order_amount, 
                       c.max_discount_amount, c.start_date, c.end_date, c.usage_limit, c.used_count,
                       false as is_used
                FROM coupons c
                WHERE c.is_active = true AND c.end_date >= NOW() AND c.used_count < c.usage_limit
                ORDER BY c.created_at DESC
            `;
        }
        const result = await pool.query(query, params);
        return result.rows;
    }
}

module.exports = Coupon;
