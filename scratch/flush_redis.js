const { createClient } = require('redis');
require('dotenv').config();

async function flushRedis() {
    console.log('⏳ Đang kết nối tới Upstash Redis để xóa cache...');
    if (!process.env.REDIS_URL) {
        console.error('❌ Lỗi: REDIS_URL không được cấu hình trong .env!');
        return;
    }

    const client = createClient({
        url: process.env.REDIS_URL
    });

    try {
        await client.connect();
        console.log('✅ Đã kết nối thành công tới Redis.');
        
        console.log('🧹 Đang thực hiện xóa sạch toàn bộ cache (FLUSHALL)...');
        await client.flushAll();
        console.log('✅ Đã xóa sạch toàn bộ cache thành công!');
    } catch (e) {
        console.error('❌ Lỗi khi xóa cache:', e.message);
    } finally {
        await client.disconnect();
    }
}

flushRedis();
