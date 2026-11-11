const { Pool } = require('pg');

require('dotenv').config();
const productionConnectionString = process.env.PROD_DATABASE_URL;
if (!productionConnectionString) { console.error('❌ Thiếu biến môi trường PROD_DATABASE_URL (chuỗi kết nối Neon). Xem database/README.md.'); process.exit(1); }

const pool = new Pool({
    connectionString: productionConnectionString,
    ssl: {
        rejectUnauthorized: false
    }
});

async function findColumns() {
    try {
        console.log('🔍 Đang kiểm tra tất cả các cột trong Database Production...');
        
        // Truy vấn tất cả các cột có tên chứa chữ 'fullname' hoặc 'fullName' hoặc tương tự
        const query = `
            SELECT table_name, column_name, data_type 
            FROM information_schema.columns 
            WHERE table_schema = 'public' 
              AND (column_name ILIKE '%fullname%' OR column_name ILIKE '%full_name%');
        `;
        const res = await pool.query(query);
        console.log('\n📊 Kết quả tìm kiếm cột Họ Tên:');
        console.table(res.rows);

        // Truy vấn xem có cột nào viết hoa chính xác là "fullName" không
        const queryExact = `
            SELECT table_name, column_name 
            FROM information_schema.columns 
            WHERE table_schema = 'public' 
              AND column_name = 'fullName';
        `;
        const resExact = await pool.query(queryExact);
        console.log('\n🎯 Cột viết hoa chính xác là "fullName":');
        console.table(resExact.rows);

        // Hãy liệt kê toàn bộ các cột của bảng books và users để kiểm tra cấu trúc hiện tại
        const booksCols = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'books';
        `);
        console.log('\n📚 Cấu trúc bảng books hiện tại:');
        console.table(booksCols.rows);

        const usersCols = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'users';
        `);
        console.log('\n👤 Cấu trúc bảng users hiện tại:');
        console.table(usersCols.rows);

    } catch (err) {
        console.error('❌ Lỗi truy vấn:', err.message);
    } finally {
        await pool.end();
    }
}

findColumns();
