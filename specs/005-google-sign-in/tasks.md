---

description: "Task list for 005 Google sign-in"
---

# Tasks: Đăng nhập bằng Google

**Input**: `specs/005-google-sign-in/` (plan, research, data-model, contracts/auth-google-api.md, quickstart)

**Tests**: Bắt buộc (constitution III). Test hành vi mới phải ĐỎ vì đúng lý do trước khi cài đặt.
Mock duy nhất ở backend: lấy khoá công khai của Google (`getCerts`) — phần xác minh chạy thật.

**Đường dẫn**: backend = `sdl-project/` (repo sdl-backend), frontend = `code_frontend/sdl-frontend/` (repo
sdl-frontend). Test backend luôn chạy `--runInBand` với `docker start sdl_postgres sdl_redis_test`.

## Phase 1: Setup

- [X] T001 Ghi nhận mốc: backend `npm test` (192 xanh), frontend `npm test` (37 xanh) + `npm run build`
- [X] T002 Cài `google-auth-library` vào sdl-project/package.json; đọc `node_modules/google-auth-library/build/src/auth/oauth2client.d.ts` xác nhận chữ ký `getFederatedSignonCertsAsync()` và `verifySignedJwtWithCertsAsync(jwt, certs, requiredAudience, issuers, maxExpiry?)`; chạy `npm audit --omit=dev` (không thêm lỗ hổng high/critical)
- [X] T003 [P] Thêm `GOOGLE_CLIENT_ID=` (để trống, có chú thích) vào sdl-project/.env.example

## Phase 2: Foundational (chặn mọi story)

- [X] T004 Migration idempotent trong sdl-project/src/config/database.js và cập nhật sdl-project/tests/fixtures/schema.sql theo data-model.md: `users.google_sub VARCHAR(255) NULL` + `CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub_key ON users (google_sub)`; `users.email_verified_at TIMESTAMP NULL`; `ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL`; lỗi migration chỉ ghi log, không chặn khởi động
- [X] T005 [P] Tạo sdl-project/tests/helpers/google.js: sinh cặp khoá RSA 2048 một lần (`crypto.generateKeyPairSync`), `TEST_GOOGLE_CLIENT_ID`, `testCerts()` trả `{ [kid]: publicKeyPem }`, `signGoogleIdToken(claims, { key, kid, expiresIn })` ký RS256 bằng `jsonwebtoken` với mặc định `iss: 'https://accounts.google.com'`, `aud: TEST_GOOGLE_CLIENT_ID`, `sub`, `email`, `email_verified: true`, `name`
- [X] T006 Viết sdl-project/tests/google.identity.test.js (ĐỎ) cho `verifyGoogleIdToken(credential, { getCerts, clientId })`: token hợp lệ → `{ sub, email (chữ thường), name, emailVerified }`; chấp nhận cả `iss` `accounts.google.com` và `https://accounts.google.com`; từ chối (lỗi mang `code: 'GOOGLE_TOKEN_INVALID'`) khi: ký bằng khoá khác, sai `aud`, sai `iss`, hết hạn, thiếu `sub`, thiếu `email`, `email_verified` false / thiếu, chuỗi không phải JWT; `getCerts` ném lỗi → `code: 'GOOGLE_UNAVAILABLE'`; thiếu `clientId` → `code: 'GOOGLE_NOT_CONFIGURED'`
- [X] T007 Tạo sdl-project/src/services/googleIdentity.js: `getCerts()` dùng một `OAuth2Client` dùng chung (`getFederatedSignonCertsAsync`, thư viện tự cache); `verifyGoogleIdToken(credential, { getCerts = defaultGetCerts, clientId = process.env.GOOGLE_CLIENT_ID } = {})` theo research R2 → T006 xanh
- [X] T008 [P] Mở rộng sdl-project/src/config/env.js + sdl-project/tests/config.env.test.js: thiếu `GOOGLE_CLIENT_ID` → cảnh báo `[Config]` "đăng nhập bằng Google bị tắt" (không phải lỗi chặn khởi động); test viết trước (ĐỎ)
- [X] T009 `npm test` backend xanh

## Phase 3: US1 — Khách mới đăng nhập bằng Google (P1) 🎯 MVP

**Goal**: Tài khoản Google chưa có trên hệ thống → tạo khách hàng mới + cấp phiên; lần sau vào đúng tài khoản đó.

**Independent Test**: tests/auth.google.test.js nhóm US1 xanh; đăng nhập Google 2 lần chỉ có 1 dòng `users`.

- [X] T010 [US1] Viết sdl-project/tests/auth.google.test.js nhóm US1 (ĐỎ), dùng `jest.mock` thay `getCerts` của src/services/googleIdentity.js bằng `testCerts()` và `process.env.GOOGLE_CLIENT_ID = TEST_GOOGLE_CLIENT_ID` (xoá trong `afterAll`), header `Origin` hợp lệ: (a) email mới → 200 `{ message: 'Đăng nhập thành công!', user: { id, email, fullName, role: 'CUSTOMER' }, token }` + cookie `sdl_rt` HttpOnly path /api/auth; DB có `google_sub`, `email` chữ thường, `password_hash` NULL, `email_verified_at` khác NULL; (b) đăng nhập lần 2 cùng `sub` → cùng `id`, `COUNT(users) = 1`, phiên lần 1 vẫn gia hạn được; (c) cùng `sub` nhưng email Google đổi → vẫn tài khoản cũ, email lưu không đổi; (d) `name` rỗng → `full_name` = phần trước `@`; `name` dài 150 ký tự → cắt 100; (e) request mang cookie `sdl_rt` của phiên khác → phiên đó bị thu hồi (như /auth/login); (f) 2 request đồng thời cùng `sub` email mới → cả hai 200, cùng `id`, 1 dòng `users`
- [X] T011 [US1] Thêm vào sdl-project/src/models/User.js: `findByGoogleSub(sub, client = pool)`; `createFromGoogle({ sub, email, fullName }, client = pool)` INSERT `role 'CUSTOMER'`, `password_hash NULL`, `email_verified_at NOW()`, email qua `normalizeEmail` (B55), `RETURNING id, email, full_name, role, is_active`
- [X] T012 [US1] Thêm `AuthService.loginWithGoogle(credential, meta)` trong sdl-project/src/services/authService.js: `verifyGoogleIdToken` → tra `findByGoogleSub` → (chưa có) tra `User.findByEmail` (nhánh liên kết để US2) → (không có) `createFromGoogle` với họ tên `name.trim()` / phần trước `@`, cắt 100; bắt `23505` → tra lại theo `sub` rồi email một lần; `issueSession`; trả `{ user: publicUser(user), accessToken, refreshToken }`
- [X] T013 [US1] Endpoint: `schemas.auth.google = z.looseObject({ credential: text('Mã xác thực Google', 4096, { required: true }) })` trong sdl-project/src/validators/schemas.js; `googleLoginLimiter` (20 lần thất bại / 15 phút / IP, `skipSuccessfulRequests`, khoá qua `ipKeyGenerator`) trong sdl-project/src/middleware/rateLimits.js; `AuthController.google` (giống `login`: thu hồi cookie cũ, `setRefreshCookie`, 200) trong sdl-project/src/controllers/authController.js; `router.post('/google', requireAllowedOrigin, rl.googleLoginLimiter, validate({ body: schemas.auth.google }), authController.google)` trong sdl-project/src/routes/auth.js → T010 xanh
- [X] T014 [P] [US1] Viết code_frontend/sdl-frontend/src/context/AuthContext.test.jsx thêm test (ĐỎ) `loginWithGoogle('cred')` → `api.post('/auth/google', { credential: 'cred' })` đúng 1 lần, lưu token + user, xoá dữ liệu cá nhân tài khoản khác (B54); cài đặt `loginWithGoogle` qua `startSession` trong code_frontend/sdl-frontend/src/context/AuthContext.jsx
- [X] T015 [P] [US1] Viết code_frontend/sdl-frontend/src/components/GoogleLoginButton.test.jsx (ĐỎ): không có `VITE_GOOGLE_CLIENT_ID` → không render gì; có → tải script `https://accounts.google.com/gsi/client` đúng một lần, gọi `google.accounts.id.initialize({ client_id, callback })` + `renderButton`; callback gọi `onCredential(response.credential)`; cài đặt code_frontend/sdl-frontend/src/components/GoogleLoginButton.jsx (props `onCredential`, `text`)
- [X] T016 [US1] Gắn `GoogleLoginButton` vào code_frontend/sdl-frontend/src/pages/LoginPage.jsx và RegisterPage.jsx (dải "hoặc"); callback gọi `loginWithGoogle`, thành công điều hướng như đăng nhập thường, lỗi hiện `err.response?.data?.error` trong khung lỗi sẵn có; thêm `VITE_GOOGLE_CLIENT_ID=` vào code_frontend/sdl-frontend/.env.example (tạo nếu chưa có)
- [X] T017 [US1] Backend `npm test` xanh; frontend `npm test` + `npm run build` xanh

## Phase 4: US2 — Gộp tài khoản mật khẩu cùng email (P1)

**Goal**: Email Google khớp tài khoản chưa liên kết → liên kết vào đó, huỷ mật khẩu / mã đặt lại / mọi phiên.

**Independent Test**: tests/auth.google.test.js nhóm US2 xanh.

- [X] T018 [US2] Thêm nhóm US2 vào sdl-project/tests/auth.google.test.js (ĐỎ): (a) tài khoản mật khẩu `Khach@Test.vn` đã đăng nhập (giữ cookie) + có mã đặt lại đang chờ; đăng nhập Google email `khach@test.vn` → 200 cùng `id`, `COUNT(users)` không đổi, `role` giữ nguyên (thử cả `ADMIN`), DB `password_hash` NULL, `reset_password_token` NULL, `google_sub` gán, `email_verified_at` khác NULL; đăng nhập mật khẩu cũ → 401 "Email hoặc mật khẩu không chính xác!"; refresh bằng cookie cũ → 401; `refresh_tokens` cũ có `revoked_reason = 'google_link'`; (b) email khớp tài khoản đã có `google_sub` khác → 409 `{ code: 'GOOGLE_EMAIL_LINKED', error: 'Email này đã được liên kết với một tài khoản Google khác.' }`, tài khoản không đổi; (c) 2 request liên kết đồng thời cùng `sub` → cả hai 200, cùng `id`
- [X] T019 [US2] Thêm `User.linkGoogle(client, userId, sub)` trong sdl-project/src/models/User.js: `UPDATE users SET google_sub = $2, email_verified_at = NOW(), password_hash = NULL, reset_password_token = NULL, reset_password_expires = NULL WHERE id = $1 AND google_sub IS NULL RETURNING id, email, full_name, role, is_active`
- [X] T020 [US2] Nhánh liên kết trong `AuthService.loginWithGoogle` (sdl-project/src/services/authService.js): tài khoản theo email có `google_sub` khác → `AppError` 409 `GOOGLE_EMAIL_LINKED`; tài khoản `is_active = false` → `AppError` 401 câu khoá, KHÔNG liên kết (chặn ngay, không đợi US4); chưa có → `RefreshToken.withUserLock(id, client => linkGoogle + revokeAllForUser(id, 'google_link', client))`; `rowCount 0` → đọc lại: cùng `sub` thì dùng tiếp, khác thì 409 → T018 xanh
- [X] T021 [US2] Backend `npm test` xanh

## Phase 5: US4 — Từ chối trường hợp không an toàn (P1)

**Goal**: Mọi bằng chứng không hợp lệ, tài khoản khoá, thiếu cấu hình đều bị từ chối, không tạo / sửa tài khoản.

**Independent Test**: tests/auth.google.test.js nhóm US4 xanh; `COUNT(users)` không đổi sau mỗi ca.

- [X] T022 [US4] Thêm nhóm US4 vào sdl-project/tests/auth.google.test.js (ĐỎ): token ký khoá khác / sai `aud` / sai `iss` / hết hạn / `email_verified: false` → 401 `{ code: 'GOOGLE_TOKEN_INVALID', error: 'Không xác minh được tài khoản Google. Vui lòng thử lại.' }` và `COUNT(users)` không đổi; tài khoản `is_active = false` (đã liên kết, và chưa liên kết cùng email) → 401 "Tài khoản của bạn đã bị khóa bởi quản trị viên!", không cấp cookie, tài khoản chưa liên kết KHÔNG bị liên kết; thiếu `GOOGLE_CLIENT_ID` → 503 `GOOGLE_NOT_CONFIGURED`; `getCerts` ném lỗi → 503 `GOOGLE_UNAVAILABLE`; thiếu / sai kiểu / dài > 4096 `credential` → 400; `Origin` lạ → 403; 21 lần thất bại liên tiếp cùng IP → lần thứ 21 trả 429 (đặt cuối file vì bộ đếm giữ trong cả file); phản hồi lỗi không chứa chi tiết thư viện
- [X] T023 [US4] Ánh xạ lỗi trong sdl-project/src/services/authService.js: lỗi `GOOGLE_*` từ googleIdentity → `AppError` (401 / 503 kèm `code`, câu theo contracts/auth-google-api.md); kiểm tra `is_active` TRƯỚC khi liên kết hay cấp phiên → T022 xanh
- [X] T024 [US4] Backend `npm test` xanh

## Phase 6: US3 — Tài khoản chỉ dùng Google với chức năng mật khẩu (P2)

**Goal**: Tài khoản không mật khẩu không gây lỗi 500, có hướng dẫn tạo mật khẩu.

**Independent Test**: test US3 backend + ProfilePage xanh.

- [X] T025 [US3] Thêm nhóm US3 (ĐỎ) — *đã làm ở file riêng sdl-project/tests/auth.google.password.test.js vì test 429 phải nằm cuối auth.google.test.js (bộ đếm giới hạn tần suất giữ trong cả file)*: tài khoản Google (password NULL) đăng nhập mật khẩu bất kỳ → 401 "Email hoặc mật khẩu không chính xác!" (không 500); `PUT /api/users/change-password` gửi đủ `{ currentPassword: 'batky123', newPassword: 'matkhaumoi123' }` (qua được validate) → 400 `{ error: 'Tài khoản của bạn chưa có mật khẩu. Hãy dùng "Quên mật khẩu" để tạo mật khẩu.' }`; `GET /api/users/profile` → `data.has_password === false`, không có `password_hash` / `google_sub`; tài khoản mật khẩu → `has_password === true`; quên mật khẩu (mock `queueResetPasswordEmail`) + đặt lại → đăng nhập được bằng mật khẩu mới VÀ Google
- [X] T026 [US3] Cài đặt: `AuthService.login` — `password_hash` NULL → cùng `AppError` 401 sai mật khẩu, không gọi bcrypt (sdl-project/src/services/authService.js); `UserController.changePassword` — NULL → 400 câu trên (sdl-project/src/controllers/userController.js); `User.findById` thêm `(password_hash IS NOT NULL) AS has_password` (sdl-project/src/models/User.js) → T025 xanh
- [X] T027 [P] [US3] Viết code_frontend/sdl-frontend/src/pages/ProfilePage.test.jsx (ĐỎ): `has_password: false` → hiện "Tài khoản của bạn chưa có mật khẩu" + liên kết `/forgot-password`, không có ô "Mật khẩu hiện tại"; `has_password: true` → form đổi mật khẩu như cũ; cài đặt trong code_frontend/sdl-frontend/src/pages/ProfilePage.jsx
- [X] T028 [US3] Backend `npm test` xanh; frontend `npm test` + `npm run build` xanh

## Phase 7: Polish & cổng chất lượng

- [X] T029 `npm audit --omit=dev` backend; `node --check` mọi file backend đã sửa; quét diff không có bí mật / Client ID thật
- [X] T030 Code review thay đổi (skill `requesting-code-review`, constitution cổng 4), sửa các phát hiện cần thiết, chạy lại toàn bộ test
- [X] T031 [P] Cập nhật tài liệu: mục Đăng nhập trong sdl-project/CLAUDE.md (Google: `/auth/google`, `google_sub`, gộp tài khoản huỷ mật khẩu + phiên, `password_hash` có thể NULL); sdl-project/docs/BACKLOG.md (ghi phát hiện mới); "Đã hoàn thành" + "Nhật ký thay đổi" trong ../PROJECT_CONTEXT.local.md; đánh dấu task trong file này
- [ ] T032 Commit + push backend trước (Render chạy migration, kiểm tra log `Migration` + `[Config]`), rồi frontend; chủ dự án đặt `GOOGLE_CLIENT_ID` (Render) và `VITE_GOOGLE_CLIENT_ID` (Cloudflare Pages) theo quickstart.md
- [ ] T033 Kiểm chứng thủ công 7 bước trong specs/005-google-sign-in/quickstart.md trên production cùng chủ dự án

## Bổ sung sau code review (T030, 17/11/2026)

- [X] T030a Race đăng nhập / đổi mật khẩu ↔ liên kết Google: cấp phiên và ghi mật khẩu trong `withUserLock`, đọc lại hash; test sdl-project/tests/auth.google.race.test.js (barrier giữ bước so mật khẩu)
- [X] T030b FR-005a (chủ dự án duyệt): chỉ tự liên kết khi email `@gmail.com` / `@googlemail.com` hoặc token có `hd`; khác → 409 `GOOGLE_LINK_NOT_ALLOWED`
- [X] T030c Thời gian chờ 5 giây khi lấy khoá công khai Google (sdl-project/src/services/googleIdentity.js); dải "hoặc" chỉ hiện khi nút Google đã vẽ; câu hướng dẫn trang hồ sơ trung tính
- [X] T030d Ghi các phát hiện hoãn vào sdl-project/docs/BACKLOG.md (B63–B66)

## Dependencies & thứ tự

- Phase 1 → Phase 2 → US1 → (US2, US4, US3 độc lập với nhau về chức năng nhưng cùng sửa
  `authService.js` / `auth.google.test.js` → làm tuần tự US2 → US4 → US3) → Polish.
- Trong mỗi story: test ĐỎ → model → service → controller/route → test XANH.
- Frontend US1 (T014–T016) chỉ cần hợp đồng API, làm song song được với backend US1 sau T010.
- Deploy: backend trước frontend (frontend gọi `/auth/google` và đọc `has_password`).

## Parallel

- T003 ∥ T005 ∥ T008 (file khác nhau).
- T014 ∥ T015 (AuthContext vs GoogleLoginButton), song song với T011–T013 phía backend.
- T027 (frontend ProfilePage) ∥ T026 (backend).

## Implementation Strategy

- **MVP = Phase 1 + 2 + US1**: khách mới đăng nhập được bằng Google. Chưa nên phát hành riêng vì email
  trùng tài khoản mật khẩu sẽ rơi vào nhánh tạo mới và lỗi trùng email → phát hành sau khi xong US2 + US4.
- Phát hành một đợt sau Phase 6, kiểm chứng theo quickstart.
