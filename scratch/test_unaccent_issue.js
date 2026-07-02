const pool = require('../src/config/database');

async function testQuery() {
    try {
        const query1 = `SELECT to_tsquery('simple', immutable_unaccent('Mắt:* & Biếc:*')) as q1;`;
        const res1 = await pool.query(query1);
        console.log('Result 1 (Mắt Biếc):', res1.rows[0].q1);

        const query2 = `SELECT to_tsquery('simple', immutable_unaccent('Mắt:* & Biế:*')) as q2;`;
        const res2 = await pool.query(query2);
        console.log('Result 2 (Mắt Biế):', res2.rows[0].q2);
    } catch(e) {
        console.error(e);
    } finally {
        pool.end();
    }
}

testQuery();
