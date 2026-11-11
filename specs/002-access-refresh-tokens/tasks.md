---

description: "Task list for 002 access/refresh tokens"
---

# Tasks: Đăng nhập bằng access token và refresh token

**Input**: `specs/002-access-refresh-tokens/` (plan, research, data-model, contracts/auth-api.md, quickstart)

**Tests**: Bắt buộc (constitution III). Test hành vi mới phải ĐỎ trước khi cài đặt.

## Phase 1: Setup

- [x] T001 Chạy `npm test` ghi nhận mốc (33 xanh)

## Phase 2: Foundational (chặn mọi story)

- [x] T002 Thêm bảng `refresh_tokens` + 2 index (data-model.md) vào tests/fixtures/schema.sql và migration idempotent trong src/config/database.js
- [x] T003 [P] Tạo src/utils/authTokens.js: `signAccessToken`, `verifyAccessToken` (HS256, `type: 'access'`), `generateRefreshToken` (32 byte base64url), `hashToken` (SHA-256 hex), `setRefreshCookie` / `clearRefreshCookie` (sdl_rt, path /api/auth, 7 ngày, secure+SameSite=None khi production), `readRefreshCookie`, `getAllowedOrigins`, `isAllowedOrigin`, `validateNewPassword` (≥ 8, chữ + số)
- [x] T004 [P] Tạo src/models/RefreshToken.js: `create`, `rotate` (transaction: huỷ cũ có điều kiện + tạo mới cùng family), `findByHash`, `revokeFamily`, `revokeAllForUser`, `deleteExpired`

## Phase 3: US1 — Nhiều thiết bị, tự gia hạn (P1)

- [x] T005 [US1] Viết tests/auth.tokens.test.js (ĐỎ): đăng nhập trả `token` + cookie `sdl_rt` HttpOnly path /api/auth; `/auth/refresh` trả access mới + cookie mới, cookie cũ bị thay; hai thiết bị cùng dùng được; access hết hạn → 401 `TOKEN_EXPIRED`; token giả → `TOKEN_INVALID`; thiếu → `TOKEN_MISSING`; token kiểu cũ (không `type`) → `TOKEN_INVALID`; refresh không cookie → 401 `REFRESH_INVALID`
- [x] T006 [US1] Sửa có chủ đích test "đăng nhập lần hai làm token cũ mất hiệu lực" trong tests/auth.login.test.js thành "đăng nhập lần hai, token cũ vẫn dùng được"
- [x] T007 [US1] authService: login/register cấp access + refresh (family mới); `refresh(rawToken)` theo bảng trạng thái data-model (kiểm tra `is_active`, role mới nhất) trong src/services/authService.js
- [x] T008 [US1] authController + routes: đặt cookie khi login/register; `POST /auth/refresh` (kiểm tra Origin) trong src/controllers/authController.js, src/routes/auth.js
- [x] T009 [US1] verifyToken/optionalVerifyToken không tra DB, trả `code` trong src/middleware/auth.js
- [x] T010 [US1] CORS danh sách + `credentials: true` trong src/config/app.js
- [x] T011 [US1] `npm test` xanh

## Phase 4: US2 — Đăng xuất và thu hồi (P1)

- [x] T012 [US2] Thêm test (ĐỎ) vào tests/auth.tokens.test.js: logout huỷ phiên + xoá cookie; logout-all huỷ phiên thiết bị khác; khoá tài khoản → refresh 401
- [x] T013 [US2] authService `logout`, `logoutAll`; controller + routes `/auth/logout`, `/auth/logout-all`
- [x] T014 [US2] `npm test` xanh

## Phase 5: US3 — Phát hiện dùng lại (P2)

- [x] T015 [US3] Test (ĐỎ): dùng lại token đã xoay trong 30 giây → 200 không Set-Cookie; sau 30 giây → 401 `REFRESH_REUSED` và token mới cùng family cũng bị huỷ; hai refresh đồng thời cùng cookie → cả hai 200
- [x] T016 [US3] Cài ân hạn 30 giây + huỷ family trong authService.refresh
- [x] T017 [US3] `npm test` xanh

## Phase 6: US4 — Quên/đặt lại/đổi mật khẩu (P2)

- [x] T018 [US4] Viết tests/auth.password.test.js (ĐỎ): quên mật khẩu email có/không có → cùng 200 + cùng body; DB chỉ chứa băm của mã đặt lại; đặt lại thành công huỷ mọi phiên; mã dùng lại bị từ chối; đăng ký/đặt lại/đổi mật khẩu 7 ký tự hoặc thiếu số → 400; đổi mật khẩu huỷ phiên thiết bị khác nhưng trả token + cookie mới; sai mật khẩu hiện tại → 401 không có `code`
- [x] T019 [US4] Sửa tests/errors.business.test.js cho đúng thông báo mật khẩu mới (nếu cần)
- [x] T020 [US4] authService forgot/reset; User model lưu/tra băm; userController.changePassword; `validateNewPassword` ở đăng ký/đặt lại/đổi
- [x] T021 [US4] `npm test` xanh

## Phase 7: US5 — Kiểm tra nguồn (P2)

- [x] T022 [US5] Test (ĐỎ nếu chưa có): `/auth/refresh`, `/auth/logout` với Origin lạ → 403; không Origin → 403
- [x] T023 [US5] `npm test` xanh

## Phase 8: Backend polish + deploy

- [x] T024 Dọn `refresh_tokens` hết hạn mỗi giờ trong src/server.js
- [x] T025 Smoke test server thật theo quickstart (curl login/refresh/Origin lạ)
- [ ] T026 Cổng trước commit; commit + push backend; xác nhận production (login có Set-Cookie, refresh 200 với Origin hợp lệ)

## Phase 9: Frontend (repo sdl-frontend)

- [ ] T027 src/services/api.js: `withCredentials`, interceptor gia hạn theo `code` + gộp request, đăng xuất khi thất bại, 401 không `code` không đăng xuất
- [ ] T028 src/context/AuthContext.jsx: login lưu token; logout gọi `/auth/logout`; `logoutAll`; bỏ reload khi `token` đổi ở tab khác
- [ ] T029 [P] Chính sách mật khẩu 8 ký tự + chữ/số ở src/pages/RegisterPage.jsx, src/pages/ResetPasswordPage.jsx, src/pages/ProfilePage.jsx; ProfilePage lưu token mới sau đổi mật khẩu + nút "Đăng xuất mọi nơi"
- [ ] T030 `npm run build`; kịch bản thủ công quickstart (local backend + frontend)
- [ ] T031 Commit + push frontend; xác nhận production

## Phase 10: Polish

- [ ] T032 CLAUDE.md (quy ước auth), docs/BACKLOG.md (đóng B1–B6, thêm dọn `session_id`), ../PROJECT_CONTEXT.local.md

## Dependencies

Phase 2 → US1 → US2 → US3 → US4 (độc lập với US2/US3, làm sau cho gọn) → US5 → deploy backend → frontend.
Frontend chỉ deploy sau khi backend production đã xác nhận.
