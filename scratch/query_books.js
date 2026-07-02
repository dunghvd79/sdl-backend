const pool = require('../src/config/database');

async function main() {
  try {
    const res = await pool.query('SELECT id, title, author, price FROM books');
    console.log('Books in Database:', res.rows);
  } catch (err) {
    console.error('Error querying books:', err);
  } finally {
    await pool.end();
  }
}

main();
