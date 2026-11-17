// B53 + B60 — Kiểm tra cấu hình lúc khởi động: thiếu thứ bắt buộc thì dừng ngay (fail fast),
// cấu hình sai khiến tính năng hỏng âm thầm thì cảnh báo rõ trong log.
const { checkEnv, assertEnv } = require('../src/config/env');

const GOOD = {
    JWT_SECRET: 'x'.repeat(48),
    RESEND_API_KEY: 're_test_key',
    EMAIL_FROM: 'no-reply@pigeon-bookstore.vn'
};

describe('checkEnv', () => {
    it('cấu hình đầy đủ → không lỗi, không cảnh báo', () => {
        expect(checkEnv(GOOD)).toEqual({ errors: [], warnings: [] });
    });

    it('thiếu JWT_SECRET (hoặc chỉ có khoảng trắng) → lỗi chặn khởi động', () => {
        for (const value of [undefined, '', '   ']) {
            const { errors } = checkEnv({ ...GOOD, JWT_SECRET: value });
            expect(errors).toEqual([expect.stringContaining('JWT_SECRET')]);
        }
    });

    it('JWT_SECRET ngắn hơn 32 ký tự → cảnh báo (không chặn, tránh làm sập production đang chạy)', () => {
        const { errors, warnings } = checkEnv({ ...GOOD, JWT_SECRET: 'ngan_qua' });
        expect(errors).toEqual([]);
        expect(warnings).toEqual([expect.stringContaining('JWT_SECRET')]);
    });

    it('thiếu RESEND_API_KEY → cảnh báo email không gửi được', () => {
        const { errors, warnings } = checkEnv({ ...GOOD, RESEND_API_KEY: '' });
        expect(errors).toEqual([]);
        expect(warnings).toEqual([expect.stringContaining('RESEND_API_KEY')]);
    });

    it('EMAIL_FROM thuộc hộp thư công cộng (gmail, yahoo, outlook...) → cảnh báo Resend sẽ từ chối', () => {
        for (const from of ['ban@gmail.com', 'Ban@Yahoo.com', 'x@outlook.com', 'x@hotmail.com']) {
            const { warnings } = checkEnv({ ...GOOD, EMAIL_FROM: from });
            expect(warnings).toEqual([expect.stringContaining('EMAIL_FROM')]);
        }
    });

    it('thông báo không bao giờ chứa giá trị bí mật', () => {
        const env = { JWT_SECRET: 'bimat_ngan', RESEND_API_KEY: '', EMAIL_FROM: 'ban@gmail.com' };
        const { errors, warnings } = checkEnv(env);
        expect([...errors, ...warnings].join(' ')).not.toContain('bimat_ngan');
    });
});

describe('assertEnv', () => {
    let errorSpy;
    let warnSpy;

    beforeEach(() => {
        errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        errorSpy.mockRestore();
        warnSpy.mockRestore();
    });

    it('có lỗi → ghi log và ném lỗi để server không khởi động', () => {
        expect(() => assertEnv({ ...GOOD, JWT_SECRET: '' })).toThrow(/cấu hình/i);
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('JWT_SECRET'));
    });

    it('chỉ có cảnh báo → ghi log, vẫn khởi động', () => {
        expect(() => assertEnv({ ...GOOD, RESEND_API_KEY: '' })).not.toThrow();
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('RESEND_API_KEY'));
    });
});
