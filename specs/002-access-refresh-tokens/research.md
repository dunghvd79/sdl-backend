# Research: Access token + refresh token

Rút ra từ việc đọc code backend (`sdl-project/src`) và frontend (`code_frontend/sdl-frontend/src`) ngày
2026-11-11.

## R1. Access token

- **Decision**: JWT HS256 ký bằng `JWT_SECRET`, payload `{ id, email, role, type: 'access' }`, hạn 15
  phút (`ACCESS_TOKEN_TTL`, mặc định `15m`). `jwt.verify` khai báo rõ `algorithms: ['HS256']` và từ chối
  token không có `type: 'access'` (token 24 giờ kiểu cũ không có trường này → bị từ chối).
- **Rationale**: `req.user` chỉ được dùng với `id`, `role` (đã đo: không có trường nào khác). Bỏ
  truy vấn DB trong `verifyToken` theo quyết định "chấp nhận trễ".
- **Alternatives**: Giữ tra DB mỗi request — trái quyết định; ký RS256 — chưa cần (chỉ một dịch vụ ký).

## R2. Mã lỗi phân biệt "hết hạn" với "không hợp lệ"

- **Decision**: `verifyToken` trả 401 kèm `code`: `TOKEN_EXPIRED` (hết hạn), `TOKEN_INVALID` (sai/giả),
  `TOKEN_MISSING` (không gửi). Giao diện **chỉ tự gia hạn khi `TOKEN_EXPIRED`**.
- **Rationale**: Hiện có 401 mang nghĩa khác: sai mật khẩu khi đăng nhập, sai mật khẩu hiện tại khi đổi
  mật khẩu (`userController.changePassword`). Interceptor cũ coi mọi 401 là hết phiên → **nhập sai mật
  khẩu hiện tại khi đổi mật khẩu đang làm khách bị đăng xuất** (lỗi sẵn có, được sửa luôn).
- Trường `code` là bổ sung, không thay trường `error` (giữ hợp đồng spec 001).

## R3. Refresh token và bảng lưu trữ

- **Decision**: Chuỗi ngẫu nhiên 32 byte (`crypto.randomBytes(32).toString('base64url')`), chỉ lưu
  SHA-256 hex trong bảng mới `refresh_tokens`. Mỗi lần đăng nhập tạo một `family_id` (UUID); mỗi lần gia
  hạn tạo bản ghi mới cùng `family_id` và đánh dấu bản ghi cũ `revoked_reason = 'rotated'`.
- **Rationale**: SHA-256 đủ cho chuỗi ngẫu nhiên 256 bit (không cần bcrypt vì không phải mật khẩu người
  chọn); tra cứu theo chỉ mục UNIQUE trên hash. `family_id` phục vụ phát hiện dùng lại (FR-005) và
  đăng xuất một thiết bị.
- **Alternatives**: Refresh token dạng JWT — không thu hồi được nếu không lưu; lưu nguyên văn — trái FR/SC-004.

## R4. Phát hiện dùng lại nhưng không đá khách khi nhiều tab gia hạn cùng lúc

- **Decision**: Token đã `rotated` được dùng lại:
  - trong **30 giây** kể từ lúc bị thay → coi là yêu cầu đồng thời từ tab khác: trả access token mới,
    **không** đổi cookie (trình duyệt đã nhận cookie mới từ phản hồi trước);
  - sau 30 giây → coi là bị đánh cắp: huỷ toàn bộ `family_id`, trả 401 `REFRESH_REUSED`.
- **Rationale**: Cookie dùng chung giữa các tab; hai tab gia hạn gần nhau gửi cùng một cookie cũ. Không
  có khoảng ân hạn thì khách bị đăng xuất vô cớ (edge case trong spec).
- Phía giao diện thêm gộp yêu cầu: trong một tab, mọi request 401 `TOKEN_EXPIRED` chờ chung một promise
  gia hạn.

## R5. Cookie

- **Decision**: tên `sdl_rt`; `httpOnly`; `path: '/api/auth'`; `maxAge` 7 ngày. Production:
  `secure: true`, `sameSite: 'none'` (frontend và API khác site). Development/test: `secure: false`,
  `sameSite: 'lax'` (localhost cùng site). Đặt bằng `res.cookie` có sẵn của Express; đọc bằng một hàm
  tách header `Cookie` ~10 dòng.
- **Rationale**: Không thêm `cookie-parser` cho một cookie (nguyên tắc IV). `path` hẹp để cookie không bị
  gửi kèm mọi request API.

## R6. CORS và kiểm tra nguồn

- **Decision**: `cors({ origin: <danh sách cho phép>, credentials: true })`. Danh sách: `FRONTEND_URL`,
  `https://pigeon-bookstore.pages.dev`, `http://localhost:5173`, cộng thêm `CORS_ORIGINS` (phân tách dấu
  phẩy). Các endpoint dùng cookie (`/auth/refresh`, `/auth/logout`) **bắt buộc** header `Origin` thuộc
  danh sách, nếu không trả 403.
- **Rationale**: CORS chỉ chặn trình duyệt đọc phản hồi, không chặn request được gửi đi; với cookie
  `SameSite=None`, trang lạ vẫn gửi được POST kèm cookie → cần kiểm tra `Origin` phía máy chủ (FR-013).
  Request không có `Origin` (PayOS webhook, curl) vẫn đi qua CORS bình thường cho các API khác.

## R7. Thu hồi phiên

| Sự kiện | Hành động |
|---|---|
| Đăng xuất | Huỷ cả `family_id` của cookie hiện tại, xoá cookie |
| Đăng xuất mọi nơi | Huỷ mọi bản ghi của user, xoá cookie |
| Đặt lại mật khẩu | Huỷ mọi bản ghi của user |
| Đổi mật khẩu | Huỷ mọi bản ghi của user, **cấp phiên mới cho thiết bị đang đổi** (khách không bị đăng xuất ở thiết bị mình) |
| Khoá tài khoản | Không cần huỷ: gia hạn kiểm tra `is_active` |

## R8. Quên mật khẩu và mã đặt lại

- **Decision**: Luôn trả 200 "Nếu email tồn tại trong hệ thống, hướng dẫn khôi phục đã được gửi." Lỗi
  gửi mail chỉ ghi log. Mã đặt lại: lưu SHA-256 vào `reset_password_token` (cột cũ, độ dài đủ 64), tra
  bằng hash; xoá ngay khi dùng (đã có).
- **Thay đổi hợp đồng**: email không tồn tại trước đây 400 → nay 200 (chủ đích, FR-010).

## R9. Chính sách mật khẩu

- **Decision**: Một hàm `validateNewPassword` (≥ 8 ký tự, có chữ cái và chữ số) dùng ở đăng ký, đặt lại,
  đổi mật khẩu; giao diện kiểm tra cùng quy tắc ở 3 trang. Không áp dụng khi đăng nhập.

## R10. Đồng bộ nhiều tab ở giao diện

- **Decision**: Bỏ việc tải lại trang khi khoá `token` đổi ở tab khác; chỉ phản ứng khi khoá `user` bị
  xoá (đăng xuất) hoặc đổi sang user khác. Giữ `BroadcastChannel('auth_channel')` cho đăng xuất.
- **Rationale**: Access token đổi mỗi 15 phút; giữ logic cũ sẽ tải lại mọi tab mỗi lần gia hạn.

## R11. Dọn bản ghi hết hạn

- **Decision**: Trong vòng lặp nền sẵn có của `server.js` (5 phút), mỗi giờ xoá bản ghi `refresh_tokens`
  hết hạn quá 1 ngày.
- **Rationale**: Mỗi lần gia hạn thêm một dòng; không dọn thì bảng phình mãi.

## R12. Triển khai và tương thích

- Phản hồi đăng nhập/đăng ký giữ trường `token` (= access token) → giao diện cũ vẫn đăng nhập được, hết
  15 phút thì interceptor cũ đưa về trang đăng nhập.
- Thứ tự: deploy backend → kiểm tra → deploy frontend. Thẻ 24 giờ cũ bị từ chối ngay (đăng nhập lại 1 lần).
- Cột `users.session_id` ngừng dùng, chưa xoá (backlog).
