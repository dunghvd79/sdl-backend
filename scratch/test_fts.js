const Book = require('../src/models/Book');
const pool = require('../src/config/database');

async function testFts() {
    console.log('🧪 Bắt đầu chạy thử nghiệm PostgreSQL Full-Text Search...');
    try {
        const tests = ['dac nhan tam', 'hoa vang', 'thong minh', 'mat biec', 'keigo'];

        for (const keyword of tests) {
            console.log(`\n🔎 Tìm kiếm với từ khóa: "${keyword}"`);
            const books = await Book.getAll({ search: keyword });
            console.log(`📋 Kết quả tìm được (${books.length} sách):`);
            books.forEach((book, index) => {
                console.log(`${index + 1}. [ID: ${book.id}] Title: "${book.title}", Author: "${book.author}"`);
            });
        }
    } catch (err) {
        console.error('❌ Lỗi kiểm thử FTS:', err);
    } finally {
        // Đợi 2 giây trước khi đóng pool để tránh lỗi kết nối trong database.js migrations
        setTimeout(() => {
            pool.end();
        }, 2000);
    }
}

testFts();
