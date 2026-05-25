const pool = require('./src/config/database');

const categories = [
    'Văn học',
    'Kỹ năng sống',
    'Tiểu thuyết',
    'Kinh tế - Tài chính',
    'Truyện tranh',
    'Khoa học - Viễn tưởng',
    'Tâm lý',
    'Lịch sử',
    'Tiểu sử - Hồi ký',
    'Thiếu nhi'
];

(async () => {
    try {
        for (const name of categories) {
            await pool.query('INSERT INTO categories (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [name]);
        }
        console.log('Đã thêm thành công các thể loại sách đa dạng!');
    } catch(e) {
        console.error(e);
    } finally {
        pool.end();
    }
})();
