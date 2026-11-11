# CLAUDE.md — SDL Backend (`sdl-project`)

Backend REST API của Smart Digital Library / Pigeon Bookstore: Node 20, Express 5, PostgreSQL qua `pg` (raw SQL, không ORM), Redis (cache + BullMQ), PayOS, Resend. Mô tả bảng và route chi tiết: [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md). Vận hành DB, khôi phục sự cố: [database/README.md](database/README.md).

Repo git riêng `sdl-backend`. Thư mục cha `smart_digital_library/` không phải git repo; frontend (`code_frontend/sdl-frontend`) và AI service (`sdl-ai-service`) là hai repo khác.

## Lệnh

```bash
docker start sdl_postgres        # Postgres local (sdl_user / sdl_db, cổng 5432); Redis local nếu cần: redis://localhost:6379
npm run dev                      # nodemon src/server.js, cổng 3000
npm start                        # node src/server.js (Render dùng lệnh này)
node --check <file>              # kiểm tra cú pháp nhanh
node src/utils/test_order_inventory_flow.js     # kịch bản kiểm thử tích hợp (cần DB local)
node src/utils/test_advanced_payment_flow.js
```

Chưa có test framework: `npm test` chỉ in lỗi. Các file `src/utils/test_*.js` và `scratch/test_*.js` là script chạy tay, không phải unit test.

## Kiến trúc

`routes/` → `controllers/` → `services/` (nghiệp vụ, transaction) → `models/` (SQL). Route được mount ở [src/config/app.js](src/config/app.js). [src/server.js](src/server.js) khởi động app, require `config/database` và chạy Email Worker cùng job huỷ đơn ONLINE quá hạn (mỗi 5 phút).

Controller là class có method `static async`, tự `try/catch` và trả `res.status(...).json({ data })` hoặc `{ error }`. Thông báo cho người dùng viết bằng tiếng Việt.

## Quy ước bắt buộc

- **SQL:** luôn dùng parameterized query (`$1, $2`), không cộng chuỗi. Khi `pool.connect()` thì `client.release()` trong `finally`. Đặt hàng, thanh toán, trừ kho và mọi luồng ghi nhiều bảng phải nằm trong `BEGIN/COMMIT/ROLLBACK`.
- **Phân quyền:** middleware ở [src/middleware/auth.js](src/middleware/auth.js) là `verifyToken`, `optionalVerifyToken`, `requireRole([...])`. `.cursorrules` ghi `authorizeRoles`, nhưng tên đó **không tồn tại**. Endpoint quản lý sách, kho, đơn, coupon dùng `verifyToken` + `requireRole(['ADMIN', 'CURATOR'])` (hoặc chỉ ADMIN).
- **Mỗi tài khoản chỉ có một phiên:** `verifyToken` so `sessionId` trong JWT với `users.session_id`. Đăng nhập nơi khác làm token cũ mất hiệu lực, nên khi test cần lấy token mới sau mỗi lần login.
- **ID mã hoá (hashids):** API trả `hashId` thay cho ID số của sách, đơn hàng và bài viết ([src/utils/hashids.js](src/utils/hashids.js)). Controller nhận ID từ client phải `decodeBookId` / `decodeOrderId` / ... trước khi đưa vào SQL. Quên bước này từng gây lỗi xoá nhiều món trong giỏ (`removeBulkFromCart`).
- **Thay đổi schema:** chưa có hệ migration có thứ tự. Migration là các câu `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` chạy mỗi lần khởi động trong [src/config/database.js](src/config/database.js); production tự cập nhật khi deploy. Câu mới phải idempotent và không được làm mất dữ liệu.
- **Cache Redis:** dùng `getCache` / `setCache` / `clearCachePattern` trong [src/config/redis.js](src/config/redis.js). Các hàm này trả `null`/`false` khi mất Redis, nên code gọi phải chạy được khi không có cache. Hiện chỉ API sách có cache (key `books:*`, TTL 1 giờ, trong `bookController`). Sửa dữ liệu sách xong phải gọi `clearCachePattern('books:*')`.
- **Đầu vào:** `sanitizeMiddleware` (thư viện `xss`) đã lọc `req.body` toàn cục. Rate limit: chung 300 request / 15 phút; `login`, `register`, `forgot-password` 10 request / 15 phút.

## Môi trường và deploy

- Mẫu biến: [.env.example](.env.example). `.env` local trỏ Postgres và Redis local; **không bao giờ** trỏ `.env` local lên DB hay Redis production.
- **Production:** Render service `sdl-backend` tự deploy khi push lên `main`. DB là **Neon** (Singapore), Redis là **Upstash**. Biến trên Render: `DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME`, `NODE_ENV=production` (bắt buộc, SSL chỉ bật khi production), `REDIS_URL`.
- `REDIS_URL` phải là `rediss://...`, không có dấu nháy. Giá trị sai định dạng làm `createClient` ném `Invalid URL` lúc khởi động, khiến deploy fail ("Exited with status 1").
- **AI Service đang chết** (Render và Railway đều đã xoá; kiểm tra 11/11/2026), nên `/api/ai/*` lỗi ở production. Không sửa phần RAG trừ khi được yêu cầu.
- Script bảo trì production trong `scratch/` đọc `PROD_DATABASE_URL` / `PROD_REDIS_URL` từ env. **Không commit mật khẩu hay chuỗi kết nối thật** vào bất kỳ file nào.

## Quy trình làm việc

- **Constitution** [.specify/memory/constitution.md](.specify/memory/constitution.md) là quy tắc cao nhất của repo; khi mâu thuẫn với file này thì constitution thắng. Thay đổi nhiều file đi theo Spec Kit (`/speckit-specify` → `plan` → `tasks` → `implement`); sửa lỗi đi theo skill `test-driven-development`. Skill nằm trong `.claude/skills/`.
- Lộ trình nâng cấp đã chốt và thiết kế auth mới (access/refresh token, cookie httpOnly, nhiều thiết bị): xem mục "Quyết định kỹ thuật" trong `../PROJECT_CONTEXT.local.md`.
- Làm rõ yêu cầu và lên kế hoạch trước khi code; thay đổi đúng phạm vi, không dọn code không liên quan (theo `.cursorrules` và `PROJECT_CONTEXT.local.md` ở thư mục cha).
- Theo `PROJECT_CONTEXT.local.md`: xong một tác vụ code hoặc fix bug thì commit và push lên `main`, việc này kích hoạt deploy Render. Trước khi push, chạy `node --check` cho các file đã sửa và kiểm tra diff không chứa bí mật.
- Sau khi xong việc, cập nhật mục "Đã hoàn thành" và "Nhật ký thay đổi" trong `../PROJECT_CONTEXT.local.md`.
