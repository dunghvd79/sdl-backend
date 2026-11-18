// B70: luật "không bán vượt" được giữ ở cả tầng DB, không chỉ trong code. Một lỗi code sau này
// (quên khoá dòng, trừ hai lần...) phải bị DB từ chối thay vì âm thầm ghi kho âm.
const pool = require('../src/config/database');
const { resetDb, closeAll } = require('./helpers/db');
const { createBook } = require('./helpers/fixtures');

const CHECK_VIOLATION = '23514';

afterAll(async () => {
    await closeAll();
});

let bookId;

beforeEach(async () => {
    await resetDb();
    bookId = await createBook({ stock: 2 });
});

function setInventory(fields) {
    const cols = Object.keys(fields);
    const assignments = cols.map((c, i) => `${c} = $${i + 2}`).join(', ');
    return pool.query(`UPDATE inventory SET ${assignments} WHERE book_id = $1`, [bookId, ...Object.values(fields)]);
}

describe('ràng buộc bảng inventory', () => {
    test.each([
        ['tồn kho âm', { available_qty: -1 }],
        ['giữ chỗ âm', { reserved_qty: -1 }],
        ['đã bán âm', { sold_qty: -1 }],
        ['giữ chỗ nhiều hơn tồn kho', { reserved_qty: 3 }],
    ])('%s → DB từ chối', async (_label, fields) => {
        await expect(setInventory(fields)).rejects.toMatchObject({ code: CHECK_VIOLATION });
    });

    test('giữ chỗ đúng bằng tồn kho vẫn hợp lệ', async () => {
        await setInventory({ reserved_qty: 2 });
        const { rows: [row] } = await pool.query('SELECT reserved_qty FROM inventory WHERE book_id = $1', [bookId]);
        expect(row.reserved_qty).toBe(2);
    });
});
