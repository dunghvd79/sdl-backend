const { Pool } = require('pg');

const productionConnectionString = 'postgresql://sdl_database_new_user:XvBZdbja7OJ9F4TlTJoNNbVX9DqiebFD@dpg-d8v159cm0tmc738p8bsg-a.singapore-postgres.render.com/sdl_database_new';

const pool = new Pool({
    connectionString: productionConnectionString,
    ssl: {
        rejectUnauthorized: false
    }
});

async function createPaymentsTable() {
    console.log('=== TIẾN HÀNH TẠO BẢNG PAYMENTS TRÊN PRODUCTION ===');
    const client = await pool.connect();
    
    try {
        const createQuery = `
            CREATE TABLE IF NOT EXISTS payments (
                id SERIAL PRIMARY KEY,
                order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
                amount DECIMAL(10, 2) NOT NULL,
                payment_method VARCHAR(50) DEFAULT 'MOCK_GATEWAY',
                status VARCHAR(50) DEFAULT 'PENDING',
                transaction_id VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;
        await client.query(createQuery);
        console.log('✅ Đã tạo thành công bảng "payments".');

        // Xác nhận lại bảng
        const checkQuery = `
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name = 'payments';
        `;
        const res = await client.query(checkQuery);
        if (res.rows.length > 0) {
            console.log('🔍 Xác nhận: Bảng "payments" hiện đã tồn tại trên Production DB.');
        } else {
            console.log('❌ Lỗi: Không tìm thấy bảng "payments" sau khi thực thi SQL.');
        }

    } catch (err) {
        console.error('❌ Lỗi thực thi:', err.message);
    } finally {
        client.release();
        await pool.end();
        console.log('🔌 Kết nối đóng.');
    }
}

createPaymentsTable();
