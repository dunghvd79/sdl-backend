// B82 (phần EmailService): log gửi mail không in địa chỉ email người nhận — chỉ in mã thư của Resend để tra cứu.
jest.mock('axios', () => ({ post: jest.fn() }));
const axios = require('axios');
const EmailService = require('../src/services/emailService');

const EMAIL = 'nguoi.nhan@test.vn';

beforeEach(() => {
    process.env.RESEND_API_KEY = 're_test_key';
    axios.post.mockReset();
});

afterEach(() => {
    delete process.env.RESEND_API_KEY;
    jest.restoreAllMocks();
});

test('gửi thành công: log có mã thư của Resend, không có email người nhận', async () => {
    axios.post.mockResolvedValue({ data: { id: 're_msg_123' } });
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await EmailService.sendResetPasswordEmail(EMAIL, 'token-goc', 'Nguoi Nhan');

    expect(axios.post.mock.calls[0][1].to).toBe(EMAIL); // vẫn gửi đúng người
    const logged = logSpy.mock.calls.map(args => args.join(' ')).join('\n');
    expect(logged).toContain('re_msg_123');
    expect(logged).not.toContain(EMAIL);
});
