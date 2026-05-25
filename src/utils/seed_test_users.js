const pool = require('../config/database');
const bcrypt = require('bcryptjs');

async function seedTestUsers() {
    const password = 'pasword123';
    const passwordHash = await bcrypt.hash(password, 10);

    const testUsers = [
        { email: 'admin@test.vn', fullName: 'Quản trị viên', role: 'ADMIN' },
        { email: 'curator@test.vn', fullName: 'Người quản thủ', role: 'CURATOR' },
        { email: 'customer@test.vn', fullName: 'Khách hàng', role: 'CUSTOMER' }
    ];

    try {
        console.log('⏳ Dang tao 3 tai khoan thu nghiem...');
        for (const user of testUsers) {
            const query = `
                INSERT INTO users (email, password_hash, full_name, role, is_active)
                VALUES ($1, $2, $3, $4, true)
                ON CONFLICT (email) 
                DO UPDATE SET 
                    password_hash = EXCLUDED.password_hash,
                    full_name = EXCLUDED.full_name,
                    role = EXCLUDED.role,
                    is_active = true
                RETURNING id, email, role;
            `;
            const res = await pool.query(query, [user.email, passwordHash, user.fullName, user.role]);
            console.log(`✅ Da tao/cap nhat tai khoan: ${res.rows[0].email} [${res.rows[0].role}]`);
        }
        console.log('\n🎉 Da khoi tao thanh cong 3 tai khoan local test!');
        console.log(`Mat khau chung cho ca 3 tai khoan la: ${password}`);
    } catch (err) {
        console.error('❌ Loi khi khoi tao tai khoan test:', err.message);
    } finally {
        pool.end();
    }
}

seedTestUsers();
