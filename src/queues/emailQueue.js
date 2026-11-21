const { Queue } = require('bullmq');
const connection = require('./connection');

// Thêm job: chờ hàng đợi kết nối được Redis tối đa chừng này, quá hạn thì coi như Redis chết và gửi mail trực tiếp (B81).
const QUEUE_READY_TIMEOUT_MS = 3000;

// Khởi tạo Queue gửi email. maxRetriesPerRequest: 1 → lệnh gửi lên Redis báo lỗi thay vì chờ mãi khi mất kết nối
// giữa chừng (giá trị null chỉ bắt buộc với Worker).
const emailQueue = new Queue('emailQueue', {
    connection: { ...connection, maxRetriesPerRequest: 1 },
    defaultJobOptions: {
        attempts: 3, // Thử lại tối đa 3 lần nếu xảy ra lỗi
        backoff: {
            type: 'exponential',
            delay: 5000 // Chờ 5 giây trước khi thử lại lần đầu, tăng dần theo hàm mũ
        },
        // Job chứa token đặt lại mật khẩu GỐC (DB chỉ lưu băm) → xong là xoá, kể cả khi lỗi (B82). Lý do lỗi đã ghi
        // log ở worker. (removeOnFail theo `age` không đủ: BullMQ chỉ dọn khi có job khác kết thúc, job cũ có thể
        // nằm lại nhiều ngày.)
        removeOnComplete: true,
        removeOnFail: true
    }
});
emailQueue.on('error', (err) => console.error('❌ [Queue] Lỗi kết nối Redis:', err.message));

// Chờ Queue sẵn sàng, tối đa QUEUE_READY_TIMEOUT_MS. BullMQ chờ kết nối VÔ HẠN trước khi gửi lệnh, nên nếu gọi thẳng
// `add` khi Redis chết, request treo mãi và nhánh gửi trực tiếp không bao giờ chạy (B81). Chỉ gọi `add` sau khi
// sẵn sàng → không có job "treo" tự chạy khi Redis sống lại (tránh gửi trùng với nhánh gửi trực tiếp).
async function waitForQueue() {
    let timer;
    const ready = emailQueue.waitUntilReady();
    ready.catch(() => {}); // lời hứa còn treo sau khi hết hạn: không để thành unhandled rejection
    try {
        await Promise.race([
            ready,
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error('Redis chưa sẵn sàng')), QUEUE_READY_TIMEOUT_MS);
            })
        ]);
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Thêm một job gửi email khôi phục mật khẩu vào hàng đợi
 * @param {string} toEmail - Email người nhận
 * @param {string} resetToken - Token reset mật khẩu
 * @param {string} userName - Tên người nhận
 */
async function queueResetPasswordEmail(toEmail, resetToken, userName) {
    try {
        await waitForQueue();
        const job = await emailQueue.add('sendResetPassword', {
            toEmail,
            resetToken,
            userName
        });
        console.log(`📥 [Queue] Đã thêm job gửi mail khôi phục mật khẩu. JobID: ${job.id}`); // không in email (B82)
        return job;
    } catch (error) {
        console.error('❌ [Queue Error] Không thể thêm job vào hàng đợi BullMQ:', error.message);
        console.log('🔄 [Queue Fallback] Thực hiện gửi email trực tiếp đồng bộ...');
        
        // Cơ chế Graceful Fallback: nếu Queue lỗi (ví dụ mất kết nối Redis), gửi trực tiếp bằng EmailService
        try {
            const EmailService = require('../services/emailService');
            return await EmailService.sendResetPasswordEmail(toEmail, resetToken, userName);
        } catch (fallbackError) {
            console.error('❌ [Queue Fallback Error] Gửi email trực tiếp đồng bộ thất bại:', fallbackError.message);
            throw fallbackError;
        }
    }
}

module.exports = {
    emailQueue,
    queueResetPasswordEmail
};
