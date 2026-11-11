// Cấu hình Jest cho test API (Supertest) chạy trên DB Postgres riêng `sdl_test`.
// Chạy tuần tự (--runInBand trong npm script) vì các file test dùng chung một DB.
module.exports = {
    testEnvironment: 'node',
    testMatch: ['<rootDir>/tests/**/*.test.js'],
    setupFiles: ['<rootDir>/tests/setup/env.js'],
    globalSetup: '<rootDir>/tests/setup/globalSetup.js',
    testTimeout: 20000
};
