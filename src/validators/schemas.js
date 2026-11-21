// Lược đồ kiểm tra đầu vào theo nhóm chức năng (spec 003).
// Nguyên tắc:
// - MỌI kiểm tra đầu vào (thiếu trường, kiểu, định dạng, khoảng, kiểm tra chéo giữa các trường) nằm ở đây; controller
//   chỉ còn luật nghiệp vụ cần DB hoặc cần biết ai đang gọi (B36).
// - Kiểm tra trường lẻ khai báo trong `z.looseObject`; câu "thiếu trường" riêng và kiểm tra chéo dùng `withChecks`
//   (chạy sau, giữ nguyên câu chữ và thứ tự của controller cũ — giao diện hiển thị đúng các câu này).
// - Độ dài tối đa không vượt cột DB (tránh lỗi 500 "value too long").
const { z, text, number, oneOf, bool, bookId, idList, listQuery, stringError, VN_PHONE_REGEX } = require('./common');
const { validateNewPassword } = require('../utils/authTokens');

const MAX_MONEY = 1000000000; // 1 tỷ đ

// Chép các kiểm tra trước đây nằm trong controller (B36). Chạy SAU kiểm tra từng trường của `schema` — giống thứ tự
// cũ (lược đồ ở route chạy trước controller) — và báo câu ĐẦU TIÊN theo đúng thứ tự cũ. Mỗi check nhận dữ liệu đã qua
// lược đồ, trả câu báo lỗi hoặc null. Check vẫn chạy khi một trường đã sai kiểu (lỗi đó báo trước), nên không được
// giả định kiểu: dùng `isBlank`, `typeof`.
function withChecks(schema, ...checks) {
    return schema.superRefine((data, ctx) => {
        for (const check of checks) {
            const message = check(data);
            if (message) {
                ctx.addIssue({ code: 'custom', message });
                return;
            }
        }
    });
}

// Thiếu / rỗng / toàn khoảng trắng (thay cho `!v || !v.trim()` của controller cũ, không ném lỗi khi sai kiểu)
const isBlank = v => !v || (typeof v === 'string' && !v.trim());

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const NAME_SPECIAL_CHARS = /[0-9`~!@#$%^&*()_+={}[\]|\\:;"'<>,.?/]/;

// ---------- Xác thực / tài khoản ----------
const auth = {
    login: withChecks(
        z.looseObject({ email: text('Email', 255), password: text('Mật khẩu', 128) }),
        d => (!d.email || !d.password ? 'Vui lòng nhập email và mật khẩu!' : null)
    ),
    register: withChecks(
        z.looseObject({ email: text('Email', 255), password: text('Mật khẩu', 128), fullName: text('Họ và tên', 255) }),
        d => (!d.email || !d.password || !d.fullName ? 'Vui lòng nhập đầy đủ email, mật khẩu và họ tên!' : null),
        // Email / họ tên được so sau khi bỏ khoảng trắng hai đầu (controller lưu bản đã trim)
        d => (typeof d.email === 'string' && !EMAIL_REGEX.test(d.email.trim())
            ? 'Địa chỉ email không hợp lệ (ví dụ: vi-du@email.com)!' : null),
        d => {
            if (typeof d.fullName !== 'string') return null;
            const name = d.fullName.trim();
            if (name.length < 2 || name.length > 100) return 'Họ và tên phải dài từ 2 đến 100 ký tự!';
            if (NAME_SPECIAL_CHARS.test(name)) return 'Họ và tên không được chứa số hoặc ký tự đặc biệt!';
            return null;
        },
        d => validateNewPassword(d.password) // chính sách spec 002: ≥ 8 ký tự, có chữ và số
    ),
    forgotPassword: withChecks(
        z.looseObject({ email: text('Email', 255) }),
        d => (!d.email ? 'Vui lòng cung cấp email!' : null)
    ),
    resetPassword: withChecks(
        z.looseObject({ token: text('Mã xác thực', 200), newPassword: text('Mật khẩu mới', 128) }),
        d => (!d.token || !d.newPassword ? 'Mã xác thực hoặc mật khẩu mới không hợp lệ!' : null),
        d => validateNewPassword(d.newPassword)
    ),
    // Spec 005: ID token do Google Identity Services trả về (JWT ~1–2 KB)
    google: z.looseObject({ credential: text('Mã xác thực Google', 4096, { required: true }) })
};

const user = {
    // Toàn bộ kiểm tra định dạng của hồ sơ nằm ở đây (B36); controller không kiểm tra lại.
    updateProfile: z.looseObject({
        full_name: text('Họ tên', 255, { required: true }),
        // Không bắt buộc. Có nhập thì bỏ mọi khoảng trắng rồi so mẫu (cho phép "091 234 5678").
        phone: z.string({ error: 'Số điện thoại phải là chuỗi ký tự' })
            .max(50, { error: 'Số điện thoại không được dài quá 50 ký tự' })
            .refine(v => v.trim() === '' || VN_PHONE_REGEX.test(v.replace(/\s+/g, '')),
                { error: 'Số điện thoại không hợp lệ (ví dụ: 0987654321)' })
            .nullish(),
        address: text('Địa chỉ', 1000)
    }),
    changePassword: withChecks(
        z.looseObject({ currentPassword: text('Mật khẩu hiện tại', 128), newPassword: text('Mật khẩu mới', 128) }),
        d => (!d.currentPassword || !d.newPassword ? 'Vui lòng cung cấp mật khẩu hiện tại và mật khẩu mới' : null),
        d => validateNewPassword(d.newPassword)
    )
};

// ---------- Giỏ hàng / đơn hàng ----------
const quantity = number('Số lượng', 1, 99, { integer: true });

const cart = {
    add: withChecks(
        z.looseObject({ bookId: bookId.optional(), quantity }),
        d => (!d.bookId || !d.quantity ? 'Thiếu bookId hoặc quantity' : null)
    ),
    addBatch: withChecks(
        z.looseObject({
            items: z.array(z.looseObject({ bookId, quantity: number('Số lượng', 1, 99, { integer: true, required: true }) }),
                { error: 'Danh sách sản phẩm không hợp lệ' })
                .max(50, { error: 'Danh sách sản phẩm tối đa 50 món' })
                .optional()
        }),
        d => (!Array.isArray(d.items) || d.items.length === 0 ? 'Danh sách sản phẩm không hợp lệ' : null)
    ),
    removeBulk: withChecks(
        z.looseObject({ bookIds: idList('Danh sách mã sách').optional() }),
        d => (!Array.isArray(d.bookIds) || d.bookIds.length === 0 ? 'Danh sách mã sách (bookIds) không hợp lệ!' : null)
    ),
    checkout: z.looseObject({ selectedBookIds: idList('Danh sách sách được chọn').optional() })
};

const order = {
    // Toàn bộ kiểm tra định dạng của đặt hàng nằm ở đây (B36); controller không kiểm tra lại.
    // Thứ tự trường = thứ tự báo lỗi (Zod báo trường sai đầu tiên theo thứ tự khai báo).
    checkout: z.looseObject({
        shippingName: text('Họ tên người nhận', 255, { required: true }),
        shippingPhone: z.string({ error: stringError('Số điện thoại nhận hàng') })
            .trim()
            .min(1, { error: 'Số điện thoại nhận hàng không được để trống' })
            .max(50, { error: 'Số điện thoại nhận hàng không được dài quá 50 ký tự' })
            .regex(VN_PHONE_REGEX, { error: 'Số điện thoại không hợp lệ' }),
        shippingAddress: text('Địa chỉ giao hàng', 1000, { required: true }),
        shippingNotes: text('Ghi chú giao hàng', 1000),
        paymentMethod: z.enum(['COD', 'ONLINE'], { error: 'Phương thức thanh toán không hợp lệ (phải là COD hoặc ONLINE)' }),
        couponCode: text('Mã giảm giá', 50),
        selectedBookIds: idList('Danh sách sách được chọn').optional()
    }),
    cancel: z.looseObject({ cancelReason: text('Lý do huỷ đơn', 1000) })
};

const review = {
    create: withChecks(
        z.looseObject({ comment: text('Nhận xét', 2000) }),
        d => {
            const rating = parseInt(d.rating);
            return isNaN(rating) || rating < 1 || rating > 5 ? 'Đánh giá phải từ 1 đến 5 sao!' : null;
        },
        d => (!d.comment || (typeof d.comment === 'string' && d.comment.trim().length < 10)
            ? 'Nội dung nhận xét phải có ít nhất 10 ký tự!' : null)
    )
};

const wishlist = {
    toggle: withChecks(
        z.looseObject({ bookId: bookId.optional() }),
        d => (!d.bookId ? 'Mã sách (bookId) không được để trống!' : null)
    )
};

// ---------- Sách / danh mục / bài viết ----------
// Một trường sách = một hàm trả câu báo lỗi đầu tiên (hoặc null). Chuyển nguyên văn từ `validateBookInput` cũ của
// bookController (B36): giao diện hiển thị đúng các câu này, nên giữ cả câu chữ lẫn thứ tự kiểm tra.
// `optional`: không gửi trường thì bỏ qua; trường bắt buộc vẫn chạy `check` để báo câu "không được để trống" riêng.
function bookRule(check, { optional = false } = {}) {
    const schema = z.any().superRefine((value, ctx) => {
        const message = check(value);
        if (message) ctx.addIssue({ code: 'custom', message });
    });
    return optional ? schema.optional() : schema;
}

const MAX_BOOK_PRICE = 99999999.99; // cột books.price NUMERIC(10,2)
const BOOK_STATUSES = ['DRAFT', 'PUBLISHED', 'HIDDEN'];

function requiredName(emptyMessage, tooLongMessage) {
    return bookRule(v => {
        if (!v || typeof v !== 'string' || !v.trim()) return emptyMessage;
        if (v.length > 255) return tooLongMessage;
        return null;
    });
}

const book = {
    write: z.looseObject({
        cover_url: text('Ảnh bìa (cover_url)', 500),
        display_order: number('Thứ tự hiển thị', -1000000, 1000000, { integer: true }),
        is_featured: bool('Sách nổi bật'),
        is_bestseller: bool('Sách bán chạy'),
        categories: z.array(number('Mã danh mục', 1, 2147483647, { integer: true, required: true }),
            { error: 'Danh mục phải là một danh sách' }).max(50, { error: 'Tối đa 50 danh mục' }).nullish(),
        images: z.array(z.looseObject({ image_url: text('Ảnh chi tiết', 500) }),
            { error: 'Ảnh chi tiết phải là một danh sách' }).max(30, { error: 'Tối đa 30 ảnh chi tiết' }).nullish(),
        title: requiredName('Tên sách không được để trống!', 'Tên sách quá dài! Vui lòng nhập tối đa 255 ký tự.'),
        author: requiredName('Tác giả không được để trống!', 'Tên tác giả quá dài! Vui lòng nhập tối đa 255 ký tự.'),
        price: bookRule(v => {
            if (v === undefined || v === null || v === '') return 'Giá bán không được để trống!';
            const price = Number(v);
            if (isNaN(price)) return 'Giá bán phải là số hợp lệ!';
            if (price < 0) return 'Giá bán không hợp lệ! Giá sách phải từ 0 đ trở lên.';
            if (price > MAX_BOOK_PRICE) return 'Giá bán vượt quá giới hạn hệ thống (Tối đa 99.999.999,99 đ)!';
            return null;
        }),
        isbn: bookRule(v => {
            if (!v) return null; // không bắt buộc
            if (typeof v !== 'string') return 'Mã ISBN không hợp lệ!';
            if (v.length > 50) return 'Mã ISBN quá dài! Vui lòng nhập tối đa 50 ký tự.';
            if (!/^[0-9-]+$/.test(v)) return 'Mã ISBN không hợp lệ! Vui lòng chỉ nhập số và dấu gạch ngang.';
            return null;
        }, { optional: true }),
        description: bookRule(v => (v && v.length > 5000
            ? 'Mô tả sách quá dài! Vui lòng rút gọn dưới 5000 ký tự.' : null), { optional: true }),
        status: bookRule(v => (v && !BOOK_STATUSES.includes(v)
            ? 'Trạng thái sách không hợp lệ! Chỉ cho phép: Công khai (PUBLISHED), Bản nháp (DRAFT), hoặc Tạm ẩn (HIDDEN).'
            : null), { optional: true })
    }),
    list: z.looseObject({
        ...listQuery,
        sortBy: text('Sắp xếp (sortBy)', 30),
        categoryId: number('Mã danh mục', 1, 2147483647, { integer: true }),
        maxPrice: number('Giá tối đa', 0, MAX_MONEY),
        isFeatured: text('Lọc nổi bật', 10),
        adminMode: text('adminMode', 10)
    })
};

const category = {
    write: withChecks(
        z.looseObject({ name: text('Tên danh mục', 100), description: text('Mô tả danh mục', 2000) }),
        d => (!d.name ? 'Tên danh mục không được để trống' : null)
    ),
    assignBooks: withChecks(
        z.looseObject({ bookIds: z.array(z.unknown()).max(500, { error: 'Tối đa 500 sách mỗi lần' }).optional() }),
        d => (!Array.isArray(d.bookIds) ? 'Dữ liệu bookIds không hợp lệ, phải là một mảng' : null)
    )
};

const article = {
    write: withChecks(z.looseObject({
        title: text('Tiêu đề', 255),
        summary: text('Tóm tắt', 2000),
        content: text('Nội dung', 100000),
        cover_url: text('Ảnh bìa', 500),
        category: text('Chuyên mục', 100),
        reading_time: text('Thời gian đọc', 50),
        status: oneOf('Trạng thái bài viết', ['DRAFT', 'PUBLISHED', 'HIDDEN']),
        is_featured: bool('Bài viết nổi bật')
    }),
    d => (isBlank(d.title) ? 'Tiêu đề không được để trống!' : null),
    d => (isBlank(d.content) ? 'Nội dung không được để trống!' : null)),
    list: z.looseObject({
        ...listQuery,
        category: text('Chuyên mục', 100),
        status: text('Trạng thái', 20),
        adminMode: text('adminMode', 10)
    })
};

// ---------- Mã giảm giá ----------
function dateField(label) {
    return z.string({ error: `${label} phải là chuỗi ngày giờ` })
        .refine(v => !Number.isNaN(new Date(v).getTime()), { error: `${label} không hợp lệ` })
        .nullish();
}

const couponWrite = z.looseObject({
    code: text('Mã giảm giá', 50),
    discount_value: number('Giá trị giảm', 0, MAX_MONEY),
    min_order_amount: number('Giá trị đơn hàng tối thiểu', 0, MAX_MONEY),
    max_discount_amount: number('Mức giảm tối đa', 0, MAX_MONEY),
    start_date: dateField('Ngày bắt đầu'),
    end_date: dateField('Ngày kết thúc'),
    usage_limit: number('Giới hạn lượt dùng', 1, 10000000, { integer: true }),
    is_active: bool('Trạng thái kích hoạt')
}).superRefine((data, ctx) => {
    const value = Number(data.discount_value);
    if (data.discount_value !== undefined && data.discount_value !== null && data.discount_value !== '' && !(value > 0)) {
        ctx.addIssue({ code: 'custom', message: 'Giá trị giảm phải lớn hơn 0' });
    }
    if (data.discount_type === 'PERCENT' && value > 100) {
        ctx.addIssue({ code: 'custom', message: 'Giảm theo phần trăm không được vượt quá 100%' });
    }
    if (data.start_date && data.end_date && new Date(data.end_date) <= new Date(data.start_date)) {
        ctx.addIssue({ code: 'custom', message: 'Ngày kết thúc phải sau ngày bắt đầu' });
    }
});

const couponRequired = d => (!d.code || !d.discount_type || !d.discount_value || !d.end_date
    ? 'Vui lòng điền đầy đủ: Mã, Loại giảm, Giá trị giảm, Ngày kết thúc' : null);

const coupon = {
    // Tạo mới kiểm thêm loại giảm; sửa thì không (giữ đúng hành vi cũ của controller)
    create: withChecks(couponWrite, couponRequired,
        d => (!['PERCENT', 'FIXED'].includes(d.discount_type) ? 'Loại giảm giá phải là PERCENT hoặc FIXED' : null)),
    update: withChecks(couponWrite, couponRequired),
    toggle: z.looseObject({ is_active: bool('Trạng thái kích hoạt') }),
    validateQuery: withChecks(
        z.looseObject({
            code: text('Mã giảm giá', 50),
            orderAmount: number('Giá trị đơn hàng', 0, MAX_MONEY)
        }),
        d => (isBlank(d.code) ? 'Vui lòng nhập mã giảm giá' : null),
        d => {
            const amount = Number(d.orderAmount);
            return isNaN(amount) || amount <= 0 ? 'Giá trị đơn hàng không hợp lệ' : null;
        }
    )
};

// ---------- Kho / quản trị ----------
const hasValue = v => v !== undefined && v !== null && v !== '';

const inventory = {
    // Gửi `quantity` (+ STOCK_IN / STOCK_OUT) = cộng/trừ theo lượng thay đổi; không thì `availableQty` = đặt thẳng
    update: withChecks(
        z.looseObject({
            availableQty: number('Số lượng tồn kho', 0, 1000000, { integer: true }),
            quantity: number('Số lượng nhập/xuất', 1, 1000000, { integer: true }),
            type: oneOf('Loại giao dịch kho', ['STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT', 'RETURN']),
            reason: text('Lý do', 1000)
        }),
        d => {
            if (hasValue(d.quantity)) {
                return d.type !== 'STOCK_IN' && d.type !== 'STOCK_OUT'
                    ? 'Khi nhập/xuất theo số lượng, loại giao dịch phải là STOCK_IN hoặc STOCK_OUT!' : null;
            }
            return hasValue(d.availableQty) && d.availableQty >= 0 ? null : 'Số lượng không hợp lệ!';
        }
    )
};

const admin = {
    ordersQuery: z.looseObject({
        page: listQuery.page,
        limit: listQuery.limit,
        status: text('Trạng thái', 20),
        date: text('Ngày', 20)
    }),
    usersQuery: z.looseObject({ search: listQuery.search, role: text('Vai trò', 20) }),
    orderStatus: z.looseObject({ status: text('Trạng thái', 20), cancelReason: text('Lý do huỷ đơn', 1000) }),
    // B48: đổi trạng thái hàng loạt — tối đa 100 đơn / request (giao diện tự chia lô)
    orderStatusBulk: z.looseObject({
        orderIds: z.array(
            z.string({ error: 'Mã đơn hàng không hợp lệ' }).trim().min(1, { error: 'Mã đơn hàng không hợp lệ' }).max(50, { error: 'Mã đơn hàng không hợp lệ' }),
            { error: 'Danh sách đơn hàng phải là một danh sách' }
        )
            .min(1, { error: 'Danh sách đơn hàng phải có ít nhất 1 phần tử' })
            .max(100, { error: 'Danh sách đơn hàng tối đa 100 phần tử' }),
        status: z.enum(['PENDING', 'CONFIRMED', 'PACKAGING', 'DELIVERING', 'DELIVERED', 'CANCELLED'], { error: 'Trạng thái không hợp lệ' }),
        cancelReason: text('Lý do huỷ đơn', 1000)
    }),
    userRole: withChecks(
        z.looseObject({ role: text('Vai trò', 20) }),
        d => (!['CUSTOMER', 'CURATOR', 'ADMIN'].includes(d.role) ? 'Role không hợp lệ' : null)
    ),
    userStatus: withChecks(
        z.looseObject({}),
        d => (typeof d.isActive !== 'boolean' ? 'Trạng thái isActive phải là giá trị boolean (true/false)' : null)
    )
};

module.exports = { auth, user, cart, order, review, wishlist, book, category, article, coupon, inventory, admin };
