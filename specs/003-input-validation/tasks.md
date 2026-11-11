# Tasks: Kiểm tra dữ liệu đầu vào theo lược đồ

**Tests**: bắt buộc (constitution III). Test dữ liệu sai phải ĐỎ trước khi thêm lược đồ; test payload
giao diện thực tế phải XANH trước và sau.

## Phase 1: Setup / Foundational

- [x] T001 Mốc `npm test` (69 xanh); cài `zod@^4`
- [x] T002 src/middleware/validate.js + src/validators/common.js

## Phase 2: US2 — khoá payload giao diện (XANH trước khi sửa)

- [x] T003 tests/validation.compat.test.js: payload thực tế của giao diện cho sửa sách (trường thừa, số dạng chuỗi), tạo mã giảm giá (ngày `YYYY-MM-DDTHH:mm`, `max_discount_amount: null`), cập nhật kho, thêm giỏ bằng hashId, đánh giá, hồ sơ, `/books?limit=500&adminMode=true` → đều thành công

## Phase 3: US1 — dữ liệu sai bị từ chối (ĐỎ trước khi sửa)

- [x] T004 tests/validation.reject.test.js (khách): giỏ (số lượng 0/âm/100/"abc"), đặt hàng (tên 300 ký tự, couponCode là object), đánh giá (nhận xét > 2000), hồ sơ (họ tên > 255), đăng nhập (email là object), `/books?limit=1000`
- [x] T005 tests/validation.reject.test.js (phần quản trị): sách (giá âm, tiêu đề 300, status lạ), danh mục (tên 150), mã giảm giá (PERCENT 150, ngày kết thúc trước bắt đầu, usage_limit 0), kho (type lạ, số lượng âm), bài viết (reading_time 60 ký tự), đổi role lạ
- [x] T006 Lược đồ + gắn route: auth, users, cart, orders, reviews, wishlist
- [x] T007 Lược đồ + gắn route: books, categories, articles, coupons, inventory, admin
- [x] T008 `npm test` xanh toàn bộ

## Phase 4: Polish

- [ ] T009 Smoke test server thật; cổng trước commit; commit + push; xác nhận production
- [ ] T010 CLAUDE.md (quy ước validate), BACKLOG (đóng B7, thêm gom kiểm tra thiếu trường vào lược đồ), PROJECT_CONTEXT
