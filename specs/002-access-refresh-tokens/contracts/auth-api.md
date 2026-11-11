# Contract: API xác thực

Mọi lỗi theo [spec 001](../../001-centralized-error-handling/contracts/error-response.md): `{ error }`,
thêm `code` ở các lỗi xác thực dưới đây. Cookie phiên: `sdl_rt` (httpOnly, path `/api/auth`).

## POST /api/auth/login · POST /api/auth/register

Request như hiện tại. Phản hồi thành công (200 / 201):

```http
Set-Cookie: sdl_rt=<refresh>; Path=/api/auth; HttpOnly; Secure; SameSite=None; Max-Age=604800

{ "message": "...", "user": { "id", "email", "fullName", "role" }, "token": "<access 15m>" }
```

`token` giữ tên cũ để giao diện cũ vẫn chạy. Lỗi như hiện tại (401 sai thông tin, 400 email trùng...).
Đăng ký: mật khẩu ≥ 8 ký tự, có chữ và số → nếu không: 400 "Mật khẩu phải có ít nhất 8 ký tự, gồm cả chữ cái và chữ số!".

## POST /api/auth/refresh

Yêu cầu: cookie `sdl_rt`, header `Origin` thuộc danh sách cho phép, `withCredentials`.

| Kết quả | Mã | Body |
|---|---|---|
| Thành công | 200 | `{ "token": "<access mới>", "user": {...} }` + `Set-Cookie` mới |
| Dùng lại trong 30 giây | 200 | `{ "token", "user" }`, không `Set-Cookie` |
| Thiếu/sai/hết hạn/bị huỷ/tài khoản khoá | 401 | `{ "error": "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.", "code": "REFRESH_INVALID" }` + xoá cookie |
| Dùng lại sau 30 giây | 401 | như trên, `code: "REFRESH_REUSED"`, cả family bị huỷ |
| `Origin` không hợp lệ | 403 | `{ "error": "Nguồn yêu cầu không được phép." }` |

## POST /api/auth/logout

Cookie + `Origin` hợp lệ. Luôn 200 `{ "message": "Đã đăng xuất." }`, huỷ family của cookie (nếu có),
xoá cookie.

## POST /api/auth/logout-all

`Authorization: Bearer <access>` + `Origin` hợp lệ. 200 `{ "message": "Đã đăng xuất khỏi mọi thiết bị." }`,
huỷ mọi phiên của user, xoá cookie.

## POST /api/auth/forgot-password

Luôn 200 `{ "message": "Nếu email tồn tại trong hệ thống, hướng dẫn khôi phục mật khẩu đã được gửi." }`
(trước đây email không tồn tại → 400). Thiếu email → 400 như cũ.

## POST /api/auth/reset-password

Như hiện tại; thêm chính sách mật khẩu mới; thành công → huỷ mọi phiên của user.

## PUT /api/users/change-password

Như hiện tại; chính sách mật khẩu mới; thành công → huỷ mọi phiên, trả phiên mới cho thiết bị hiện tại:
`{ "message": "Đổi mật khẩu thành công", "token": "<access mới>" }` + `Set-Cookie`.
Sai mật khẩu hiện tại vẫn 401 `{ "error": "Mật khẩu hiện tại không đúng" }` **không có `code`**.

## Mọi API cần đăng nhập (`verifyToken`)

| Trường hợp | Mã | Body |
|---|---|---|
| Không gửi token | 401 | `{ "error": "Không tìm thấy Token xác thực!", "code": "TOKEN_MISSING" }` |
| Token hết hạn | 401 | `{ "error": "Phiên đăng nhập đã hết hạn.", "code": "TOKEN_EXPIRED" }` |
| Token sai / giả / kiểu cũ | 401 | `{ "error": "Token không hợp lệ hoặc đã hết hạn!", "code": "TOKEN_INVALID" }` |

## Giao diện (frontend) — hành vi bắt buộc

- `axios` instance bật `withCredentials: true`.
- 401 `TOKEN_EXPIRED` → gọi `/auth/refresh` một lần (gộp các request đồng thời) → lưu token → gửi lại request.
- Gia hạn thất bại, hoặc 401 `TOKEN_INVALID`/`TOKEN_MISSING` → xoá dữ liệu đăng nhập, về `/login?expired=true`.
- 401 không có `code` (sai mật khẩu) → chỉ báo lỗi, **không** đăng xuất.
