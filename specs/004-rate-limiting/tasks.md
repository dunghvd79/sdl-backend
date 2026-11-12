# Tasks: Giới hạn tần suất theo chức năng

- [x] T001 Mốc `npm test` (100 xanh)
- [x] T002 [US1] tests/ratelimit.auth.test.js (ĐỎ): 5 lần sai email A → lần 6 bị 429 kể cả đúng mật khẩu; 15 lần đăng nhập đúng không bị 429; email B vẫn thử được khi A bị chặn; quên mật khẩu email X lần 4/giờ → 429; phản hồi 429 có `error` tiếng Việt + header `retry-after`
- [x] T003 [US2][US3] tests/ratelimit.user.test.js (ĐỎ): tài khoản A dùng hết hạn mức chung, tài khoản B cùng IP vẫn gọi được; đặt đơn thứ 11/phút → 429 và không tạo đơn; refresh lần 11/15 phút cho một phiên → 429
- [x] T004 src/middleware/rateLimits.js (limiter + keyGenerator theo R1–R5)
- [x] T005 Gắn limiter: app.js (bỏ 2 limiter cũ, thêm apiLimiter), auth routes, orders/payments, upload, reviews, ghi của quản trị
- [x] T006 `npm test` xanh toàn bộ; kiểm chứng test bắt lỗi (tắt limiter → đỏ)
- [x] T007 Smoke test, cổng trước commit, commit + push, xác nhận production
- [x] T008 CLAUDE.md, BACKLOG (đóng B35, B39 phần rate limit; cập nhật B18), PROJECT_CONTEXT
