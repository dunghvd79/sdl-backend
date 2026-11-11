---

description: "Task list for 001 centralized error handling"
---

# Tasks: Xử lý lỗi tập trung cho API

**Input**: Design documents from `specs/001-centralized-error-handling/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/error-response.md

**Tests**: Bắt buộc theo constitution (nguyên tắc III — TDD). Test khoá hành vi phải xanh trước khi
sửa; test cho hành vi mới phải đỏ trước khi sửa.

**Organization**: Theo user story của spec. **Thứ tự thực hiện US2 trước US1** dù cùng P1: nếu đổi
controller sang `next(err)` (US1) trước khi các lỗi nghiệp vụ là `AppError` (US2), mọi lỗi nghiệp vụ
sẽ thành 500 chung và phá vỡ giao diện.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: chạy song song được (file khác nhau, không phụ thuộc task chưa xong)
- **[Story]**: US1, US2, US3 theo spec.md

---

## Phase 1: Setup

- [x] T001 Chạy `npm test` ghi nhận mốc (20 test xanh) trước khi sửa

---

## Phase 2: Foundational (chặn mọi user story)

- [x] T002 Tạo lớp `AppError(message, statusCode = 400)` với `name = 'AppError'` trong src/utils/AppError.js
- [x] T003 Tạo src/middleware/errorHandler.js gồm `notFound` (404 `{ error: 'Không tìm thấy đường dẫn API.' }`) và `errorHandler`: `AppError` → `{ error: message }` với `statusCode`; còn lại → 500 `{ error: 'Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.', errorId }` + `console.error('[error <errorId>] <METHOD> <path>: <message>', stack)`; `NODE_ENV=development` thêm `detail`; `res.headersSent` → `next(err)`
- [x] T004 Gắn `notFound` cho `/api` sau mọi route và `errorHandler` cuối cùng, xoá handler cũ (dòng `console.error(err.stack)`) trong src/config/app.js

**Checkpoint**: `npm test` vẫn 20/20 (controller chưa đổi nên hành vi không đổi).

---

## Phase 3: User Story 2 — Lỗi nghiệp vụ giữ nguyên (P1, làm trước)

**Goal**: Mọi lỗi nghiệp vụ là `AppError` với đúng mã hiện tại (research R3).

**Independent Test**: tests/errors.business.test.js xanh trước và sau khi sửa.

### Tests (khoá hành vi — phải XANH ngay trên code hiện tại)

- [x] T005 [US2] Viết tests/errors.business.test.js: đăng ký email trùng (400, "Email này đã được đăng ký!"), đặt hàng giỏ trống (400, "Giỏ hàng trống, không thể thanh toán!"), thêm vào giỏ sách không tồn tại (400, "Không tìm thấy cuốn sách này"), đặt quá số lượng kho (400, "Kho chỉ còn 1 cuốn" hoặc thông báo kho không đủ hiện tại), huỷ đơn của người khác (400, "Bạn không có quyền hủy đơn hàng này!"), đặt lại mật khẩu token sai (400)

### Implementation

- [x] T006 [P] [US2] Đổi 6 câu throw sang `AppError` (register/forgot/reset 400, login 401) trong src/services/authService.js
- [x] T007 [P] [US2] Đổi 9 câu throw sang `AppError(…, 400)` trong src/services/cartService.js
- [x] T008 [P] [US2] Đổi 16 câu throw sang `AppError(…, 400)` trong src/services/orderService.js
- [x] T009 [P] [US2] Đổi 2 câu throw nghiệp vụ sang `AppError(…, 400)` trong src/models/Inventory.js
- [x] T010 [P] [US2] Đổi 2 câu throw của `processPayOSWebhook` (chữ ký sai, không tìm thấy giao dịch) sang `AppError(…, 400)`; giữ `Error` cho lỗi cấu hình/không lấy được link trong src/services/paymentService.js
- [x] T011 [P] [US2] `askQuestion` → `AppError(…, 500)` giữ câu "Hệ thống AI đang bận..."; `uploadBookPDF`/`resetBookRAG` → `AppError(<câu chính>, 500)`, bỏ chi tiết AI Service nối vào (chỉ log) trong src/services/aiService.js
- [x] T012 [US2] Chạy `npm test`: T005 vẫn xanh, toàn bộ bộ test xanh

---

## Phase 4: User Story 1 — Không lộ chi tiết nội bộ (P1)

**Goal**: 0/72 vị trí còn trả `err.message`; lỗi hệ thống → 500 chung + `errorId`, log có chi tiết.

**Independent Test**: tests/errors.handler.test.js (phần lỗi hệ thống).

### Tests (phải ĐỎ trước khi sửa)

- [x] T013 [US1] Viết tests/errors.handler.test.js phần lỗi hệ thống: (a) `GET /api/orders` khi model ném `Error('relation "orders" does not exist')` → 500, `error` là câu chung, có `errorId`, body không chứa "relation"; (b) `POST /api/cart/add` khi DB lỗi (trước đây 400) → 500 chung; (c) `console.error` được gọi với chuỗi chứa đúng `errorId` và thông báo gốc

### Implementation (mỗi file một task, đổi `catch` → `next(err)`, thêm tham số `next`)

- [x] T014 [P] [US1] src/controllers/authController.js (5 vị trí)
- [x] T015 [P] [US1] src/controllers/userController.js (3)
- [x] T016 [P] [US1] src/controllers/cartController.js (6)
- [x] T017 [P] [US1] src/controllers/orderController.js (5)
- [x] T018 [P] [US1] src/controllers/paymentController.js (`getPaymentUrl`, `webhook`); `payosWebhook` giữ phản hồi riêng cho PayOS: `AppError` → 400 + message, lỗi khác → 500 chung, không lộ message
- [x] T019 [P] [US1] src/controllers/bookController.js (3) và src/controllers/reviewController.js (2)
- [x] T020 [P] [US1] src/controllers/categoryController.js (7)
- [x] T021 [P] [US1] src/controllers/articleController.js (6)
- [x] T022 [P] [US1] src/controllers/couponController.js (7; giữ nguyên nhánh `23505` đã có thông báo riêng)
- [x] T023 [P] [US1] src/controllers/inventoryController.js (3)
- [x] T024 [P] [US1] src/controllers/adminController.js (9)
- [x] T025 [P] [US1] src/controllers/aiController.js (4)
- [x] T026 [P] [US1] src/controllers/notificationController.js (3) và src/controllers/wishlistController.js (3)
- [x] T027 [US1] Rà middleware/route còn trả `err.message`: src/middleware/auth.js (`verifyToken` trả 500 err.message) → `next(err)`; src/routes/upload.js: route `/cover` → `next(err)`, middleware lỗi riêng chỉ xử lý `MulterError` và lỗi `fileFilter` (đổi sang `AppError`), còn lại `next(err)`
- [x] T028 [US1] Chạy `npm test`: T013 xanh, toàn bộ bộ test xanh

---

## Phase 5: User Story 3 — JSON hỏng, 404, trùng dữ liệu (P2)

**Independent Test**: tests/errors.handler.test.js (phần định dạng).

- [x] T029 [US3] Thêm vào tests/errors.handler.test.js (phải ĐỎ): JSON sai cú pháp → 400 "Dữ liệu gửi lên không đúng định dạng JSON."; `GET /api/khong-ton-tai` → 404 JSON; tạo danh mục trùng tên → 400 "Dữ liệu này đã tồn tại." và không chứa "categories_name_key"
- [x] T030 [US3] Thêm ánh xạ `err.type === 'entity.parse.failed'` → 400 và `err.code === '23505'` → 400 trong src/middleware/errorHandler.js
- [x] T031 [US3] Chạy `npm test`: toàn bộ xanh

---

## Phase 6: Polish

- [x] T032 Kiểm tra SC-001: `grep -rnE "json\(\{ *error: *(err|error|e)\.message" src` không còn kết quả
- [x] T033 Smoke test server thật theo quickstart.md (JSON hỏng, 404, API chính 200)
- [x] T034 Ghi quy ước "ném `AppError` cho lỗi nghiệp vụ, controller `next(err)`" vào CLAUDE.md
- [x] T035 Cập nhật docs/BACKLOG.md (mục mới phát hiện) và ../PROJECT_CONTEXT.local.md
- [x] T036 Cổng trước commit: `npm test` xanh, `node --check` các file sửa, diff không có bí mật; commit + push

---

## Dependencies & Execution Order

- Phase 1 → Phase 2 → **US2 (Phase 3)** → **US1 (Phase 4)** → US3 (Phase 5) → Polish.
- US1 phụ thuộc US2 (lý do ở đầu file). US3 chỉ phụ thuộc Phase 2.
- Trong mỗi phase: test trước, implementation sau, chạy `npm test` ở checkpoint.

### Parallel Opportunities

- T006–T011 khác file, song song được.
- T014–T026 khác file, song song được.

## Implementation Strategy

Một người làm tuần tự theo thứ tự trên, chạy `npm test` sau mỗi nhóm; commit một lần ở T036 (hoặc
sau từng phase nếu muốn điểm khôi phục).
