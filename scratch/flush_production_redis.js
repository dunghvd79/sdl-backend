const { createClient } = require('redis');

const productionRedisUrl = 'rediss://default:gQAAAAAAAlRaAAIgcDIxY2MzNjA0NjdjMmE0ZWI2YTJhM2Y1ODhlMjc0NzYzNA@civil-skylark-152666.upstash.io:6379';

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
