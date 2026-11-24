// B84: mọi khoá ngoại phải có index bắt đầu bằng đúng các cột của nó. Postgres KHÔNG tự tạo index cho khoá ngoại
// (chỉ cho PRIMARY KEY / UNIQUE) → subquery json_agg tra bảng con theo từng dòng cha (N+1 bên trong DB) và
// ON DELETE CASCADE đều phải quét cả bảng con. DB test dựng từ tests/fixtures/schema.sql.
const pool = require('../src/config/database');
const { FK_INDEXES } = require('../src/config/indexes');

// Chỉ dùng Postgres: không gọi closeAll() — nó nạp Redis / BullMQ lần đầu ngay lúc dọn, kết nối mở muộn giữ Jest lại
afterAll(() => pool.end());

test('mọi khoá ngoại đều có index', async () => {
    // Index "phủ" một khoá ngoại khi các cột đầu của index trùng đúng thứ tự các cột của khoá ngoại
    const { rows } = await pool.query(`
        SELECT c.conrelid::regclass::text AS tbl,
               (SELECT string_agg(a.attname, ',' ORDER BY k.ord)
                  FROM unnest(c.conkey) WITH ORDINALITY k(attnum, ord)
                  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum) AS cols
        FROM pg_constraint c
        WHERE c.contype = 'f'
          AND c.connamespace = 'public'::regnamespace
          AND NOT EXISTS (
              SELECT 1 FROM pg_index i
              WHERE i.indrelid = c.conrelid
                AND (SELECT array_agg(x ORDER BY o) FROM unnest(i.indkey::int2[]) WITH ORDINALITY u(x, o)
                      WHERE o <= array_length(c.conkey, 1))
                  = (SELECT array_agg(x ORDER BY o) FROM unnest(c.conkey) WITH ORDINALITY u(x, o))
          )
        ORDER BY 1, 2
    `);

    expect(rows.map(r => `${r.tbl}(${r.cols})`)).toEqual([]);
});

test('index khai báo cho migration production có mặt trong schema test', async () => {
    const { rows } = await pool.query("SELECT indexname FROM pg_indexes WHERE schemaname = 'public'");
    const existing = new Set(rows.map(r => r.indexname));

    expect(FK_INDEXES.map(i => i.name).filter(name => !existing.has(name))).toEqual([]);
});
