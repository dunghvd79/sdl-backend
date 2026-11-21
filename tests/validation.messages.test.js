// B36 (các controller còn lại): khoá NGUYÊN VĂN câu báo lỗi đầu vào trước và sau khi chuyển kiểm tra từ controller
// vào lược đồ Zod. Giao diện hiển thị đúng các câu này nên không được đổi. Luật nghiệp vụ (cần DB / biết ai đang gọi)
// vẫn ở controller và không nằm trong file này.
const request = require('supertest');
const app = require('../src/config/app');
const pool = require('../src/config/database');
const { encodeArticleId } = require('../src/utils/hashids');
const { PASSWORD_POLICY_MESSAGE } = require('../src/utils/authTokens');
const { resetDb, closeAll } = require('./helpers/db');
const { loginAs, createBook } = require('./helpers/fixtures');

const ORIGIN = 'http://localhost:5173';
let seq = 0;
let ids;

afterAll(async () => {
    await closeAll();
});

beforeAll(async () => {
    await resetDb();
    const bookId = await createBook();
    const { rows: [article] } = await pool.query("INSERT INTO articles (title, content) VALUES ('Bai Viet', 'Noi dung') RETURNING id");
    const { rows: [coupon] } = await pool.query(
        `INSERT INTO coupons (code, discount_type, discount_value, end_date, usage_limit)
         VALUES ('GIAMTEST', 'FIXED', 10000, NOW() + INTERVAL '30 days', 10) RETURNING id`
    );
    const { rows: [user] } = await pool.query(
        "INSERT INTO users (email, password_hash, full_name, role) VALUES ('nguoi.khac@test.vn', 'x', 'Nguoi Khac', 'CUSTOMER') RETURNING id"
    );
    ids = { bookId, articleId: encodeArticleId(article.id), couponId: coupon.id, userId: user.id };
});

// Mỗi test: một IP riêng (rate limit theo IP: đăng ký 5 lần / giờ...) và một tài khoản riêng
// (thao tác ghi của quản trị: 30 lần / phút / tài khoản).
async function call({ method, url, role, body, query }) {
    seq++;
    let req = request(app)[method](typeof url === 'function' ? url(ids) : url)
        .set('X-Forwarded-For', `10.9.${Math.floor(seq / 250)}.${seq % 250}`)
        .set('Origin', ORIGIN);
    if (role) {
        const account = await loginAs(role, `${role.toLowerCase()}.msg${seq}@test.vn`);
        req = req.set(account.auth);
    }
    if (query) req = req.query(query);
    return body === undefined ? req : req.send(body);
}

const REGISTER_OK = { email: 'moi@test.vn', password: 'matkhau123', fullName: 'Nguyen Van A' };

// [mô tả, request, câu báo lỗi mong đợi]
const CASES = [
    // ----- Đăng ký / đăng nhập / mật khẩu -----
    ['đăng ký thiếu trường', { method: 'post', url: '/api/auth/register', body: { email: 'a@test.vn' } },
        'Vui lòng nhập đầy đủ email, mật khẩu và họ tên!'],
    ['đăng ký email sai định dạng', { method: 'post', url: '/api/auth/register', body: { ...REGISTER_OK, email: 'abc' } },
        'Địa chỉ email không hợp lệ (ví dụ: vi-du@email.com)!'],
    ['đăng ký họ tên 1 ký tự', { method: 'post', url: '/api/auth/register', body: { ...REGISTER_OK, fullName: ' A ' } },
        'Họ và tên phải dài từ 2 đến 100 ký tự!'],
    ['đăng ký họ tên có số', { method: 'post', url: '/api/auth/register', body: { ...REGISTER_OK, fullName: 'Nguyen 123' } },
        'Họ và tên không được chứa số hoặc ký tự đặc biệt!'],
    ['đăng ký mật khẩu yếu', { method: 'post', url: '/api/auth/register', body: { ...REGISTER_OK, password: 'abcdefgh' } },
        PASSWORD_POLICY_MESSAGE],
    ['đăng ký email sai và mật khẩu yếu (email báo trước)',
        { method: 'post', url: '/api/auth/register', body: { ...REGISTER_OK, email: 'abc', password: '1' } },
        'Địa chỉ email không hợp lệ (ví dụ: vi-du@email.com)!'],
    ['đăng nhập thiếu mật khẩu', { method: 'post', url: '/api/auth/login', body: { email: 'a@test.vn' } },
        'Vui lòng nhập email và mật khẩu!'],
    ['quên mật khẩu thiếu email', { method: 'post', url: '/api/auth/forgot-password', body: {} },
        'Vui lòng cung cấp email!'],
    ['đặt lại mật khẩu thiếu mật khẩu mới', { method: 'post', url: '/api/auth/reset-password', body: { token: 'abc' } },
        'Mã xác thực hoặc mật khẩu mới không hợp lệ!'],
    ['đặt lại mật khẩu yếu', { method: 'post', url: '/api/auth/reset-password', body: { token: 'abc', newPassword: '12345678' } },
        PASSWORD_POLICY_MESSAGE],
    ['đổi mật khẩu thiếu trường', { method: 'put', url: '/api/users/change-password', role: 'CUSTOMER', body: { newPassword: 'abc12345' } },
        'Vui lòng cung cấp mật khẩu hiện tại và mật khẩu mới'],
    ['đổi mật khẩu mới yếu', { method: 'put', url: '/api/users/change-password', role: 'CUSTOMER',
        body: { currentPassword: 'x', newPassword: 'short1' } }, PASSWORD_POLICY_MESSAGE],

    // ----- Giỏ hàng / yêu thích / đánh giá / mã giảm giá (khách) -----
    ['thêm vào giỏ thiếu số lượng', { method: 'post', url: '/api/cart/add', role: 'CUSTOMER', body: { bookId: 1 } },
        'Thiếu bookId hoặc quantity'],
    ['thêm vào giỏ thiếu mã sách', { method: 'post', url: '/api/cart/add', role: 'CUSTOMER', body: { quantity: 1 } },
        'Thiếu bookId hoặc quantity'],
    ['thêm nhiều món: danh sách rỗng', { method: 'post', url: '/api/cart/add-batch', role: 'CUSTOMER', body: { items: [] } },
        'Danh sách sản phẩm không hợp lệ'],
    ['thêm nhiều món: không gửi danh sách', { method: 'post', url: '/api/cart/add-batch', role: 'CUSTOMER', body: {} },
        'Danh sách sản phẩm không hợp lệ'],
    ['xoá nhiều món: danh sách rỗng', { method: 'post', url: '/api/cart/remove-bulk', role: 'CUSTOMER', body: { bookIds: [] } },
        'Danh sách mã sách (bookIds) không hợp lệ!'],
    ['xoá nhiều món: không gửi danh sách', { method: 'post', url: '/api/cart/remove-bulk', role: 'CUSTOMER', body: {} },
        'Danh sách mã sách (bookIds) không hợp lệ!'],
    ['yêu thích thiếu mã sách', { method: 'post', url: '/api/wishlists/toggle', role: 'CUSTOMER', body: {} },
        'Mã sách (bookId) không được để trống!'],
    ['đánh giá 6 sao', { method: 'post', url: ({ bookId }) => `/api/books/${bookId}/reviews`, role: 'CUSTOMER',
        body: { rating: 6, comment: 'Sach rat hay va bo ich' } }, 'Đánh giá phải từ 1 đến 5 sao!'],
    ['đánh giá không gửi số sao', { method: 'post', url: ({ bookId }) => `/api/books/${bookId}/reviews`, role: 'CUSTOMER',
        body: { comment: 'Sach rat hay va bo ich' } }, 'Đánh giá phải từ 1 đến 5 sao!'],
    ['nhận xét quá ngắn', { method: 'post', url: ({ bookId }) => `/api/books/${bookId}/reviews`, role: 'CUSTOMER',
        body: { rating: 5, comment: '  ngan   ' } }, 'Nội dung nhận xét phải có ít nhất 10 ký tự!'],
    ['kiểm tra mã giảm giá: thiếu mã', { method: 'get', url: '/api/coupons/validate', role: 'CUSTOMER', query: { orderAmount: 100000 } },
        'Vui lòng nhập mã giảm giá'],
    ['kiểm tra mã giảm giá: mã toàn khoảng trắng', { method: 'get', url: '/api/coupons/validate', role: 'CUSTOMER',
        query: { code: '   ', orderAmount: 100000 } }, 'Vui lòng nhập mã giảm giá'],
    ['kiểm tra mã giảm giá: giá trị đơn 0', { method: 'get', url: '/api/coupons/validate', role: 'CUSTOMER',
        query: { code: 'GIAMTEST', orderAmount: 0 } }, 'Giá trị đơn hàng không hợp lệ'],
    ['kiểm tra mã giảm giá: thiếu giá trị đơn', { method: 'get', url: '/api/coupons/validate', role: 'CUSTOMER',
        query: { code: 'GIAMTEST' } }, 'Giá trị đơn hàng không hợp lệ'],

    // ----- Quản trị -----
    ['tạo danh mục thiếu tên', { method: 'post', url: '/api/categories', role: 'ADMIN', body: { description: 'x' } },
        'Tên danh mục không được để trống'],
    ['sửa danh mục tên rỗng', { method: 'put', url: '/api/categories/1', role: 'ADMIN', body: { name: '' } },
        'Tên danh mục không được để trống'],
    ['gán sách vào danh mục: không gửi danh sách', { method: 'post', url: '/api/categories/1/books', role: 'ADMIN', body: {} },
        'Dữ liệu bookIds không hợp lệ, phải là một mảng'],
    ['tạo mã giảm giá thiếu trường', { method: 'post', url: '/api/coupons', role: 'ADMIN', body: { code: 'MOI' } },
        'Vui lòng điền đầy đủ: Mã, Loại giảm, Giá trị giảm, Ngày kết thúc'],
    ['tạo mã giảm giá loại sai', { method: 'post', url: '/api/coupons', role: 'ADMIN',
        body: { code: 'MOI', discount_type: 'FREE', discount_value: 10, end_date: '2027-01-01T00:00' } },
        'Loại giảm giá phải là PERCENT hoặc FIXED'],
    ['tạo mã giảm giá: giá trị giảm 0 (lược đồ báo trước)', { method: 'post', url: '/api/coupons', role: 'ADMIN',
        body: { code: 'MOI', discount_type: 'FIXED', discount_value: 0, end_date: '2027-01-01T00:00' } },
        'Giá trị giảm phải lớn hơn 0'],
    ['sửa mã giảm giá thiếu trường', { method: 'put', url: ({ couponId }) => `/api/coupons/${couponId}`, role: 'ADMIN',
        body: { code: 'GIAMTEST' } }, 'Vui lòng điền đầy đủ: Mã, Loại giảm, Giá trị giảm, Ngày kết thúc'],
    ['chỉnh kho không gửi số lượng', { method: 'put', url: ({ bookId }) => `/api/inventory/${bookId}`, role: 'ADMIN', body: {} },
        'Số lượng không hợp lệ!'],
    // Trước B36: '' lọt qua (`'' >= 0`), parseInt('') = NaN ghi vào DB → 500
    ['chỉnh kho availableQty rỗng', { method: 'put', url: ({ bookId }) => `/api/inventory/${bookId}`, role: 'ADMIN',
        body: { availableQty: '' } }, 'Số lượng không hợp lệ!'],
    ['chỉnh kho theo số lượng mà loại sai', { method: 'put', url: ({ bookId }) => `/api/inventory/${bookId}`, role: 'ADMIN',
        body: { quantity: 5, type: 'ADJUSTMENT' } }, 'Khi nhập/xuất theo số lượng, loại giao dịch phải là STOCK_IN hoặc STOCK_OUT!'],
    ['chỉnh kho theo số lượng không gửi loại', { method: 'put', url: ({ bookId }) => `/api/inventory/${bookId}`, role: 'ADMIN',
        body: { quantity: 5 } }, 'Khi nhập/xuất theo số lượng, loại giao dịch phải là STOCK_IN hoặc STOCK_OUT!'],
    ['tạo bài viết thiếu tiêu đề', { method: 'post', url: '/api/articles', role: 'ADMIN', body: { content: 'Noi dung' } },
        'Tiêu đề không được để trống!'],
    ['tạo bài viết tiêu đề toàn khoảng trắng', { method: 'post', url: '/api/articles', role: 'ADMIN', body: { title: '  ', content: 'x' } },
        'Tiêu đề không được để trống!'],
    ['tạo bài viết thiếu nội dung', { method: 'post', url: '/api/articles', role: 'ADMIN', body: { title: 'Tieu de' } },
        'Nội dung không được để trống!'],
    ['sửa bài viết nội dung rỗng', { method: 'put', url: ({ articleId }) => `/api/articles/${articleId}`, role: 'ADMIN',
        body: { title: 'Tieu de', content: '   ' } }, 'Nội dung không được để trống!'],
    ['đổi quyền: vai trò sai', { method: 'put', url: ({ userId }) => `/api/admin/users/${userId}/role`, role: 'ADMIN',
        body: { role: 'SUPERADMIN' } }, 'Role không hợp lệ'],
    ['đổi quyền: không gửi vai trò', { method: 'put', url: ({ userId }) => `/api/admin/users/${userId}/role`, role: 'ADMIN',
        body: {} }, 'Role không hợp lệ'],
    ['khoá tài khoản: isActive không phải boolean', { method: 'put', url: ({ userId }) => `/api/admin/users/${userId}/status`,
        role: 'ADMIN', body: { isActive: 'true' } }, 'Trạng thái isActive phải là giá trị boolean (true/false)']
];

describe('B36: câu báo lỗi đầu vào giữ nguyên văn', () => {
    test.each(CASES)('%s', async (_desc, req, message) => {
        const res = await call(req);

        expect(res.status).toBe(400);
        expect(res.body.error).toBe(message);
    });
});

// Luật nghiệp vụ ở lại controller: vẫn chạy sau khi đầu vào hợp lệ
describe('luật nghiệp vụ vẫn ở controller', () => {
    test('admin không tự đổi quyền của chính mình', async () => {
        const admin = await loginAs('ADMIN', 'admin.tudoi@test.vn');
        const res = await request(app).put(`/api/admin/users/${admin.user.id}/role`).set(admin.auth).send({ role: 'CUSTOMER' });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Không thể tự thay đổi quyền của chính mình!');
    });

    test('admin không tự khoá tài khoản của chính mình', async () => {
        const admin = await loginAs('ADMIN', 'admin.tukhoa@test.vn');
        const res = await request(app).put(`/api/admin/users/${admin.user.id}/status`).set(admin.auth).send({ isActive: false });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Không thể tự khóa hoặc mở khóa tài khoản của chính mình!');
    });
});
