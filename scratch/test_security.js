const axios = require('axios');

async function testXSS() {
    console.log('🧪 [Test 1] Testing XSS Input Sanitization...');
    const maliciousPayload = {
        title: "Sách mới <script>alert('XSS')</script>",
        description: "Mô tả sách có chứa mã độc <img src=x onerror=alert('hack')> và liên kết lạ.",
        author: "Tác giả <a href='javascript:alert(1)'>Nguy hiểm</a>",
        nested: {
            comment: "Bình luận <iframe src='http://malicious.com'></iframe>"
        }
    };

    try {
        const res = await axios.post('http://localhost:3000/api/auth/test-security', maliciousPayload);
        console.log('Original Payload:', JSON.stringify(maliciousPayload, null, 2));
        console.log('\nSanitized Response Body:', JSON.stringify(res.data.body, null, 2));
        
        const hasScript = JSON.stringify(res.data.body).includes('<script>');
        const hasIframe = JSON.stringify(res.data.body).includes('<iframe>');
        
        if (!hasScript && !hasIframe) {
            console.log('✅ XSS test PASSED: Dangerous script/iframe HTML tags were stripped or sanitized!');
        } else {
            console.error('❌ XSS test FAILED: Dangerous tags are still present!');
        }
    } catch (err) {
        console.error('❌ XSS request failed:', err.message);
    }
}

async function testRateLimit() {
    console.log('\n🧪 [Test 2] Testing Auth Rate Limiting...');
    console.log('Making 12 rapid login requests (limit is 10 requests / 15 minutes)...');
    
    let successCount = 0;
    let blockedCount = 0;
    
    for (let i = 1; i <= 12; i++) {
        try {
            // Gửi dữ liệu đăng nhập sai để trigger xử lý nhanh
            await axios.post('http://localhost:3000/api/auth/login', {
                email: `test_limit_${i}@example.com`,
                password: 'wrong_password'
            });
            successCount++;
            console.log(`Request ${i}: Đang xử lý đăng nhập...`);
        } catch (err) {
            if (err.response && err.response.status === 429) {
                blockedCount++;
                console.log(`Request ${i}: ❌ BỊ CHẶN BỞI RATE LIMITER! (Status: 429 - ${JSON.stringify(err.response.data)})`);
            } else if (err.response) {
                // Lỗi mật khẩu sai (400 hoặc 401) có nghĩa là request vẫn vượt qua được rate limiter để vào xử lý logic
                successCount++;
                console.log(`Request ${i}: Vượt qua rate limiter nhưng sai thông tin (Status: ${err.response.status})`);
            } else {
                console.log(`Request ${i}: Lỗi kết nối: ${err.message}`);
            }
        }
        // Giãn cách một chút để không gây nghẽn luồng
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    console.log(`\nKết quả Rate Limiting:`);
    console.log(`- Số request được xử lý logic: ${successCount}`);
    console.log(`- Số request bị chặn (429): ${blockedCount}`);
    
    if (blockedCount > 0) {
        console.log('✅ Rate Limit test PASSED: Brute-force requests were successfully blocked with 429!');
    } else {
        console.error('❌ Rate Limit test FAILED: None of the requests were blocked!');
    }
}

async function runTests() {
    await testXSS();
    await testRateLimit();
}

runTests();
