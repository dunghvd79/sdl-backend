// B88: không có hai index giống hệt nhau trên cùng một bảng (cùng cột, cùng thứ tự). Index trùng không giúp gì khi
// đọc nhưng mỗi lần ghi phải cập nhật cả hai. Trước đây migration thêm `unique_*` trong khi bảng đã có UNIQUE gốc.
const pool = require('../src/config/database');
const { DUPLICATE_INDEXES, dropDuplicateIndexSql } = require('../src/config/indexes');

// Chỉ dùng Postgres: không gọi closeAll() (xem tests/db.fk-indexes.test.js)
afterAll(() => pool.end());

test('schema không có index trùng lặp', async () => {
    const { rows } = await pool.query(`
        SELECT i.indrelid::regclass::text AS tbl,
               string_agg(i.indexrelid::regclass::text, ' = ' ORDER BY i.indexrelid::regclass::text) AS same
        FROM pg_index i
        JOIN pg_class t ON t.oid = i.indrelid AND t.relnamespace = 'public'::regnamespace
        WHERE i.indexprs IS NULL AND i.indpred IS NULL
        GROUP BY i.indrelid, i.indkey::text
        HAVING COUNT(*) > 1
        ORDER BY 1
    `);

    expect(rows.map(r => `${r.tbl}: ${r.same}`)).toEqual([]);
});

describe('migration xoá index trùng (chạy trên production)', () => {
    const T = 'b88_tmp';

    beforeEach(() => pool.query(`DROP TABLE IF EXISTS ${T}; CREATE TABLE ${T} (a INT, b INT)`));
    afterAll(() => pool.query(`DROP TABLE IF EXISTS ${T}`));

    async function indexNames() {
        const { rows } = await pool.query('SELECT indexname FROM pg_indexes WHERE tablename = $1 ORDER BY 1', [T]);
        return rows.map(r => r.indexname);
    }

    test('ràng buộc UNIQUE trùng với UNIQUE gốc → xoá bản thừa, giữ bản gốc', async () => {
        await pool.query(`ALTER TABLE ${T} ADD CONSTRAINT ${T}_a_b_key UNIQUE (a, b)`);
        await pool.query(`ALTER TABLE ${T} ADD CONSTRAINT ${T}_dup UNIQUE (a, b)`);

        await pool.query(dropDuplicateIndexSql({ table: T, name: `${T}_dup`, constraint: true }));

        expect(await indexNames()).toEqual([`${T}_a_b_key`]);
    });

    test('KHÔNG có bản tương đương → giữ nguyên (không bao giờ làm mất ràng buộc UNIQUE)', async () => {
        await pool.query(`ALTER TABLE ${T} ADD CONSTRAINT ${T}_dup UNIQUE (a, b)`);
        await pool.query(`CREATE INDEX ${T}_a_plain ON ${T} (a, b)`); // không unique → không thay được ràng buộc UNIQUE

        await pool.query(dropDuplicateIndexSql({ table: T, name: `${T}_dup`, constraint: true }));

        expect(await indexNames()).toEqual([`${T}_a_plain`, `${T}_dup`]);
    });

    test('index thường trùng với UNIQUE cùng cột → xoá index thường', async () => {
        await pool.query(`ALTER TABLE ${T} ADD CONSTRAINT ${T}_a_key UNIQUE (a)`);
        await pool.query(`CREATE INDEX ${T}_a_idx ON ${T} (a)`);

        await pool.query(dropDuplicateIndexSql({ table: T, name: `${T}_a_idx`, constraint: false }));

        expect(await indexNames()).toEqual([`${T}_a_key`]);
    });

    test('index không tồn tại → không lỗi', async () => {
        await expect(pool.query(dropDuplicateIndexSql({ table: T, name: 'khong_co_index_nay', constraint: true })))
            .resolves.toBeDefined();
    });

    test('danh sách cần xoá trên production đúng 5 index đã phát hiện', () => {
        expect(DUPLICATE_INDEXES.map(i => `${i.table}.${i.name}`)).toEqual([
            'cart_items.unique_cart_book',
            'inventory.unique_inventory_book',
            'coupons.unique_coupons_code',
            'reviews.unique_book_user_review',
            'users.idx_users_email'
        ]);
    });
});
