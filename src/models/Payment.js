const pool = require('../config/database');

class Payment {
    // 1. Tạo bản ghi giao dịch mới (Khi khách bắt đầu bấm "Thanh toán")
    static async create(orderId, amount, paymentMethod = 'MOCK_GATEWAY') {
        const query = `
      INSERT INTO payments (order_id, amount, payment_method, status)
      VALUES ($1, $2, $3, 'PENDING')
      RETURNING *
    `;
        const result = await pool.query(query, [orderId, amount, paymentMethod]);
        return result.rows[0];
    }

    // 2. Cập nhật trạng thái giao dịch (Khi VNPay/Momo gọi Webhook báo kết quả)
    static async updateStatus(paymentId, transactionId, status) {
        const query = `
      UPDATE payments 
      SET transaction_id = $2, status = $3 
      WHERE id = $1
      RETURNING *
    `;
        const result = await pool.query(query, [paymentId, transactionId, status]);
        return result.rows[0];
    }

    // 3. Tìm giao dịch theo Order ID
    static async findByOrderId(orderId) {
        const query = 'SELECT * FROM payments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1';
        const result = await pool.query(query, [orderId]);
        return result.rows[0] || null;
    }
}

module.exports = Payment;