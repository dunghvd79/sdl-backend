const { createClient } = require('redis');
require('dotenv').config();

let client = null;
let isConnected = false;

if (process.env.REDIS_URL) {
    client = createClient({
        url: process.env.REDIS_URL,
        pingInterval: 30000, // Gửi lệnh PING mỗi 30 giây để giữ kết nối sống (chống timeout của Upstash)
        socket: {
            keepAlive: 15000, // Bật TCP Keep-Alive gửi gói tin sau mỗi 15 giây
            reconnectStrategy: (retries) => {
                // Tự động kết nối lại sau 2 giây, giới hạn thử lại tối đa để tránh nghẽn
                if (retries > 20) {
                    console.error('❌ Redis: Đã thử kết nối lại quá 20 lần nhưng thất bại.');
                    return new Error('Redis connection lost');
                }
                return 2000;
            }
        }
    });

    client.on('connect', () => {
        isConnected = true;
        console.log('✅ Redis: Đã kết nối thành công.');
    });

    client.on('error', (err) => {
        isConnected = false;
        console.error('❌ Redis: Lỗi kết nối:', err.message);
    });

    // Kết nối bất đồng bộ, catch lỗi để không gây sập ứng dụng (Graceful Fallback)
    client.connect().catch((err) => {
        isConnected = false;
        console.error('❌ Redis: Không thể kết nối tới server:', err.message);
    });
} else {
    console.warn('⚠️ Cảnh báo: Biến môi trường REDIS_URL không được cấu hình. Bộ nhớ đệm Caching sẽ bị vô hiệu hóa.');
}

/**
 * Lấy dữ liệu cache và parse JSON tự động
 * @param {string} key 
 * @returns {Promise<any|null>} Dữ liệu đã parse hoặc null nếu không tồn tại/lỗi
 */
async function getCache(key) {
    if (!isConnected || !client) return null;
    try {
        const value = await client.get(key);
        return value ? JSON.parse(value) : null;
    } catch (err) {
        console.error(`[Redis Get Error] Key: ${key}`, err.message);
        return null;
    }
}

/**
 * Lưu dữ liệu vào cache dưới dạng JSON string
 * @param {string} key 
 * @param {any} value Dữ liệu cần cache (Object, Array, Primitive)
 * @param {number} ttlSeconds Thời gian sống (mặc định 1 giờ = 3600s)
 * @returns {Promise<boolean>}
 */
async function setCache(key, value, ttlSeconds = 3600) {
    if (!isConnected || !client) return false;
    try {
        const stringVal = JSON.stringify(value);
        if (ttlSeconds) {
            await client.setEx(key, ttlSeconds, stringVal);
        } else {
            await client.set(key, stringVal);
        }
        return true;
    } catch (err) {
        console.error(`[Redis Set Error] Key: ${key}`, err.message);
        return false;
    }
}

/**
 * Xóa một key cụ thể khỏi cache
 * @param {string} key 
 * @returns {Promise<boolean>}
 */
async function delCache(key) {
    if (!isConnected || !client) return false;
    try {
        await client.del(key);
        return true;
    } catch (err) {
        console.error(`[Redis Del Error] Key: ${key}`, err.message);
        return false;
    }
}

/**
 * Xóa danh sách key khớp với mẫu (Pattern)
 * @param {string} pattern Ví dụ: 'books:*' hoặc 'categories:*'
 * @returns {Promise<boolean>}
 */
async function clearCachePattern(pattern) {
    if (!isConnected || !client) return false;
    try {
        const keys = await client.keys(pattern);
        if (keys && keys.length > 0) {
            await client.del(keys);
            console.log(`🧹 Redis: Đã xóa ${keys.length} keys khớp mẫu "${pattern}"`);
        }
        return true;
    } catch (err) {
        console.error(`[Redis Clear Pattern Error] Pattern: ${pattern}`, err.message);
        return false;
    }
}

module.exports = {
    client,
    isConnected: () => isConnected,
    getCache,
    setCache,
    delCache,
    clearCachePattern
};
