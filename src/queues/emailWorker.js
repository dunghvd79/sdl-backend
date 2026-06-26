const { Worker } = require('bullmq');
const connection = require('./connection');
const EmailService = require('../services/emailService');

let emailWorker = null;

/**
 * Khởi chạy Worker lắng nghe emailQueue
 */
function startEmailWorker() {
    if (emailWorker) return emailWorker;

    console.log('👷 [Worker] Khởi tạo Email Worker...');
    
    emailWorker = new Worker('emailQueue', async (job) => {
        const { toEmail, resetToken, userName } = job.data;
        console.log(`✉️ [Worker] Đang xử lý job ${job.id} (${job.name}) gửi tới: ${toEmail}`);
        
        if (job.name === 'sendResetPassword') {
            await EmailService.sendResetPasswordEmail(toEmail, resetToken, userName);
        } else {
            console.warn(`⚠️ [Worker] Tên job không xác định: ${job.name}`);
        }
    }, {
        connection,
        concurrency: 2 // Xử lý đồng thời tối đa 2 jobs gửi email
    });

    // Lắng nghe sự kiện để ghi log và giám sát
    emailWorker.on('completed', (job) => {
        console.log(`✅ [Worker] Job ${job.id} (${job.name}) gửi thành công tới ${job.data.toEmail}.`);
    });

    emailWorker.on('failed', (job, err) => {
        console.error(`❌ [Worker Error] Job ${job?.id} (${job?.name}) thất bại. Lỗi:`, err.message);
    });

    emailWorker.on('error', (err) => {
        console.error(`❌ [Worker Connection Error] Lỗi kết nối của Worker:`, err.message);
    });

    return emailWorker;
}

module.exports = {
    startEmailWorker
};
