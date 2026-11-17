# Implementation Plan: Đăng nhập bằng Google

**Branch**: `005-google-sign-in` (làm trên `main` của cả hai repo) | **Date**: 2026-11-17 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/005-google-sign-in/spec.md`

## Summary

Frontend dùng Google Identity Services lấy **ID token** (OpenID Connect) và gửi `POST /api/auth/google`.
Backend xác minh token bằng `google-auth-library` (chữ ký RS256 với khoá công khai của Google, `aud` =
`GOOGLE_CLIENT_ID`, `iss`, hạn dùng) + `email_verified`, nhận diện theo `sub` (cột mới `users.google_sub`),
tìm / liên kết / tạo tài khoản rồi cấp **phiên của hệ thống** đúng như `/auth/login` (spec 002). Liên kết
theo email huỷ mật khẩu cũ, mã đặt lại và mọi phiên (chống chiếm tài khoản trước, vì chưa xác minh email —
B56). `password_hash` được phép NULL cho tài khoản chỉ dùng Google; đăng nhập mật khẩu / đổi mật khẩu xử lý
NULL; hồ sơ trả `has_password`. Chủ dự án đã duyệt: gộp cả tài khoản ADMIN / CURATOR (giữ vai trò); không
làm huỷ liên kết.

## Technical Context

**Language/Version**: Backend Node.js 20 CommonJS; Frontend React 19 + Vite 5

**Primary Dependencies**: Express 5, `pg`, Zod 4, `jsonwebtoken` (có sẵn — dùng trong test để ký token
giả lập), **thêm `google-auth-library`** (backend, lý do: R2). Frontend không thêm thư viện (tải script GIS).

**Storage**: PostgreSQL — `users` thêm `google_sub`, `email_verified_at`; `password_hash` bỏ NOT NULL
(migration idempotent trong `database.js`, xem [data-model.md](data-model.md))

**Testing**: Jest 30 + Supertest (backend, DB `sdl_test`; chỉ thay `getCerts` — dịch vụ ngoài — bằng khoá
RSA của test); Vitest + Testing Library (frontend)

**Target Platform**: Render (backend), Cloudflare Pages (frontend), trình duyệt hiện đại

**Project Type**: web-service + SPA (hai repo `sdl-backend`, `sdl-frontend`)

**Performance Goals**: Đăng nhập Google < 2 giây phía máy chủ khi đã cache khoá Google; không thêm truy
vấn nào cho các request khác

**Constraints**: Không có client secret ở bất kỳ đâu; không lưu access token Google; frontend và API khác
site (cookie bên thứ ba — B19, giữ nguyên); thiếu cấu hình Google không được chặn khởi động

**Scale/Scope**: Backend ~9 file sửa + 3 file mới (service, test, migration trong database.js); frontend
~6 file sửa + 2 file mới (GoogleLoginButton + test)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Nguyên tắc | Đánh giá | Ghi chú |
|---|---|---|
| I. Toàn vẹn dữ liệu & giao dịch | ✅ | Liên kết (UPDATE users + thu hồi phiên) chạy trong một transaction có advisory lock theo user (`withUserLock`), UPDATE có điều kiện `google_sub IS NULL`; tạo mới dựa vào UNIQUE (`google_sub`, `LOWER(email)`) + tra lại khi `23505`. SQL tham số hoá. Migration idempotent |
| II. Bảo mật theo mặc định | ✅ | Xác minh đủ chữ ký / aud / iss / exp / email_verified; nhận diện theo `sub`; huỷ mật khẩu + phiên khi liên kết; `requireAllowedOrigin` chống login CSRF; Zod cho body; rate limit; lỗi chung không lộ lý do xác minh thất bại; `GOOGLE_CLIENT_ID` từ biến môi trường; `npm audit` sau khi thêm thư viện |
| III. Test-First | ✅ | Test backend/frontend viết trước, đỏ trước khi cài đặt. Mock duy nhất: lấy khoá công khai của Google (dịch vụ ngoài); phần xác minh chạy thật trên token ký bằng khoá RSA của test |
| IV. Đơn giản & thay đổi tối thiểu | ✅ | Một thư viện mới có lý do (R2); dùng lại `issueSession`, `withUserLock`, `revokeAllForUser`, `startSession`, `env.js`. Không làm huỷ liên kết, không trang quản lý phương thức đăng nhập |
| V. Tương thích Production | ✅ | Không phá hợp đồng cũ: chỉ thêm endpoint, thêm trường `has_password`; `/auth/login` với tài khoản có mật khẩu không đổi. `DROP NOT NULL` không mất dữ liệu. Thiếu `GOOGLE_CLIENT_ID` → cảnh báo + 503, server vẫn chạy. Deploy backend trước frontend |

**Re-check sau Phase 1**: đạt. Không cần Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/005-google-sign-in/
├── plan.md · research.md · data-model.md · quickstart.md
├── contracts/auth-google-api.md
├── checklists/requirements.md
└── tasks.md            # /speckit-tasks
```

### Source Code (repository root)

```text
sdl-project/                                   # backend (repo sdl-backend)
├── src/
│   ├── config/database.js                     # migration: google_sub, email_verified_at, DROP NOT NULL
│   ├── config/env.js                          # cảnh báo thiếu GOOGLE_CLIENT_ID
│   ├── services/googleIdentity.js             # MỚI: getCerts + verifyGoogleIdToken (R2)
│   ├── services/authService.js                # loginWithGoogle (tìm / liên kết / tạo, R3–R5); login xử lý password NULL
│   ├── models/User.js                         # findByGoogleSub, createFromGoogle, linkGoogle; findById thêm has_password
│   ├── controllers/authController.js          # google(): giống login (thu hồi cookie cũ, set cookie)
│   ├── controllers/userController.js          # changePassword: password NULL → 400
│   ├── routes/auth.js                         # POST /google
│   ├── middleware/rateLimits.js               # googleLoginLimiter
│   └── validators/schemas.js                  # auth.google
├── tests/
│   ├── auth.google.test.js                    # MỚI: US1–US4, mã lỗi, đồng thời
│   ├── helpers/google.js                      # MỚI: cặp khoá RSA + ký ID token giả lập
│   └── fixtures/schema.sql                    # cột + index mới
└── .env.example                               # GOOGLE_CLIENT_ID

code_frontend/sdl-frontend/                    # frontend (repo sdl-frontend)
└── src/
    ├── components/GoogleLoginButton.jsx (+ .test.jsx)   # MỚI
    ├── context/AuthContext.jsx (+ test)       # loginWithGoogle → startSession
    ├── pages/LoginPage.jsx, RegisterPage.jsx  # gắn nút
    └── pages/ProfilePage.jsx                  # has_password === false → hướng dẫn
```

**Structure Decision**: Giữ kiến trúc `routes → controllers → services → models`. Xác minh Google tách
thành service riêng (`googleIdentity.js`) để test thay được phần gọi mạng mà vẫn chạy thật phần xác minh.

## Thứ tự triển khai

1. Backend (TDD) → `npm test` xanh → `npm audit --omit=dev` → push (Render tự deploy, migration chạy).
2. Chủ dự án đặt `GOOGLE_CLIENT_ID` trên Render, `VITE_GOOGLE_CLIENT_ID` trên Cloudflare Pages (quickstart).
3. Frontend (TDD) → `npm test` + `npm run build` → push.
4. Kiểm chứng thủ công theo [quickstart.md](quickstart.md); cập nhật BACKLOG / PROJECT_CONTEXT.
