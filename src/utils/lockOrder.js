// B72: mọi luồng khoá NHIỀU dòng kho trong một transaction phải khoá theo cùng một thứ tự — book_id tăng dần.
// Hai transaction khoá cùng các dòng theo thứ tự ngược nhau sẽ chờ nhau (deadlock) → Postgres huỷ một bên (40P01).
// Trả bản sao đã sắp xếp, không đổi mảng gốc.
function sortByBookId(items, key = 'bookId') {
    return [...items].sort((x, y) => Number(x[key]) - Number(y[key]));
}

module.exports = { sortByBookId };
