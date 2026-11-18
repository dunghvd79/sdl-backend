// Kết nối đang rảnh trong pool bị DB cắt (Neon tạm dừng khi vắng khách, mạng chập...) → pg phát
// sự kiện 'error' trên pool. Không có listener thì Node coi là lỗi không ai bắt và tắt cả server.
const pool = require('../src/config/database');
const { resetDb, closeAll } = require('./helpers/db');

afterAll(async () => {
    await closeAll();
});

beforeEach(async () => {
    await resetDb();
});

afterEach(() => {
    jest.restoreAllMocks();
});

async function waitFor(check, timeoutMs = 3000) {
    const start = Date.now();
    while (!check()) {
        if (Date.now() - start > timeoutMs) throw new Error('Hết thời gian chờ');
        await new Promise(r => setTimeout(r, 20));
    }
}

test('kết nối rảnh bị DB cắt → ghi log, server không sập, pool vẫn chạy', async () => {
    const logged = jest.spyOn(console, 'error').mockImplementation(() => {});
    const idle = await pool.connect();
    const killer = await pool.connect();
    const pid = idle.processID;
    idle.release(); // trở thành kết nối rảnh trong pool

    await killer.query('SELECT pg_terminate_backend($1)', [pid]);
    killer.release();
    await waitFor(() => logged.mock.calls.some(args => String(args[0]).startsWith('[db]')));

    const { rows } = await pool.query('SELECT 1 AS ok');
    expect(rows[0].ok).toBe(1);
});
