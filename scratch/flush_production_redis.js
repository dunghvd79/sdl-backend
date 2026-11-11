const { createClient } = require('redis');

require('dotenv').config();
const productionRedisUrl = process.env.PROD_REDIS_URL;
if (!productionRedisUrl) { console.error('❌ Thiếu biến môi trường PROD_REDIS_URL (rediss://... của Upstash). Xem database/README.md.'); process.exit(1); }

async function flushProductionRedis() {
    console.log('⏳ Đang kết nối tới Production Upstash Redis để xóa cache...');
    const client = createClient({
        url: productionRedisUrl
    });

    try {
        await client.connect();
        console.log('✅ Kết nối thành công.');
        
        console.log('🧹 Đang xóa sạch toàn bộ cache Production (FLUSHALL)...');
        await client.flushAll();
        console.log('✅ Đã xóa sạch toàn bộ cache Production thành công!');
    } catch (e) {
        console.error('❌ Lỗi khi xóa cache Production:', e.message);
    } finally {
        await client.disconnect();
        console.log('🔌 Kết nối đóng.');
    }
}

flushProductionRedis();
