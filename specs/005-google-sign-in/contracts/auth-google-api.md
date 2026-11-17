# Contract: Đăng nhập bằng Google (spec 005)

## POST `/api/auth/google`

Middleware: `requireAllowedOrigin` → `googleLoginLimiter` → `validate({ body: schemas.auth.google })`.

**Request** (JSON, `withCredentials`):

```json
{ "credential": "<ID token do Google Identity Services trả về>" }
```

**200 OK** — cùng dạng với `POST /api/auth/login`; đặt cookie `sdl_rt` (httpOnly, path `/api/auth`, 7 ngày);
nếu request mang cookie `sdl_rt` cũ thì phiên đó bị thu hồi:

```json
{
  "message": "Đăng nhập thành công!",
  "user": { "id": 12, "email": "khach@gmail.com", "fullName": "Khách Hàng", "role": "CUSTOMER" },
  "token": "<access token JWT 15 phút>"
}
```

**Lỗi** (dạng `{ "error": "...", "code"?: "..." }`, câu tiếng Việt, không lộ chi tiết kỹ thuật):

| HTTP | `code` | `error` | Khi nào |
|---|---|---|---|
| 400 | — | (câu của validate) | Thiếu `credential`, không phải chuỗi, dài quá 4096 |
| 401 | `GOOGLE_TOKEN_INVALID` | Không xác minh được tài khoản Google. Vui lòng thử lại. | Sai chữ ký, sai `aud`, sai `iss`, hết hạn, thiếu `sub`/`email`, `email_verified` ≠ true |
| 401 | — | Tài khoản của bạn đã bị khóa bởi quản trị viên! | `is_active = false` (cùng câu với `/auth/login`) |
| 403 | — | Nguồn yêu cầu không được phép. | `Origin` không nằm trong danh sách cho phép (`requireAllowedOrigin` hiện có) |
| 409 | `GOOGLE_EMAIL_LINKED` | Email này đã được liên kết với một tài khoản Google khác. | Email khớp tài khoản đã có `google_sub` khác |
| 429 | — | (câu của rate limit) | Quá 20 lần thất bại / 15 phút / IP |
| 503 | `GOOGLE_NOT_CONFIGURED` | Đăng nhập bằng Google chưa được bật. | Thiếu `GOOGLE_CLIENT_ID` trên máy chủ |
| 503 | `GOOGLE_UNAVAILABLE` | Không kết nối được Google, vui lòng thử lại sau. | Không lấy được khoá công khai của Google |

## Thay đổi endpoint có sẵn

| Endpoint | Thay đổi |
|---|---|
| `POST /api/auth/login` | Tài khoản `password_hash = NULL` → 401 "Email hoặc mật khẩu không chính xác!" (trước: 500 do bcrypt nhận NULL — trường hợp này chưa từng tồn tại) |
| `PUT /api/users/change-password` | Tài khoản `password_hash = NULL` → 400 `{ "error": "Tài khoản của bạn chưa có mật khẩu. Hãy dùng \"Quên mật khẩu\" để tạo mật khẩu." }` |
| `GET /api/users/profile` | `data` thêm `has_password: boolean` (không bao giờ trả `password_hash`, `google_sub`) |
| `POST /api/auth/forgot-password`, `/reset-password` | Không đổi hợp đồng; hoạt động cả với tài khoản chưa có mật khẩu (đặt lại = tạo mật khẩu) |

## Frontend

- `AuthContext.loginWithGoogle(credential)` → `POST /auth/google` → `startSession(response.data)` (dùng chung
  với `login` / `register`, gồm xoá dữ liệu cá nhân của tài khoản khác — B54).
- `GoogleLoginButton`: chỉ render khi có `VITE_GOOGLE_CLIENT_ID`; tải script GIS một lần; lỗi hiển thị bằng
  `error` của API (đã qua `withErrorId`).
- `ProfilePage`: `has_password === false` → hiển thị hướng dẫn "Tài khoản chưa có mật khẩu…" + liên kết
  `/forgot-password` thay cho form đổi mật khẩu.
