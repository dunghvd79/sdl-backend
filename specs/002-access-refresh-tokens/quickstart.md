# Quickstart: Kiểm chứng access/refresh token

## Backend

```bash
docker start sdl_postgres sdl_redis_test
cd sdl-project
npm test                                  # toàn bộ phải xanh
npx jest tests/auth.tokens.test.js        # cấp/gia hạn/thu hồi/dùng lại
npx jest tests/auth.password.test.js      # quên mật khẩu, đặt lại, đổi mật khẩu, chính sách
```

Kịch bản phải đạt: xem [contracts/auth-api.md](contracts/auth-api.md).

## Thủ công với server thật (localhost)

```bash
PORT=3000 node src/server.js
# Đăng nhập, lưu cookie
curl -i -c jar.txt -H "Origin: http://localhost:5173" -H "Content-Type: application/json" \
  -d '{"email":"<email>","password":"<mk>"}' localhost:3000/api/auth/login      # 200 + Set-Cookie sdl_rt
curl -i -b jar.txt -c jar.txt -X POST -H "Origin: http://localhost:5173" localhost:3000/api/auth/refresh   # 200 + cookie mới
curl -i -b jar.txt -X POST -H "Origin: https://evil.example" localhost:3000/api/auth/refresh              # 403
```

## Frontend (sau khi backend chạy)

```bash
cd code_frontend/sdl-frontend && npm run dev
```

1. Đăng nhập → DevTools Application: có cookie `sdl_rt` (HttpOnly) cho `localhost:3000/api/auth`.
2. Sửa `localStorage.token` thành một token hết hạn → bấm sang trang Đơn hàng → request tự gia hạn, không bị đá ra.
3. Mở 2 tab, để token hết hạn, thao tác cả hai tab → không tab nào bị đăng xuất, không tab nào tự tải lại.
4. Trang Tài khoản: đổi mật khẩu với mật khẩu hiện tại sai → báo lỗi, **không** bị đăng xuất.
5. "Đăng xuất mọi nơi" → tab/trình duyệt khác không gia hạn được (về trang đăng nhập sau khi token hết hạn).
6. `npm run build` thành công.
