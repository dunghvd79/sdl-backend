# Quickstart: kiểm chứng đăng nhập bằng Google (spec 005)

## Chuẩn bị (chủ dự án, một lần)

1. Google Cloud Console → tạo project → **APIs & Services → OAuth consent screen**: loại *External*,
   chỉ scope cơ bản (`openid`, `email`, `profile`) → **Publish app** (scope cơ bản không cần Google duyệt).
2. **Credentials → Create credentials → OAuth client ID**, loại *Web application*.
   **Authorized JavaScript origins**: `https://pigeon-bookstore.pages.dev`, `http://localhost:5173`.
   Không cần redirect URI.
3. Đặt Client ID (không phải secret, không cần client secret):
   - Render `sdl-backend` → `GOOGLE_CLIENT_ID`
   - Cloudflare Pages `sdl-frontend` → `VITE_GOOGLE_CLIENT_ID` (rồi build lại)
   - Local: `sdl-project/.env` và `sdl-frontend/.env` tương ứng (chủ dự án tự thêm).
   - **Phải đặt cả hai** (cùng một Client ID): chỉ có biến frontend thì nút vẫn hiện nhưng bấm vào báo
     "Đăng nhập bằng Google chưa được bật." (503); chỉ có biến backend thì nút không hiện.

## Kiểm chứng tự động

```bash
docker start sdl_postgres sdl_redis_test
cd sdl-project && npm test                 # gồm tests/auth.google.test.js (token ký bằng khoá RSA của test)
cd ../code_frontend/sdl-frontend && npm test && npm run build
```

Kỳ vọng: toàn bộ xanh; test Google bao phủ US1–US4 và các mã lỗi trong [contracts/auth-google-api.md](contracts/auth-google-api.md).

## Kiểm chứng thủ công (local rồi production)

| # | Thao tác | Kỳ vọng |
|---|---|---|
| 1 | Trang Đăng nhập / Đăng ký | Có nút Google; xoá `VITE_GOOGLE_CLIENT_ID` thì nút biến mất |
| 2 | Đăng nhập Google bằng tài khoản Google chưa dùng | Vào trang chủ, tên hiển thị đúng, vai trò khách hàng |
| 3 | Đăng xuất, đăng nhập Google lại | Cùng tài khoản (không tạo thêm — xem trang quản trị Người dùng) |
| 4 | Tạo tài khoản mật khẩu bằng email X (đăng nhập trên trình duyệt khác), rồi đăng nhập Google bằng X | Vào tài khoản cũ (đơn hàng còn); mật khẩu cũ không đăng nhập được; trình duyệt kia bị đăng xuất khi gia hạn |
| 5 | Trang hồ sơ của tài khoản chỉ dùng Google | Thấy hướng dẫn tạo mật khẩu thay cho form |
| 6 | Quên mật khẩu bằng email đó → đặt mật khẩu | Đăng nhập được bằng cả mật khẩu và Google (production: chỉ tới được email chủ tài khoản Resend — B60) |
| 7 | Admin khoá tài khoản ở bước 2, đăng nhập Google lại | Báo tài khoản bị khoá |
