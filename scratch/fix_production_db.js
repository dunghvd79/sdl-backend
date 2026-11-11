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

async function run() {
    try {
        console.log('⏳ Connecting to production database...');
        const nowRes = await pool.query('SELECT NOW()');
        console.log('✅ Connected successfully at:', nowRes.rows[0].now);

        // 1. Inspect existing columns of the 'users' table
        const colsRes = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'users'
        `);
        const columns = colsRes.rows.map(r => r.column_name);
        console.log('📊 Current production "users" table columns:', columns.join(', '));

        // 2. Add missing security/session columns if they don't exist
        const columnsToMigrate = [
            { name: 'session_id', type: 'VARCHAR(255)' },
            { name: 'reset_password_token', type: 'VARCHAR(255)' },
            { name: 'reset_password_expires', type: 'TIMESTAMP' }
        ];

        for (const col of columnsToMigrate) {
            if (!columns.includes(col.name)) {
                console.log(`➕ Column "${col.name}" is missing. Adding it...`);
                await pool.query(`
                    ALTER TABLE users 
                    ADD COLUMN IF NOT EXISTS ${col.name} ${col.type};
                `);
                console.log(`✅ Column "${col.name}" added successfully.`);
            } else {
                console.log(`ℹ️ Column "${col.name}" already exists.`);
            }
        }

        // 3. Verify columns again
        const verifyRes = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'users'
        `);
        console.log('📊 Verified production "users" columns:', verifyRes.rows.map(r => r.column_name).join(', '));

    } catch (err) {
        console.error('❌ Error executing database script:', err.message);
    } finally {
        await pool.end();
        console.log('🔌 Connection closed.');
    }
}

run();
