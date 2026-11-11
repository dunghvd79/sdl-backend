// Lược đồ kiểm tra đầu vào theo nhóm chức năng (spec 003).
// Nguyên tắc:
// - Trường đã có câu báo THIẾU trong controller → để tuỳ chọn ở đây (giữ câu cũ, FR-005).
// - Giới hạn ở đây không chặt hơn kiểm tra sẵn có trong controller (để câu cũ vẫn được trả).
// - Độ dài tối đa không vượt cột DB (tránh lỗi 500 "value too long").
const { z, text, number, oneOf, bool, bookId, idList, listQuery } = require('./common');

const MAX_MONEY = 1000000000; // 1 tỷ đ

// ---------- Xác thực / tài khoản ----------
const auth = {
    login: z.looseObject({ email: text('Email', 255), password: text('Mật khẩu', 128) }),
    register: z.looseObject({ email: text('Email', 255), password: text('Mật khẩu', 128), fullName: text('Họ và tên', 255) }),
    forgotPassword: z.looseObject({ email: text('Email', 255) }),
    resetPassword: z.looseObject({ token: text('Mã xác thực', 200), newPassword: text('Mật khẩu mới', 128) })
};

const user = {
    updateProfile: z.looseObject({
        full_name: text('Họ tên', 255),
        phone: text('Số điện thoại', 50),
        address: text('Địa chỉ', 1000)
    }),
    changePassword: z.looseObject({ currentPassword: text('Mật khẩu hiện tại', 128), newPassword: text('Mật khẩu mới', 128) })
};

// ---------- Giỏ hàng / đơn hàng ----------
const quantity = number('Số lượng', 1, 99, { integer: true });

const cart = {
    add: z.looseObject({ bookId: bookId.optional(), quantity }),
    addBatch: z.looseObject({
        items: z.array(z.looseObject({ bookId, quantity: number('Số lượng', 1, 99, { integer: true, required: true }) }),
            { error: 'Danh sách sản phẩm không hợp lệ' })
            .max(50, { error: 'Danh sách sản phẩm tối đa 50 món' })
            .optional()
    }),
    removeBulk: z.looseObject({ bookIds: idList('Danh sách mã sách').optional() }),
    checkout: z.looseObject({ selectedBookIds: idList('Danh sách sách được chọn').optional() })
};

const order = {
    checkout: z.looseObject({
        shippingName: text('Họ tên người nhận', 255),
        shippingPhone: text('Số điện thoại nhận hàng', 50),
        shippingAddress: text('Địa chỉ giao hàng', 1000),
        shippingNotes: text('Ghi chú giao hàng', 1000),
        paymentMethod: text('Phương thức thanh toán', 20),
        couponCode: text('Mã giảm giá', 50),
        selectedBookIds: idList('Danh sách sách được chọn').optional()
    }),
    cancel: z.looseObject({ cancelReason: text('Lý do huỷ đơn', 1000) })
};

const review = {
    create: z.looseObject({ comment: text('Nhận xét', 2000) })
};

const wishlist = {
    toggle: z.looseObject({ bookId: bookId.optional() })
};

// ---------- Sách / danh mục / bài viết ----------
const book = {
    // Tiêu đề, tác giả, giá, ISBN, mô tả, trạng thái đã có validateBookInput trong controller
    write: z.looseObject({
        cover_url: text('Ảnh bìa (cover_url)', 500),
        display_order: number('Thứ tự hiển thị', -1000000, 1000000, { integer: true }),
        is_featured: bool('Sách nổi bật'),
        is_bestseller: bool('Sách bán chạy'),
        categories: z.array(number('Mã danh mục', 1, 2147483647, { integer: true, required: true }),
            { error: 'Danh mục phải là một danh sách' }).max(50, { error: 'Tối đa 50 danh mục' }).nullish(),
        images: z.array(z.looseObject({ image_url: text('Ảnh chi tiết', 500) }),
            { error: 'Ảnh chi tiết phải là một danh sách' }).max(30, { error: 'Tối đa 30 ảnh chi tiết' }).nullish()
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
    write: z.looseObject({ name: text('Tên danh mục', 100), description: text('Mô tả danh mục', 2000) }),
    assignBooks: z.looseObject({ bookIds: z.array(z.unknown()).max(500, { error: 'Tối đa 500 sách mỗi lần' }).optional() })
};

const article = {
    write: z.looseObject({
        title: text('Tiêu đề', 255),
        summary: text('Tóm tắt', 2000),
        content: text('Nội dung', 100000),
        cover_url: text('Ảnh bìa', 500),
        category: text('Chuyên mục', 100),
        reading_time: text('Thời gian đọc', 50),
        status: oneOf('Trạng thái bài viết', ['DRAFT', 'PUBLISHED', 'HIDDEN']),
        is_featured: bool('Bài viết nổi bật')
    }),
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

const coupon = {
    write: couponWrite,
    toggle: z.looseObject({ is_active: bool('Trạng thái kích hoạt') }),
    validateQuery: z.looseObject({
        code: text('Mã giảm giá', 50),
        orderAmount: number('Giá trị đơn hàng', 0, MAX_MONEY)
    })
};

// ---------- Kho / quản trị ----------
const inventory = {
    update: z.looseObject({
        availableQty: number('Số lượng tồn kho', 0, 1000000, { integer: true }),
        type: oneOf('Loại giao dịch kho', ['STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT', 'RETURN']),
        reason: text('Lý do', 1000)
    })
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
    userRole: z.looseObject({ role: text('Vai trò', 20) })
};

module.exports = { auth, user, cart, order, review, wishlist, book, category, article, coupon, inventory, admin };
