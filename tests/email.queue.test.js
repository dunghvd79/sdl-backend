// Hàng đợi email BullMQ:
// B80 kết nối TLS tới Redis phải kiểm chứng chỉ;
// B81 Redis chết thì thêm job phải báo lỗi nhanh để nhánh "gửi mail trực tiếp" chạy, không treo request;
// B82 job chứa token đặt lại mật khẩu GỐC (DB chỉ lưu băm) → job lỗi không được nằm lại trong Redis, log không in email.
const DEAD_REDIS_URL = 'redis://127.0.0.1:6399'; // không có gì nghe ở cổng này
const EMAIL = 'nguoi.nhan@test.vn';

// unref: bộ hẹn giờ làm mốc trong Promise.race không giữ tiến trình Jest khi bên kia đã xong
const sleep = ms => new Promise(r => setTimeout(r, ms).unref());

// EmailService giả dùng chung cho cả file: emailQueue.js require EmailService LÚC CHẠY (nhánh gửi trực tiếp), ngoài
// isolateModules → mock theo từng lần nạp sẽ bị bộ nhớ đệm module giữ lại. Mỗi test tự đặt hành vi cho mockSend.
const mockSend = jest.fn();
jest.mock('../src/services/emailService', () => ({ sendResetPasswordEmail: (...args) => mockSend(...args) }));

// Nạp module hàng đợi với REDIS_URL riêng (connection.js đọc biến lúc require)
function loadQueue(redisUrl) {
    const saved = process.env.REDIS_URL;
    process.env.REDIS_URL = redisUrl;
    let mods;
    jest.isolateModules(() => {
        mods = {
            ...require('../src/queues/emailQueue'),
            ...require('../src/queues/emailWorker')
        };
    });
    process.env.REDIS_URL = saved;
    return mods;
}

function loggedText(...spies) {
    return spies.flatMap(s => s.mock.calls).map(args => args.map(String).join(' ')).join('\n');
}

let logSpy;
let errorSpy;
const toClose = [];

beforeEach(() => {
    mockSend.mockReset();
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
    jest.restoreAllMocks();
    // Với Redis không tồn tại, close() / disconnect() của BullMQ chờ kết nối sẵn sàng nên không bao giờ xong → cắt
    // thẳng client ioredis bên dưới (dừng vòng thử kết nối lại), nếu không Jest không thoát được.
    while (toClose.length) {
        const item = toClose.pop();
        await Promise.race([item.close(), sleep(1000)]);
        for (const conn of [item.connection, item.blockingConnection]) {
            if (conn && conn._client) conn._client.disconnect();
        }
    }
});

describe('B80: TLS tới Redis', () => {
    test('rediss:// bật TLS và KHÔNG tắt kiểm tra chứng chỉ', () => {
        // Chỉ nạp cấu hình kết nối (không tạo Queue → không mở kết nối mạng ra ngoài)
        const saved = process.env.REDIS_URL;
        process.env.REDIS_URL = 'rediss://default:mat-khau-gia@vi-du.upstash.io:6379';
        let connection;
        jest.isolateModules(() => { connection = require('../src/queues/connection'); });
        process.env.REDIS_URL = saved;

        expect(connection.tls).toBeDefined();
        expect(connection.tls.rejectUnauthorized).not.toBe(false);
    });
});

describe('B81: Redis chết khi thêm job', () => {
    test('không treo: báo lỗi nhanh rồi gửi mail trực tiếp', async () => {
        mockSend.mockResolvedValue({ id: 'gui-truc-tiep' });
        const { queueResetPasswordEmail, emailQueue } = loadQueue(DEAD_REDIS_URL);
        toClose.push(emailQueue);

        const started = Date.now();
        const result = await Promise.race([queueResetPasswordEmail(EMAIL, 'token-goc', 'Nguoi Nhan'), sleep(5000).then(() => 'TREO')]);

        expect(result).not.toBe('TREO');
        expect(mockSend).toHaveBeenCalledWith(EMAIL, 'token-goc', 'Nguoi Nhan');
        expect(Date.now() - started).toBeLessThan(5000);
    });
});

describe('B82: token gốc và email không nằm lại trong Redis / log', () => {
    test('job gửi lỗi bị xoá khỏi Redis ngay; log không in email', async () => {
        mockSend.mockRejectedValue(new Error('Resend từ chối'));
        const { emailQueue, startEmailWorker } = loadQueue(process.env.REDIS_URL);
        toClose.push(emailQueue);
        const worker = startEmailWorker();
        toClose.push(worker);

        const failed = new Promise(resolve => worker.on('failed', resolve));
        const job = await emailQueue.add('sendResetPassword', { toEmail: EMAIL, resetToken: 'token-goc', userName: 'A' }, { attempts: 1 });
        await failed;
        await sleep(200);

        expect(await emailQueue.getJob(job.id)).toBeUndefined();
        expect(loggedText(logSpy, errorSpy)).not.toContain(EMAIL);
    });

    test('thêm job và gửi thành công: log không in email', async () => {
        mockSend.mockResolvedValue({ id: 'ok' });
        const { emailQueue, startEmailWorker, queueResetPasswordEmail } = loadQueue(process.env.REDIS_URL);
        toClose.push(emailQueue);
        const worker = startEmailWorker();
        toClose.push(worker);

        const completed = new Promise(resolve => worker.on('completed', resolve));
        await queueResetPasswordEmail(EMAIL, 'token-goc', 'Nguoi Nhan');
        await completed;

        expect(mockSend).toHaveBeenCalledWith(EMAIL, 'token-goc', 'Nguoi Nhan');
        expect(loggedText(logSpy, errorSpy)).not.toContain(EMAIL);
    });
});
