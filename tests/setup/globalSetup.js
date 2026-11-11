// Chạy MỘT lần trước toàn bộ bộ test: tạo lại DB `sdl_test` sạch và nạp schema.
// Schema lấy từ tests/fixtures/schema.sql (pg_dump --schema-only của DB local, không có dữ liệu).
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const cfg = require('./testConfig');

module.exports = async () => {
    if (cfg.DB_NAME !== 'sdl_test' || cfg.DB_HOST !== 'localhost') {
        throw new Error(`Từ chối chạy test: DB đích phải là localhost/sdl_test, đang là ${cfg.DB_HOST}/${cfg.DB_NAME}`);
    }

    const base = {
        host: cfg.DB_HOST,
        port: Number(cfg.DB_PORT),
        user: cfg.DB_USER,
        password: cfg.DB_PASSWORD
    };

    const admin = new Client({ ...base, database: 'postgres' });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${cfg.DB_NAME} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${cfg.DB_NAME}`);
    await admin.end();

    const schema = fs.readFileSync(path.join(__dirname, '../fixtures/schema.sql'), 'utf8');
    const db = new Client({ ...base, database: cfg.DB_NAME });
    await db.connect();
    await db.query(schema);
    await db.end();
};
