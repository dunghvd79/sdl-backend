// Chạy trước mỗi file test, trước khi require app.
// Ghi đè biến môi trường để dotenv (không override biến đã có) không thể kéo .env local vào.
const testConfig = require('./testConfig');

Object.assign(process.env, testConfig);
