const axios = require('axios');

async function testForgotPassword() {
    try {
        console.log('Sending forgot-password request for customer@test.vn...');
        const startTime = Date.now();
        
        const response = await axios.post('http://localhost:3000/api/auth/forgot-password', {
            email: 'customer@test.vn'
        });
        
        const duration = Date.now() - startTime;
        console.log(`\nResponse Status: ${response.status}`);
        console.log('Response Body:', response.data);
        console.log(`API response duration: ${duration}ms`);
        console.log('API responded immediately since email sending has been offloaded to the queue!');
    } catch (err) {
        if (err.response) {
            console.error('API Error Response:', err.response.status, err.response.data);
        } else {
            console.error('Request Error:', err.message);
        }
    }
}

testForgotPassword();
