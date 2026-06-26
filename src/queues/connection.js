const { URL } = require('url');
require('dotenv').config();

let connectionOptions = {};

if (process.env.REDIS_URL) {
    try {
        // Loại bỏ dấu nháy kép nếu có trong biến môi trường
        const cleanUrl = process.env.REDIS_URL.replace(/^"|"$/g, '');
        const redisUrl = new URL(cleanUrl);
        
        connectionOptions = {
            host: redisUrl.hostname,
            port: parseInt(redisUrl.port || '6379'),
            username: redisUrl.username || undefined,
            password: redisUrl.password || undefined,
            tls: redisUrl.protocol === 'rediss:' ? { rejectUnauthorized: false } : undefined,
            maxRetriesPerRequest: null // Yêu cầu bắt buộc của BullMQ để tránh lỗi kết nối lặp
        };
        
        console.log(`ℹ️ BullMQ Connection: Đã cấu hình kết nối tới Redis Host: ${redisUrl.hostname}:${redisUrl.port || 6379} (SSL: ${redisUrl.protocol === 'rediss:'})`);
    } catch (error) {
        console.error('❌ BullMQ Connection Config: Lỗi parse REDIS_URL:', error.message);
        // Fallback về localhost nếu lỗi parse
        connectionOptions = {
            host: '127.0.0.1',
            port: 6379,
            maxRetriesPerRequest: null
        };
    }
} else {
    connectionOptions = {
        host: '127.0.0.1',
        port: 6379,
        maxRetriesPerRequest: null
    };
    console.warn('⚠️ BullMQ Connection: Không tìm thấy REDIS_URL. Sử dụng kết nối mặc định localhost:6379.');
}

module.exports = connectionOptions;
