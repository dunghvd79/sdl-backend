const Book = require('../src/models/Book');
const pool = require('../src/config/database');

async function test() {
    try {
        console.log('Testing "Mắt Biếc"...');
        const books1 = await Book.getAll({ search: 'Mắt Biếc' });
        console.log('Result for "Mắt Biếc":', books1.map(b => b.title));

        console.log('\nTesting "Mắt Biế"...');
        const books2 = await Book.getAll({ search: 'Mắt Biế' });
        console.log('Result for "Mắt Biế":', books2.map(b => b.title));
    } catch(e) {
        console.error(e);
    } finally {
        pool.end();
    }
}

test();
