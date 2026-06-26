const { Queue } = require('bullmq');
const connection = require('./connection');

// Khởi tạo Queue gửi email
const emailQueue = new Queue('emailQueue', {
    connection,
    defaultJobOptions: {
        attempts: 3, // Thử lại tối đa 3 lần nếu xảy ra lỗi
        backoff: {
            type: 'exponential',
            delay: 5000 // Chờ 5 giây trước khi thử lại lần đầu, tăng dần theo hàm mũ
        },
        removeOnComplete: true, // Tự động dọn dẹp job thành công khỏi Redis để tiết kiệm bộ nhớ
        removeOnFail: {
            age: 24 * 3600 // Lưu trữ job lỗi trong 24 giờ để theo dõi debug
        }
    }
});

/**
 * Thêm một job gửi email khôi phục mật khẩu vào hàng đợi
 * @param {string} toEmail - Email người nhận
 * @param {string} resetToken - Token reset mật khẩu
 * @param {string} userName - Tên người nhận
 */
async function queueResetPasswordEmail(toEmail, resetToken, userName) {
    try {
        const job = await emailQueue.add('sendResetPassword', {
            toEmail,
            resetToken,
            userName
        });
        console.log(`📥 [Queue] Đã thêm job gửi mail khôi phục mật khẩu. JobID: ${job.id} tới: ${toEmail}`);
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
