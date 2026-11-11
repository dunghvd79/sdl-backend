// Tiện ích dùng chung cho test: dọn dữ liệu, tạo user, đóng kết nối.
const pool = require('../../src/config/database');
const User = require('../../src/models/User');

function assertTestDatabase() {
    if (process.env.NODE_ENV !== 'test' || process.env.DB_NAME !== 'sdl_test') {
        throw new Error('Tiện ích test chỉ được chạy trên DB sdl_test với NODE_ENV=test');
    }
}

// Xoá sạch dữ liệu mọi bảng (giữ schema) và đặt lại các sequence id.
async function resetDb() {
    assertTestDatabase();
    const { rows } = await pool.query(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
    );
    if (rows.length === 0) return;
    const tables = rows.map(r => `"${r.tablename}"`).join(', ');
    await pool.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);

    const { client: redisClient, isConnected } = require('../../src/config/redis');
    if (redisClient && isConnected()) {
        await redisClient.flushDb();
    }
}

// Tạo user qua chính model của app (mật khẩu được băm như thật).
async function createUser({
    email = 'customer@test.vn',
    password = 'password123',
    fullName = 'Khach Hang Test',
    role = 'CUSTOMER'
} = {}) {
    assertTestDatabase();
    const user = await User.create({ email, password, fullName, role });
    return { ...user, password };
}

// Đóng mọi kết nối mở để Jest thoát gọn.
async function closeAll() {
    const { emailQueue } = require('../../src/queues/emailQueue');
    await emailQueue.close();

    const { client: redisClient } = require('../../src/config/redis');
    if (redisClient && redisClient.isOpen) {
        await redisClient.close();
    }

    await pool.end();
}

module.exports = { resetDb, createUser, closeAll };
