# Implementation Plan: Đăng nhập bằng access token và refresh token

**Branch**: `002-access-refresh-tokens` (làm trên `main` của cả hai repo) | **Date**: 2026-11-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/002-access-refresh-tokens/spec.md`

## Summary

Access token JWT 15 phút kiểm tra không tra DB; refresh token ngẫu nhiên 7 ngày lưu băm trong bảng mới
`refresh_tokens`, gửi qua cookie httpOnly `sdl_rt` (path `/api/auth`), xoay vòng mỗi lần gia hạn, phát
hiện dùng lại (ân hạn 30 giây cho nhiều tab). Thêm `/auth/refresh`, `/auth/logout`, `/auth/logout-all`;
đổi/đặt lại mật khẩu huỷ mọi phiên; quên mật khẩu trả câu chung; mã đặt lại lưu băm; chính sách mật
khẩu ≥ 8 ký tự có chữ và số; CORS theo danh sách + kiểm tra `Origin`. Frontend: `withCredentials`,
interceptor tự gia hạn theo `code`, bỏ tự tải lại trang khi token đổi, nút "đăng xuất mọi nơi".

## Technical Context

**Language/Version**: Backend Node.js 20 CommonJS; Frontend React 19 + Vite 5

**Primary Dependencies**: Express 5.2, `jsonwebtoken` 9, `pg` 8.20, `cors`; axios 1.x (frontend). Không thêm thư viện.

**Storage**: PostgreSQL — thêm bảng `refresh_tokens` (migration idempotent trong `database.js`)

**Testing**: Jest 30 + Supertest 7 (backend, DB `sdl_test`); frontend chưa có test tự động → kiểm chứng
bằng `npm run build` + kịch bản thủ công trong quickstart.md

**Target Platform**: Render (backend, NODE_ENV=production), Cloudflare Pages (frontend)

**Project Type**: web-service + SPA (hai repo `sdl-backend`, `sdl-frontend`)

**Performance Goals**: Bỏ 1 truy vấn DB ở mỗi request có đăng nhập; gia hạn 1 lần / 15 phút / tab

**Constraints**: Frontend và API khác site (pages.dev ↔ onrender.com); Safari chặn cookie bên thứ ba (đã chấp nhận)

**Scale/Scope**: Backend ~8 file sửa + 2 file mới; frontend 5 file (api.js, AuthContext, Register, ResetPassword, Profile)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Nguyên tắc | Đánh giá | Ghi chú |
|---|---|---|
| I. Toàn vẹn dữ liệu & giao dịch | ✅ | Xoay vòng refresh token = `UPDATE ... WHERE revoked_at IS NULL RETURNING` + `INSERT` trong một transaction → hai yêu cầu đồng thời không cùng xoay được một token. Migration idempotent |
| II. Bảo mật theo mặc định | ✅ | Đây chính là phần gia cố: token băm, thu hồi, chống dò email, CORS + kiểm tra Origin, thuật toán JWT cố định |
| III. Test-First | ✅ | Test backend viết trước, đỏ trước khi cài đặt; test khoá hành vi đăng nhập hiện có được sửa **có chủ đích** (test "đăng nhập lần hai làm token cũ mất hiệu lực" đổi thành "nhiều thiết bị") |
| IV. Đơn giản & thay đổi tối thiểu | ✅ | Không thêm thư viện (tự đọc cookie, dùng `crypto` có sẵn). Không xoá cột `session_id` trong đợt này |
| V. Tương thích Production | ⚠️ có ngoại lệ ghi rõ | Phá vỡ có chủ đích: mọi người đăng nhập lại một lần; quên mật khẩu với email không tồn tại 400→200; mật khẩu mới tối thiểu 8. Giữ trường `token` trong phản hồi đăng nhập để giao diện cũ vẫn chạy; deploy backend trước frontend |

**Re-check sau Phase 1**: đạt. Không cần Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/002-access-refresh-tokens/
├── plan.md · research.md · data-model.md · quickstart.md
├── contracts/auth-api.md
└── tasks.md            # /speckit-tasks
```

### Source Code

```text
sdl-project/ (backend)
├── src/models/RefreshToken.js          # MỚI: tạo, tìm theo hash, xoay vòng, huỷ family/user, dọn hết hạn
├── src/utils/authTokens.js             # MỚI: ký/kiểm tra access token, sinh+băm refresh token, đặt/xoá cookie, đọc cookie, kiểm tra Origin, validateNewPassword
├── src/config/database.js              # SỬA: migration bảng refresh_tokens
├── src/config/app.js                   # SỬA: cors({ origin: allowlist, credentials: true })
├── src/middleware/auth.js              # SỬA: verifyToken/optionalVerifyToken không tra DB, trả code
├── src/services/authService.js         # SỬA: login/register cấp cặp token; refresh; logout; logoutAll; forgot/reset mới
├── src/controllers/authController.js   # SỬA: đặt cookie, endpoint mới, chính sách mật khẩu
├── src/routes/auth.js                  # SỬA: /refresh, /logout, /logout-all
├── src/controllers/userController.js   # SỬA: changePassword (chính sách, huỷ phiên, cấp phiên mới)
├── src/server.js                       # SỬA: dọn refresh_tokens hết hạn mỗi giờ
├── tests/fixtures/schema.sql           # SỬA: thêm bảng
└── tests/auth.tokens.test.js, tests/auth.password.test.js   # MỚI

code_frontend/sdl-frontend/ (frontend)
├── src/services/api.js                 # withCredentials, interceptor gia hạn theo code, gộp request
├── src/context/AuthContext.jsx         # login/logout gọi API, logoutAll, bỏ reload khi token đổi
├── src/pages/RegisterPage.jsx · ResetPasswordPage.jsx · ProfilePage.jsx   # chính sách 8 ký tự; nút đăng xuất mọi nơi; lưu token sau đổi mật khẩu
```

**Structure Decision**: Giữ `routes → controllers → services → models`. Logic token dùng chung đặt ở
`utils/authTokens.js`; truy cập bảng mới ở `models/RefreshToken.js`.

## Thứ tự triển khai (đầu vào cho /speckit-tasks)

1. Test backend (đỏ): cấp cookie khi đăng nhập, gia hạn + xoay vòng, ân hạn 30 giây, dùng lại sau 30
   giây huỷ family, đăng xuất / đăng xuất mọi nơi, khoá tài khoản chặn gia hạn, Origin lạ 403, mã lỗi
   `TOKEN_*`, nhiều thiết bị, quên mật khẩu câu chung, mã đặt lại lưu băm + huỷ phiên, đổi mật khẩu huỷ
   phiên + cấp phiên mới, chính sách mật khẩu.
2. Sửa có chủ đích test cũ "đăng nhập lần hai làm token cũ mất hiệu lực".
3. Migration + model + utils → service → controller/route → middleware → CORS → dọn hết hạn.
4. `npm test` xanh; smoke test server thật theo quickstart.
5. Deploy backend, kiểm tra production (đăng nhập có `Set-Cookie`, `/auth/refresh` 200 từ Origin hợp lệ).
6. Frontend: api.js → AuthContext → 3 trang; `npm run build`; kịch bản thủ công quickstart; deploy.
7. Cập nhật CLAUDE.md, BACKLOG (đóng B1–B6, thêm mục dọn `session_id`), PROJECT_CONTEXT.

## Complexity Tracking

Không có vi phạm cần biện minh.
