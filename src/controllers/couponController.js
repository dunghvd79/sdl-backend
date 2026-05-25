const Coupon = require('../models/Coupon');

class CouponController {
    // ==========================================
    // CUSTOMER: Validate coupon at checkout
    // GET /api/coupons/validate
    // ==========================================
    static async validateCoupon(req, res) {
        try {
            const { code, orderAmount } = req.query;
            const userId = req.user.id;

            if (!code || code.trim() === '') {
                return res.status(400).json({ error: 'Vui lòng nhập mã giảm giá' });
            }

            const amount = Number(orderAmount);
            if (isNaN(amount) || amount <= 0) {
                return res.status(400).json({ error: 'Giá trị đơn hàng không hợp lệ' });
            }

            // 1. Tìm coupon
            const coupon = await Coupon.findByCode(code);
            if (!coupon) {
                return res.status(404).json({ error: 'Mã giảm giá không tồn tại' });
            }

            // 2. Kiểm tra kích hoạt
            if (!coupon.is_active) {
                return res.status(400).json({ error: 'Mã giảm giá đã bị vô hiệu hóa' });
            }

            // 3. Kiểm tra ngày hiệu lực
            const now = new Date();
            const start = new Date(coupon.start_date);
            const end = new Date(coupon.end_date);
            if (now < start) {
                return res.status(400).json({ error: 'Mã giảm giá chưa đến thời gian áp dụng' });
            }
            if (now > end) {
                return res.status(400).json({ error: 'Mã giảm giá đã hết hạn sử dụng' });
            }

            // 4. Kiểm tra giới hạn lượt dùng
            if (coupon.used_count >= coupon.usage_limit) {
                return res.status(400).json({ error: 'Mã giảm giá đã hết lượt sử dụng' });
            }

            // 5. Kiểm tra xem người dùng đã dùng chưa
            const isUsed = await Coupon.checkUserUsed(userId, coupon.id);
            if (isUsed) {
                return res.status(400).json({ error: 'Bạn đã sử dụng mã giảm giá này cho đơn hàng khác rồi' });
            }

            // 6. Kiểm tra giá trị đơn tối thiểu
            if (amount < Number(coupon.min_order_amount)) {
                return res.status(400).json({ 
                    error: `Mã giảm giá này chỉ áp dụng cho đơn hàng tối thiểu từ ${Number(coupon.min_order_amount).toLocaleString('vi-VN')} đ` 
                });
            }

            // 7. Tính số tiền được giảm
            let discountAmount = 0;
            if (coupon.discount_type === 'PERCENT') {
                discountAmount = (amount * Number(coupon.discount_value)) / 100;
                if (coupon.max_discount_amount && discountAmount > Number(coupon.max_discount_amount)) {
                    discountAmount = Number(coupon.max_discount_amount);
                }
            } else if (coupon.discount_type === 'FIXED') {
                discountAmount = Number(coupon.discount_value);
                if (discountAmount > amount) {
                    discountAmount = amount; // Không giảm vượt quá giá trị đơn hàng
                }
            }

            res.status(200).json({
                message: 'Áp dụng mã giảm giá thành công!',
                data: {
                    id: coupon.id,
                    code: coupon.code,
                    discount_type: coupon.discount_type,
                    discount_value: Number(coupon.discount_value),
                    discountAmount: Math.round(discountAmount)
                }
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // ==========================================
    // ADMIN: CRUD Coupon management
    // ==========================================

    // GET /api/coupons (Admin only - lấy tất cả coupon)
    static async getAllCoupons(req, res) {
        try {
            const coupons = await Coupon.getAll();
            res.status(200).json({ data: coupons });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // POST /api/coupons (Admin - tạo coupon mới)
    static async createCoupon(req, res) {
        try {
            const { code, discount_type, discount_value, min_order_amount, max_discount_amount, start_date, end_date, usage_limit } = req.body;

            if (!code || !discount_type || !discount_value || !end_date) {
                return res.status(400).json({ error: 'Vui lòng điền đầy đủ: Mã, Loại giảm, Giá trị giảm, Ngày kết thúc' });
            }

            if (!['PERCENT', 'FIXED'].includes(discount_type)) {
                return res.status(400).json({ error: 'Loại giảm giá phải là PERCENT hoặc FIXED' });
            }

            const coupon = await Coupon.create({ code, discount_type, discount_value, min_order_amount, max_discount_amount, start_date, end_date, usage_limit });
            res.status(201).json({ message: 'Tạo mã giảm giá thành công!', data: coupon });
        } catch (error) {
            if (error.code === '23505') { // Unique constraint violation
                return res.status(400).json({ error: 'Mã giảm giá này đã tồn tại trong hệ thống' });
            }
            res.status(500).json({ error: error.message });
        }
    }

    // PUT /api/coupons/:id (Admin - cập nhật coupon)
    static async updateCoupon(req, res) {
        try {
            const { id } = req.params;
            const { code, discount_type, discount_value, min_order_amount, max_discount_amount, start_date, end_date, usage_limit, is_active } = req.body;

            if (!code || !discount_type || !discount_value || !end_date) {
                return res.status(400).json({ error: 'Vui lòng điền đầy đủ: Mã, Loại giảm, Giá trị giảm, Ngày kết thúc' });
            }

            const coupon = await Coupon.update(id, { code, discount_type, discount_value, min_order_amount, max_discount_amount, start_date, end_date, usage_limit, is_active });
            if (!coupon) return res.status(404).json({ error: 'Không tìm thấy mã giảm giá' });

            res.status(200).json({ message: 'Cập nhật mã giảm giá thành công!', data: coupon });
        } catch (error) {
            if (error.code === '23505') {
                return res.status(400).json({ error: 'Mã giảm giá này đã tồn tại trong hệ thống' });
            }
            res.status(500).json({ error: error.message });
        }
    }

    // PATCH /api/coupons/:id/toggle (Admin - bật/tắt coupon nhanh)
    static async toggleCoupon(req, res) {
        try {
            const { id } = req.params;
            const { is_active } = req.body;

            const coupon = await Coupon.toggleActive(id, is_active);
            if (!coupon) return res.status(404).json({ error: 'Không tìm thấy mã giảm giá' });

            res.status(200).json({ 
                message: `Đã ${is_active ? 'kích hoạt' : 'vô hiệu hóa'} mã giảm giá thành công!`, 
                data: coupon 
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // DELETE /api/coupons/:id (Admin - xóa coupon)
    static async deleteCoupon(req, res) {
        try {
            const { id } = req.params;
            const deleted = await Coupon.delete(id);
            if (!deleted) return res.status(404).json({ error: 'Không tìm thấy mã giảm giá' });

            res.status(200).json({ message: `Đã xóa mã giảm giá ID=${id} thành công!` });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = CouponController;
