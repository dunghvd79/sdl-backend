# Research: Đăng nhập bằng Google (spec 005)

## R1. Luồng Google: ID token qua Google Identity Services (GIS), không dùng authorization code

- **Decision**: Frontend tải script GIS `https://accounts.google.com/gsi/client`, gọi
  `google.accounts.id.initialize({ client_id, callback })` + `renderButton`. Callback nhận `credential`
  (ID token — JWT do Google ký RS256) → gửi `POST /api/auth/google { credential }`. Backend xác minh rồi cấp
  phiên của hệ thống (spec 002).
- **Rationale**: Ta chỉ cần **danh tính** (OpenID Connect), không cần gọi API Google thay người dùng →
  không cần `client_secret`, không cần redirect URI, không lưu access token Google. Phiên vẫn là của ta.
- **Alternatives**: Authorization Code + PKCE (redirect qua backend) — cần client secret, callback URL,
  state/nonce, phức tạp hơn mà không thêm giá trị cho nhu cầu "chỉ đăng nhập". Thư viện
  `@react-oauth/google` — chỉ là lớp bọc GIS; tự tải script ít phụ thuộc hơn (constitution: hạn chế thư viện).

## R2. Xác minh ID token ở backend: `google-auth-library`

- **Decision**: Thêm `google-auth-library` (thư viện chính thức của Google). Bọc trong
  `src/services/googleIdentity.js` với 2 bước tách rời:
  1. `getCerts()` — lấy khoá công khai của Google (`OAuth2Client#getFederatedSignonCertsAsync`, thư viện tự
     cache theo `Cache-Control`).
  2. `verifySignedJwtWithCertsAsync(credential, certs, GOOGLE_CLIENT_ID, ['accounts.google.com', 'https://accounts.google.com'])`
     — kiểm tra chữ ký, `aud`, `iss`, `exp`/`iat`.
  Sau đó tự kiểm tra `email_verified === true` và có `sub`, `email`.
- **Rationale**: Kiểm tra đủ các điểm spec FR-002 bằng code đã được kiểm định; tự viết bằng `jsonwebtoken`
  phải tự lấy / xoay / cache khoá JWKS và nhớ cả hai dạng `iss` — dễ sai ở chỗ nhạy cảm nhất.
  Tách `getCerts` cho phép test **thật** phần xác minh: test tự tạo cặp khoá RSA, ký token bằng
  `jsonwebtoken` (đã có sẵn), chỉ thay `getCerts` (dịch vụ bên ngoài — constitution III cho phép mock) →
  chữ ký giả, sai `aud`, sai `iss`, hết hạn, email chưa xác minh đều được kiểm chứng thật.
- **Alternatives**: `jose` + `createRemoteJWKSet` (gọn, nhưng thêm thư viện không phải của Google, vẫn phải
  tự xử lý 2 dạng `iss`); gọi `https://oauth2.googleapis.com/tokeninfo` (Google khuyên chỉ dùng để debug, thêm
  1 lượt mạng mỗi lần đăng nhập).
- **Lưu ý triển khai**: kiểm tra lại chữ ký hàm của bản `google-auth-library` cài được (context7 hiện chưa
  xác thực được trong phiên này → đọc `node_modules/google-auth-library/build/src/auth/oauth2client.d.ts`);
  chạy `npm audit --omit=dev` sau khi cài (constitution II).

## R3. Nhận diện bằng `sub`, email chỉ dùng khi liên kết lần đầu

- **Decision**: Thêm cột `users.google_sub` (UNIQUE, NULL được). Thứ tự tra: (1) theo `google_sub`;
  (2) không có → theo `LOWER(email)` (B55); (3) không có → tạo mới.
- **Rationale**: `sub` của Google không đổi suốt đời tài khoản Google; email có thể đổi hoặc được cấp lại
  (Google Workspace). Tra theo email mãi mãi = ai giành được email cũ sẽ vào tài khoản cũ.

## R4. Gộp tài khoản an toàn (chống pre-account takeover)

- **Decision**: Khi bước (2) khớp tài khoản chưa có `google_sub`: trong **một transaction có khoá theo
  user** (`RefreshToken.withUserLock`): `UPDATE users SET google_sub, email_verified_at = NOW(),
  password_hash = NULL, reset_password_token = NULL, reset_password_expires = NULL WHERE id = $id AND
  google_sub IS NULL` + `revokeAllForUser(id, 'google_link')`. `rowCount = 0` (ai đó vừa liên kết trước)
  → đọc lại và xử lý như bước (1) hoặc từ chối nếu `sub` khác.
- **Rationale**: Hệ thống chưa xác minh email (B56) nên người đặt mật khẩu cũ có thể không phải chủ email.
  Huỷ mật khẩu + mã đặt lại + mọi phiên là cách duy nhất đảm bảo chỉ người chứng minh sở hữu email (qua
  Google) còn quyền. Người dùng thật vẫn lấy lại mật khẩu bằng Quên mật khẩu (mail tới hộp thư của họ).
  Áp dụng cả với ADMIN / CURATOR (chủ dự án đã duyệt), vai trò giữ nguyên.
- **Alternatives**: Bắt nhập mật khẩu cũ trước khi liên kết — an toàn nhưng chặn người quên mật khẩu, và
  vẫn không giải quyết trường hợp kẻ xấu là người đặt mật khẩu. Tạo tài khoản thứ hai — mất lịch sử mua hàng,
  vi phạm UNIQUE email.

## R5. Tạo tài khoản đồng thời

- **Decision**: `INSERT ... RETURNING`; nếu Postgres trả `23505` (trùng `google_sub` hoặc `LOWER(email)`)
  thì tra lại một lần theo `sub` rồi theo email và tiếp tục như bình thường.
- **Rationale**: Ràng buộc UNIQUE trong DB là bảo đảm cuối cùng (bài học B45); không cần khoá toàn bảng.

## R6. Tài khoản không có mật khẩu

- **Decision**: `ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL`. Đăng nhập mật khẩu: nếu
  `password_hash` NULL → ném đúng lỗi "Email hoặc mật khẩu không chính xác!" (không gọi `bcrypt.compare`
  với NULL — bcryptjs ném lỗi → 500). Đổi mật khẩu: NULL → `AppError` 400 hướng dẫn Quên mật khẩu.
  `GET /users/profile` trả thêm `has_password` (boolean, không bao giờ trả hash) để giao diện ẩn form.
- **Rationale**: Không sinh mật khẩu ngẫu nhiên "giả" — người dùng không biết nó, và vẫn là một bí mật
  phải bảo vệ. NULL thể hiện đúng trạng thái.

## R7. Endpoint, giới hạn tần suất, CSRF đăng nhập

- **Decision**: `POST /api/auth/google`, middleware: `requireAllowedOrigin` → `googleLoginLimiter`
  (20 lần thất bại / 15 phút / IP, `skipSuccessfulRequests`) → `validate({ body: schemas.auth.google })`
  (`credential`: chuỗi 1–4096 ký tự). Trả **giống `/auth/login`**: 200 `{ message, user, token }` + cookie
  `sdl_rt`; thu hồi phiên cũ trong cookie nếu có.
- **Rationale**: Kiểm tra `Origin` chặn "login CSRF" (trang lạ đăng nhập nạn nhân vào tài khoản kẻ xấu);
  body JSON cũng buộc preflight CORS. Giới hạn theo IP vì chưa biết email trước khi xác minh.
- **Mã lỗi**: 400 thiếu / sai dạng `credential`; 401 `GOOGLE_TOKEN_INVALID` (mọi lỗi xác minh, kể cả
  email chưa xác minh) — câu chung; 401 tài khoản bị khoá (câu như đăng nhập); 409 email đã liên kết
  `sub` khác; 503 `GOOGLE_NOT_CONFIGURED` / `GOOGLE_UNAVAILABLE` (không lấy được khoá của Google).

## R8. Cấu hình

- **Decision**: Backend `GOOGLE_CLIENT_ID` (không bí mật, nhưng đặt theo môi trường). Thiếu → cảnh báo
  `[Config]` (mở rộng `src/config/env.js`, B53) và endpoint trả 503; **không** chặn khởi động
  (constitution V). Frontend `VITE_GOOGLE_CLIENT_ID`; thiếu → không hiện nút.
- **Hạ tầng**: frontend (Cloudflare Pages) hiện không đặt `Cross-Origin-Opener-Policy` → popup GIS hoạt
  động; nếu sau này thêm COOP thì phải là `same-origin-allow-popups`. Không cần tên miền riêng.
