const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const productionConnectionString = 'postgresql://sdl_database_new_user:XvBZdbja7OJ9F4TlTJoNNbVX9DqiebFD@dpg-d8v159cm0tmc738p8bsg-a.singapore-postgres.render.com/sdl_database_new';

const pool = new Pool({
    connectionString: productionConnectionString,
    ssl: {
        rejectUnauthorized: false
    }
});

async function seedProductionUsers() {
    const password = 'pasword123'; // Chú ý: pasword123 (chỉ có 1 chữ s)
    const passwordHash = await bcrypt.hash(password, 10);

    const testUsers = [
        { email: 'admin@test.vn', fullName: 'Quản trị viên', role: 'ADMIN' },
        { email: 'curator@test.vn', fullName: 'Người quản thủ', role: 'CURATOR' },
        { email: 'customer@test.vn', fullName: 'Khách hàng', role: 'CUSTOMER' }
    ];

    try {
        console.log('⏳ Đang tạo 3 tài khoản thử nghiệm trên Production...');
        for (const user of testUsers) {
            const userQuery = `
                INSERT INTO users (email, password_hash, role, is_active)
                VALUES ($1, $2, $3, true)
                ON CONFLICT (email) 
                DO UPDATE SET 
                password_hash = EXCLUDED.password_hash,
                role = EXCLUDED.role,
                is_active = true
                RETURNING id, email, role;
            `;
            const res = await pool.query(userQuery, [user.email, passwordHash, user.role]);
            const userId = res.rows[0].id;

            const profileQuery = `
                INSERT INTO user_profiles (user_id, full_name)
                VALUES ($1, $2)
                ON CONFLICT (user_id)
                DO UPDATE SET
                full_name = EXCLUDED.full_name;
            `;
            await pool.query(profileQuery, [userId, user.fullName]);

            console.log(`✅ Đã tạo tài khoản: ${res.rows[0].email} [${res.rows[0].role}]`);
        }
        console.log('\n🎉 Khởi tạo tài khoản trên Production thành công!');
        console.log(`Mật khẩu đăng nhập cho cả 3 tài khoản là: ${password}`);
    } catch (err) {
        console.error('❌ Lỗi khi khởi tạo tài khoản trên Production:', err.message);
    } finally {
        await pool.end();
    }
}

seedProductionUsers();
