// Cấu hình môi trường test dùng chung cho env.js (từng file test) và globalSetup.js.
// Chỉ trỏ vào hạ tầng LOCAL: Postgres `sdl_postgres` (DB riêng sdl_test) và Redis test cổng 6380.
// Thông tin đăng nhập là giá trị mặc định của Docker local, không phải bí mật production.
module.exports = {
    NODE_ENV: 'test',
    DB_HOST: 'localhost',
    DB_PORT: '5432',
    DB_USER: 'sdl_user',
    DB_PASSWORD: 'sdl_password_123',
    DB_NAME: 'sdl_test',
    REDIS_URL: 'redis://localhost:6380',
    JWT_SECRET: 'test_jwt_secret_only_for_jest',
    JWT_EXPIRY: '1h',
    FRONTEND_URL: 'http://localhost:5173',
    // Không gọi dịch vụ thật trong test
    AI_SERVICE_URL: 'http://127.0.0.1:1',
    RESEND_API_KEY: '',
    PAYOS_CLIENT_ID: '',
    PAYOS_API_KEY: '',
    PAYOS_CHECKSUM_KEY: ''
};
