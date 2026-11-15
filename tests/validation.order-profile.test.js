// B36 + B43: kiểm tra định dạng của đặt hàng và hồ sơ chuyển từ controller vào lược đồ Zod.
// - Phần "khoá hành vi": câu thông báo + thứ tự ưu tiên phải GIỮ NGUYÊN (giao diện hiển thị nguyên văn).
// - Phần B43: regex số điện thoại cũ `[3|5|7|8|9]` chấp nhận ký tự '|' (đỏ trước khi sửa).
const request = require('supertest');
const app = require('../src/config/app');
const { resetDb, closeAll } = require('./helpers/db');
const { loginAs } = require('./helpers/fixtures');

let customer;

afterAll(async () => {
    await closeAll();
});

beforeAll(async () => {
    await resetDb();
    customer = await loginAs('CUSTOMER');
});

const VALID = {
    shippingName: 'Khach Hang', shippingPhone: '0912345678',
    shippingAddress: '1 Duong Test', paymentMethod: 'COD'
};

function checkout(body) {
    return request(app).post('/api/orders/checkout').set(customer.auth).send(body);
}

function updateProfile(body) {
    return request(app).put('/api/users/profile').set(customer.auth).send(body);
}

function without(obj, key) {
    const copy = { ...obj };
    delete copy[key];
    return copy;
}

describe('Đặt hàng: câu thông báo giữ nguyên', () => {
    test.each([
        ['thiếu họ tên', without(VALID, 'shippingName'), 'Họ tên người nhận không được để trống'],
        ['họ tên chỉ có khoảng trắng', { ...VALID, shippingName: '   ' }, 'Họ tên người nhận không được để trống'],
        ['thiếu số điện thoại', without(VALID, 'shippingPhone'), 'Số điện thoại nhận hàng không được để trống'],
        ['số điện thoại sai mẫu', { ...VALID, shippingPhone: '123' }, 'Số điện thoại không hợp lệ'],
        ['thiếu địa chỉ', without(VALID, 'shippingAddress'), 'Địa chỉ giao hàng không được để trống'],
        ['phương thức thanh toán lạ', { ...VALID, paymentMethod: 'BITCOIN' }, 'Phương thức thanh toán không hợp lệ (phải là COD hoặc ONLINE)'],
        ['thiếu phương thức thanh toán', without(VALID, 'paymentMethod'), 'Phương thức thanh toán không hợp lệ (phải là COD hoặc ONLINE)'],
        ['thiếu cả họ tên lẫn số điện thoại → báo họ tên trước', without(without(VALID, 'shippingName'), 'shippingPhone'), 'Họ tên người nhận không được để trống']
    ])('%s → 400', async (_, body, message) => {
        const res = await checkout(body);

        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: message });
    });

    test('số điện thoại có khoảng trắng đầu/cuối vẫn hợp lệ (tới bước nghiệp vụ: giỏ trống)', async () => {
        const res = await checkout({ ...VALID, shippingPhone: '  0912345678  ' });

        expect(res.body).toEqual({ error: 'Giỏ hàng trống, không thể thanh toán!' });
    });
});

describe('Hồ sơ: câu thông báo giữ nguyên', () => {
    test('thiếu họ tên → 400', async () => {
        const res = await updateProfile({ phone: '', address: '' });

        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: 'Họ tên không được để trống' });
    });

    test('số điện thoại sai mẫu → 400', async () => {
        const res = await updateProfile({ full_name: 'Khach Hang', phone: '123' });

        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: 'Số điện thoại không hợp lệ (ví dụ: 0987654321)' });
    });

    test.each([[''], ['0912345678'], ['091 234 5678']])('số điện thoại %p được chấp nhận', async (phone) => {
        const res = await updateProfile({ full_name: 'Khach Hang', phone, address: '' });

        expect(res.status).toBe(200);
    });
});

describe('B43: số điện thoại chứa ký tự "|" bị từ chối', () => {
    test('đặt hàng', async () => {
        const res = await checkout({ ...VALID, shippingPhone: '0|12345678' });

        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: 'Số điện thoại không hợp lệ' });
    });

    test('hồ sơ', async () => {
        const res = await updateProfile({ full_name: 'Khach Hang', phone: '0|12345678' });

        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: 'Số điện thoại không hợp lệ (ví dụ: 0987654321)' });
    });
});
