# Implementation Plan: Giới hạn tần suất theo chức năng

**Branch**: `004-rate-limiting` (trên `main`) | **Date**: 2026-11-12 | **Spec**: [spec.md](spec.md)

## Summary

Một module `src/middleware/rateLimits.js` tạo các limiter bằng `express-rate-limit` 8.5.2 (đã có), mỗi
limiter có khoá đếm riêng (IP / tài khoản / IP+email / email / phiên). Bỏ hai limiter cũ trong `app.js`,
gắn limiter theo chức năng ở route.

## Technical Context

Node 20, Express 5, `express-rate-limit` 8.5.2 (`rateLimit`, `ipKeyGenerator`, `MemoryStore`) — không thêm
thư viện. Bộ đếm trong bộ nhớ. Test: Jest + Supertest (mỗi file test có bộ đếm riêng vì module được nạp lại).

## Research

- **R1. Khoá theo IP phải qua `ipKeyGenerator(req.ip)`**: thư viện báo lỗi cấu hình nếu keyGenerator tự
  dùng `req.ip` (IPv6 cần gom theo dải /56). `trust proxy = 1` đã có nên `req.ip` là IP thật sau Render.
- **R2. Đếm theo tài khoản cho giới hạn chung** đặt ở cấp `app` (trước `verifyToken` của route): giải mã
  thẻ truy cập bằng `verifyAccessToken` (không tra DB) để lấy `id`; thẻ hỏng/hết hạn → theo IP.
- **R3. Chỉ đếm lần đăng nhập sai**: `skipSuccessfulRequests: true` (thư viện không đếm phản hồi < 400).
- **R4. Gia hạn phiên theo cookie**: khoá = SHA-256 của cookie `sdl_rt` (không lưu token gốc trong bộ đếm).
- **R5. Phản hồi**: `handler` trả 429 `{ error: '... Vui lòng thử lại sau N phút.' }` (N tính từ
  `req.rateLimit.resetTime`), `standardHeaders: 'draft-8'` + `Retry-After`.
- **R6. Thứ tự middleware**: limiter theo tài khoản (FR-006/007) đặt **sau** `verifyToken` để có `req.user`.
  Limiter xác thực đặt **trước** `validate` để dữ liệu sai cũng bị đếm.

## Constitution Check

| Nguyên tắc | Đánh giá |
|---|---|
| II. Bảo mật | ✅ Chống dò mật khẩu theo tài khoản, chống spam email/đơn hàng |
| III. Test-First | ✅ Test 429 cho từng nhóm đỏ trước khi cài |
| IV. Đơn giản | ✅ Dùng thư viện sẵn có, một module, bộ đếm trong bộ nhớ |
| V. Tương thích | ✅ Giữ `{ error }`; giới hạn chung nới từ 300 → 1000 và theo tài khoản (ít bị chặn nhầm hơn) |

## Structure

```text
src/middleware/rateLimits.js   # MỚI
src/config/app.js              # SỬA: thay 2 limiter cũ bằng apiLimiter
src/routes/{auth,orders,payments,upload,books,categories,articles,coupons,inventory,admin}.js  # SỬA
tests/ratelimit.auth.test.js, tests/ratelimit.user.test.js   # MỚI
```
