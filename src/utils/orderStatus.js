// Máy trạng thái đơn hàng (B46): admin chỉ được chuyển theo bảng dưới.
// - Tiến lên từng bước một (giao diện cũng chỉ có nút "bước kế tiếp").
// - Được lùi một bước sau khi đã xác nhận (sửa khi bấm nhầm); KHÔNG lùi về PENDING vì kho đã bị trừ thật.
// - Được huỷ khi chưa giao (PENDING, CONFIRMED, PACKAGING); KHÔNG huỷ khi đang giao hoặc đã giao.
// - CANCELLED là trạng thái cuối.
// Khi sửa bảng này, cập nhật cả ORDER_TRANSITIONS trong frontend (AdminDashboardPage.jsx).
const ORDER_TRANSITIONS = {
    PENDING: ['CONFIRMED', 'CANCELLED'],
    CONFIRMED: ['PACKAGING', 'CANCELLED'],
    PACKAGING: ['DELIVERING', 'CONFIRMED', 'CANCELLED'],
    DELIVERING: ['DELIVERED', 'PACKAGING'],
    DELIVERED: ['DELIVERING'],
    CANCELLED: []
};

const ORDER_STATUS_LABELS = {
    PENDING: 'Chờ xử lý',
    CONFIRMED: 'Đã xác nhận',
    PACKAGING: 'Đang đóng gói',
    DELIVERING: 'Đang giao hàng',
    DELIVERED: 'Đã giao thành công',
    CANCELLED: 'Đã hủy'
};

function isValidStatus(status) {
    return Object.prototype.hasOwnProperty.call(ORDER_TRANSITIONS, status);
}

function canTransition(from, to) {
    return (ORDER_TRANSITIONS[from] || []).includes(to);
}

module.exports = { ORDER_TRANSITIONS, ORDER_STATUS_LABELS, isValidStatus, canTransition };
