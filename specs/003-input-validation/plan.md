# Implementation Plan: Kiểm tra dữ liệu đầu vào theo lược đồ

**Branch**: `003-input-validation` (trên `main`) | **Date**: 2026-11-12 | **Spec**: [spec.md](spec.md)

## Summary

Thêm Zod 4 và middleware `validate({ body, query, params })` chạy trước controller. Lược đồ khai báo theo
nhóm trong `src/validators/`. Lỗi → `AppError(<câu tiếng Việt của issue đầu tiên>, 400)` qua
`errorHandler` (spec 001). Lược đồ **chỉ kiểm tra, không thay `req.body`** (giữ nguyên dữ liệu controller
đang nhận), cho phép trường thừa, ép kiểu số từ chuỗi khi kiểm tra.

## Technical Context

**Language/Version**: Node.js 20, CommonJS · **Primary Dependencies**: Express 5, **Zod 4.x** (mới) ·
**Storage**: PostgreSQL (không đổi) · **Testing**: Jest + Supertest · **Constraints**: không phá payload giao
diện hiện có (research R2) · **Scope**: ~30 endpoint ghi + 4 endpoint danh sách

## Constitution Check

| Nguyên tắc | Đánh giá |
|---|---|
| I. Toàn vẹn dữ liệu | ✅ Chặn dữ liệu sai trước khi ghi |
| II. Bảo mật | ✅ Đây là yêu cầu "kiểm tra bằng schema tại biên" |
| III. Test-First | ✅ Test đỏ cho từng nhóm trước khi thêm lược đồ |
| IV. Đơn giản | ✅ Một middleware; thêm 1 thư viện đã chốt trong constitution; không gom/sửa kiểm tra sẵn có |
| V. Tương thích | ✅ Giữ câu thông báo thiếu trường; lược đồ cho phép trường thừa, số dạng chuỗi, `limit` ≤ 500 |

## Research (tóm tắt)

- **R1. Zod 4**: `z.looseObject` (giữ trường thừa), `z.coerce.number()` cho số từ form, thông báo lỗi
  tuỳ biến qua tham số `error`. Không dùng bản địa hoá toàn cục: mỗi trường tự có câu tiếng Việt.
- **R2. Payload giao diện thực tế** (đã đọc `AdminDashboardPage.jsx`, `CartPage.jsx`, `CheckoutPage.jsx`...):
  sách gửi `categoryIds`, `images`, `display_order` có thể là chuỗi; mã giảm giá gửi ngày
  `YYYY-MM-DDTHH:mm`, `max_discount_amount` có thể `null`; kho gửi `availableQty` số, `type`
  STOCK_IN/STOCK_OUT; `bookId` là hashId hoặc số; `limit` lên tới 500 (`/books?limit=500&adminMode=true`).
- **R3. Không thay `req.body` bằng dữ liệu đã parse**: tránh làm rơi trường controller cần mà lược đồ
  không khai báo; controller tự ép kiểu như hiện nay.
- **R4. Thiếu trường**: trường đã có câu báo thiếu trong controller để `optional()` trong lược đồ, để
  controller trả đúng câu cũ (FR-005).

## Phạm vi lược đồ

| Nhóm | Endpoint |
|---|---|
| auth | login, register, forgot-password, reset-password (kiểu chuỗi, độ dài) |
| users | PUT /users/profile, PUT /users/change-password |
| cart | add, add-batch, remove-bulk, checkout |
| orders | POST /orders/checkout, PUT /orders/:id/cancel |
| reviews / wishlist | POST /books/:id/reviews, POST /wishlists/toggle |
| books | POST/PUT /books, GET /books (query) |
| categories | POST/PUT /categories, POST /categories/:id/books |
| articles | POST/PUT /articles, GET /articles (query) |
| coupons | POST/PUT /coupons, PATCH toggle, GET /coupons/validate (query) |
| inventory | PUT /inventory/:bookId |
| admin | PUT orders/:id/status, users/:id/role, users/:id/status, GET /admin/orders (query) |

## Project Structure

```text
src/middleware/validate.js       # MỚI
src/validators/common.js         # MỚI: bookId, idList, chuỗi có giới hạn, số nguyên khoảng
src/validators/schemas.js        # MỚI: mọi nhóm lược đồ trong một file (đổi so với dự kiến tách 11 file — gọn hơn, ~200 dòng)
src/routes/*.js                  # SỬA: gắn validate(...)
tests/validation.*.test.js       # MỚI
```

## Complexity Tracking

Không có vi phạm.
