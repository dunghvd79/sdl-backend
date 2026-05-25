const pool = require('../config/database');

async function run() {
    try {
        console.log('🔄 Đang chạy migration: Tạo bảng articles...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS articles (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                summary TEXT,
                content TEXT NOT NULL,
                cover_url VARCHAR(500),
                category VARCHAR(100) DEFAULT 'Chiêm nghiệm',
                reading_time VARCHAR(50) DEFAULT '5 phút đọc',
                status VARCHAR(50) CHECK (status IN ('DRAFT', 'PUBLISHED', 'HIDDEN')) DEFAULT 'PUBLISHED',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ Bảng articles đã được tạo thành công.');

        // Kiểm tra xem đã có dữ liệu chưa để tránh duplicate seed
        const checkResult = await pool.query('SELECT COUNT(*) FROM articles');
        const count = parseInt(checkResult.rows[0].count);

        if (count === 0) {
            console.log('🌱 Đang chèn 3 bài viết mẫu ban đầu...');
            const seedQuery = `
                INSERT INTO articles (title, summary, content, cover_url, category, reading_time, status)
                VALUES 
                (
                    'Nghệ thuật đọc chậm trong kỷ nguyên số vội vã',
                    'Làm sao để tìm thấy một khoảng lặng bình yên, kết nối sâu sắc với từng trang giấy giữa những thông báo ồn ào từ thế giới mạng xã hội tấp nập?',
                    'Đọc chậm (Slow Reading) không chỉ là một phương pháp đọc sách, mà còn là một nghệ thuật sống. Trong thời đại số ngày nay, khi mọi thứ diễn ra quá nhanh và dồn dập, tâm trí con người dễ bị phân tâm bởi những tiếng thông báo điện thoại không dứt. Đọc chậm giúp chúng ta lắng lại, hiểu sâu sắc hơn về ý nghĩa của tác giả và tìm lại sự yên bình vốn có bên trong tâm hồn.',
                    'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&q=80&w=600',
                    'Chiêm nghiệm',
                    '5 phút đọc',
                    'PUBLISHED'
                ),
                (
                    'Bản đồ tri thức: Những tựa sách định hình bản ngã',
                    'Điểm mặt những tác phẩm văn học kinh điển và tư duy vượt thời gian, giúp mở rộng thế giới quan và nuôi dưỡng tiếng nói độc lập bên trong bạn.',
                    'Mỗi cuốn sách chúng ta đọc đều để lại một dấu ấn trong quá trình hình thành nhân cách và thế giới quan. Những tác phẩm kinh điển như ''Nhà Giả Kim'', ''Đắc Nhân Tâm'' hay các tác phẩm triết học kinh điển chính là những viên gạch vững chắc xây dựng nên bản đồ tri thức của riêng bạn. Việc khám phá những tư tưởng lớn giúp bạn có cái nhìn đa chiều và độc lập hơn đối với cuộc sống xung quanh.',
                    'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&q=80&w=600',
                    'Gợi ý tuyển đọc',
                    '8 phút đọc',
                    'PUBLISHED'
                ),
                (
                    'Phép màu từ việc đọc: Gieo mầm tri thức cho con',
                    'Làm thế nào để kiến tạo một tủ sách gia đình ấm áp, khơi dậy nguồn cảm hứng văn học và thói quen đọc sách tự nhiên trong tâm hồn trẻ thơ?',
                    'Trẻ em không chỉ học từ những gì chúng ta nói, mà học từ những gì chúng ta làm. Xây dựng thói quen đọc sách cho trẻ bắt đầu từ việc kiến tạo một không gian đọc ấm cúng trong gia đình. Cùng con đọc sách mỗi tối không chỉ giúp gieo mầm tri thức mà còn là sợi dây kết nối tình cảm gia đình thiêng liêng, tạo cho con một điểm tựa tinh thần vững chắc.',
                    'https://images.unsplash.com/photo-1507842217343-583bb7270b66?auto=format&fit=crop&q=80&w=600',
                    'Kinh nghiệm',
                    '6 phút đọc',
                    'PUBLISHED'
                );
            `;
            await pool.query(seedQuery);
            console.log('✅ Đã chèn thành công 3 bài viết mẫu.');
        } else {
            console.log('ℹ️ Bảng articles đã có dữ liệu mẫu. Bỏ qua chèn mới.');
        }
    } catch (err) {
        console.error('❌ Lỗi chạy migration:', err.message);
    } finally {
        await pool.end();
    }
}

run();
