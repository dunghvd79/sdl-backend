# Implementation Plan: Xử lý lỗi tập trung cho API

**Branch**: `001-centralized-error-handling` (làm trên `main`) | **Date**: 2026-11-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-centralized-error-handling/spec.md`

## Summary

Thêm lớp `AppError` cho lỗi nghiệp vụ và một middleware lỗi duy nhất ở cuối `app.js`. Controller
chuyển lỗi bằng `next(err)` thay vì tự trả `err.message`; 42 câu `throw` nghiệp vụ trong service/model
chuyển sang `AppError` với đúng mã trạng thái đang dùng (bảng R3). Lỗi hệ thống trả thông báo chung +
`errorId` và ghi chi tiết vào log. Thêm xử lý JSON hỏng (400) và đường dẫn `/api` không tồn tại (404).

## Technical Context

**Language/Version**: Node.js 20, CommonJS

**Primary Dependencies**: Express 5.2, `pg` 8.20, `body-parser` 2.4 — không thêm thư viện mới

**Storage**: PostgreSQL (không đổi schema)

**Testing**: Jest 30 + Supertest 7 trên DB `sdl_test`

**Target Platform**: Render (Linux), log xem qua trang Logs

**Project Type**: web-service (REST API)

**Performance Goals**: Không đổi; middleware lỗi chỉ chạy khi có lỗi

**Constraints**: Giữ hợp đồng `{ error }` mà frontend đọc ở 60 vị trí; giữ mã trạng thái nghiệp vụ

**Scale/Scope**: 72 vị trí trả `err.message` trong 16 controller; 42 câu `throw` trong 7 file service/model

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Nguyên tắc | Đánh giá | Ghi chú |
|---|---|---|
| I. Toàn vẹn dữ liệu & giao dịch | ✅ | Không đổi SQL hay transaction. `next(err)` chỉ thay dòng trả lỗi; các `ROLLBACK` trong `catch` của service giữ nguyên trước khi ném lại |
| II. Bảo mật theo mặc định | ✅ | Đây chính là yêu cầu "không lộ chi tiết nội bộ, đi qua bộ xử lý lỗi tập trung" |
| III. Test-First | ✅ | Viết test cho lỗi nghiệp vụ (đang xanh, khoá hành vi) và test rò rỉ lỗi (phải đỏ) trước khi sửa |
| IV. Đơn giản & thay đổi tối thiểu | ✅ | Một lớp lỗi, một middleware, không thêm thư viện; chỉ đổi dòng trả lỗi trong `catch` |
| V. Tương thích Production | ✅ có ngoại lệ ghi rõ | Giữ `{ error }` và mã nghiệp vụ. Ngoại lệ có chủ đích (research R3, R4): lỗi cấu hình email 400→500; trùng đánh giá 500→400 |

**Re-check sau Phase 1**: thiết kế trong data-model/contracts không vi phạm nguyên tắc nào. Không cần
bảng Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/001-centralized-error-handling/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/error-response.md
└── tasks.md              # do /speckit-tasks tạo
```

### Source Code (repository root)

```text
src/
├── utils/AppError.js            # MỚI: lớp lỗi nghiệp vụ
├── middleware/errorHandler.js   # MỚI: notFound (/api) + errorHandler
├── config/app.js                # SỬA: gắn notFound + errorHandler, bỏ handler cũ
├── controllers/*.js             # SỬA: catch → next(err) (72 vị trí)
├── services/*.js                # SỬA: throw new Error → throw new AppError(msg, status) cho lỗi nghiệp vụ
└── models/Inventory.js          # SỬA: 2 câu throw nghiệp vụ

tests/
├── errors.handler.test.js       # MỚI: lỗi hệ thống, JSON hỏng, 404, 23505
└── errors.business.test.js      # MỚI: lỗi nghiệp vụ giữ nguyên mã + nội dung
```

**Structure Decision**: Giữ kiến trúc `routes → controllers → services → models`. Lớp lỗi đặt ở
`utils/` (dùng chung mọi tầng), middleware ở `middleware/` cạnh `auth.js` và `sanitize.js`.

## Thứ tự triển khai (đầu vào cho /speckit-tasks)

1. Test khoá hành vi lỗi nghiệp vụ tiêu biểu (phải xanh ngay trên code hiện tại).
2. Test rò rỉ lỗi hệ thống, JSON hỏng, 404, trùng UNIQUE (phải đỏ).
3. `AppError` + `errorHandler` + `notFound`, gắn vào `app.js`.
4. Chuyển `throw` nghiệp vụ sang `AppError` theo bảng R3 (auth → cart/inventory → order → payment → ai).
5. Đổi `catch` của controller sang `next(err)` theo từng nhóm, chạy `npm test` sau mỗi nhóm.
6. Kiểm tra SC-001 bằng grep, chạy toàn bộ bộ test, smoke test server thật.

## Complexity Tracking

Không có vi phạm cần biện minh.
