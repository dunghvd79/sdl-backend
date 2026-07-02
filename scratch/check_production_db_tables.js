const { Pool } = require('pg');

const productionConnectionString = 'postgresql://sdl_database_new_user:XvBZdbja7OJ9F4TlTJoNNbVX9DqiebFD@dpg-d8v159cm0tmc738p8bsg-a.singapore-postgres.render.com/sdl_database_new';

const pool = new Pool({
    connectionString: productionConnectionString,
    ssl: {
        rejectUnauthorized: false
    }
});

async function checkTables() {
    console.log('=== KHẢO SÁT CÁC BẢNG TRÊN DATABASE PRODUCTION ===');
    const client = await pool.connect();
    
    try {
        // 1. Liệt kê tất cả các bảng
        const tablesRes = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
            ORDER BY table_name;
        `);
        console.log('\n📊 Các bảng hiện tại trong DB:');
        console.log(tablesRes.rows.map(r => r.table_name));

        // 2. Kiểm tra schema của bảng payments (nếu có)
        const hasPayments = tablesRes.rows.some(r => r.table_name === 'payments');
        if (hasPayments) {
            console.log('\n🔍 Bảng "payments" ĐÃ TỒN TẠI. Chi tiết các cột:');
            const colRes = await client.query(`
                SELECT column_name, data_type, is_nullable
                FROM information_schema.columns
                WHERE table_name = 'payments'
                ORDER BY ordinal_position;
            `);
            console.table(colRes.rows);
        } else {
            console.log('\n❌ Lỗi: Bảng "payments" KHÔNG TỒN TẠI trên Production!');
        }

    } catch (err) {
        console.error('❌ Lỗi:', err.message);
    } finally {
        client.release();
        await pool.end();
        console.log('\n🔌 Kết nối đóng.');
    }
}

checkTables();
