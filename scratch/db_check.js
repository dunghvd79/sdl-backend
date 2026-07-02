const pool = require('../src/config/database');

async function check() {
    try {
        const res = await pool.query('SELECT id, email, role, is_active FROM users');
        console.log('USERS IN DB:');
        console.log(res.rows);
    } catch (err) {
        console.error('ERROR:', err);
    } finally {
        pool.end();
    }
}

check();
