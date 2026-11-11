# Hướng dẫn Quản lý & Vận hành Database Smart Digital Library (SDL)

Tài liệu này hướng dẫn cách phân tách và vận hành hệ thống cơ sở dữ liệu (PostgreSQL) giữa hai môi trường: **Local Development** (Phát triển) và **Production** (Thực tế).

---

## 1. Bản đồ Kiến trúc Database

Dự án SDL áp dụng nguyên tắc **Cô lập Môi trường (Environment Isolation)** tuyệt đối:

| Thành phần | Local Development | Production |
| :--- | :--- | :--- |
| **PostgreSQL** | Docker container `sdl_postgres` (`postgres:15-alpine`) | **Neon** Serverless Postgres (AWS `ap-southeast-1`, Singapore, gói Free) |
| **Host DB** | `localhost:5432` | `ep-delicate-cherry-azmrwkck.c-3.ap-southeast-1.aws.neon.tech:5432` (database `neondb`, user `neondb_owner`) |
| **Redis** | `redis://localhost:6379` | **Upstash** Redis `apparent-spaniel-129440.upstash.io:6379` (bắt buộc TLS) |
| **Cấu hình** | Đọc từ file `.env` cục bộ | Đọc từ **Environment Variables** của service `sdl-backend` trên Render |
| **Dữ liệu (Data)** | Dữ liệu giả định (Mock Data) phục vụ viết code và test | Dữ liệu thật của khách hàng (Tài khoản thật, đơn hàng thật, tiền thật) |

> Mật khẩu DB và Redis chỉ lưu trên Render và dashboard Neon/Upstash. **Không ghi mật khẩu vào file này hay bất kỳ file nào được commit.**

### Biến môi trường Production trên Render

| Key | Giá trị |
| :--- | :--- |
| `NODE_ENV` | `production` — **bắt buộc**, vì `src/config/database.js` chỉ bật SSL khi ở production và Neon từ chối kết nối không SSL |
| `DB_HOST` | Host Neon ở bảng trên |
| `DB_PORT` | `5432` |
| `DB_USER` | `neondb_owner` |
| `DB_PASSWORD` | Lấy ở Neon Console → Roles |
| `DB_NAME` | `neondb` |
| `REDIS_URL` | `rediss://default:<password>@apparent-spaniel-129440.upstash.io:6379` |

Lưu ý khi điền `REDIS_URL`:
- Phải là **`rediss://`** (hai chữ s). Với `redis://`, log sẽ lặp lại `✅ Redis: Đã kết nối thành công` rồi `Socket closed unexpectedly`, vì Upstash đóng kết nối không TLS.
- Chỉ dán URL: không có dấu nháy, không có tiền tố `redis-cli --tls -u` hay `REDIS_URL=`. Giá trị sai định dạng làm `createClient` ném `Invalid URL` khi khởi động, và deploy thất bại với *Exited with status 1*.
- Lấy URL ở tab **TCP** trong Upstash (dùng nút copy để có mật khẩu thật), không dùng tab **REST** (`https://...`).

---

## 2. Quy trình Nâng cấp Cấu trúc Database (Migrations)

Khi bạn code một tính năng mới ở Local cần thay đổi cấu trúc bảng (thêm bảng mới, thêm cột mới):

1.  **Bước 1: Viết lệnh trong mã nguồn:**
    *   Mở file cấu hình kết nối [database.js](file:///e:/it-project/smart_digital_library/sdl-project/src/config/database.js).
    *   Thêm truy vấn SQL an toàn sử dụng cú pháp `ADD COLUMN IF NOT EXISTS` hoặc `CREATE TABLE IF NOT EXISTS` bên dưới hàm test kết nối.
    *   Ví dụ:
        ```javascript
        await pool.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS session_id VARCHAR(255);
        `);
        ```
2.  **Bước 2: Chạy kiểm thử ở Local:**
    *   Khởi chạy server local (`npm run dev` hoặc `docker-compose up`).
    *   Hệ thống sẽ chạy truy vấn trên và tự động cập nhật cấu trúc database local của bạn.
3.  **Bước 3: Đẩy code và tự động nâng cấp Production:**
    *   Khi bạn commit và push code lên GitHub nhánh `main`, Render sẽ tự động kéo bản cập nhật về và khởi chạy server mới.
    *   Khi server mới khởi chạy trên Render, nó sẽ tự động chạy file `database.js` và thực thi truy vấn cập nhật cấu trúc lên database Production mà **không làm mất dữ liệu hiện tại của khách hàng**.

---

## 3. Hướng dẫn Sao lưu & Phục hồi Dữ liệu (Backup & Restore)

Để phòng ngừa sự cố hoặc khi bạn muốn đồng bộ dữ liệu cấu trúc sạch, hãy sử dụng các câu lệnh dòng lệnh (CLI) sau:

### A. Môi trường Local (Chạy Docker)

Do database local chạy bằng Docker Compose, bạn cần thực thi câu lệnh thông qua container:

*   **Sao lưu dữ liệu Local ra file SQL:**
    ```powershell
    docker exec -t sdl_postgres_db pg_dump -U sdl_user -d sdl_db > database/local_backup.sql
    ```
*   **Phục hồi dữ liệu từ file SQL vào Local:**
    ```powershell
    # Windows PowerShell: Cát file SQL vào Postgres
    cat database/local_backup.sql | docker exec -i sdl_postgres_db psql -U sdl_user -d sdl_db
    ```

### B. Môi trường Production (Neon)

Máy local không cài `psql`/`pg_dump`, nên chạy qua image Docker `postgres:15-alpine`. Lấy chuỗi kết nối ở Neon Console → **Connect**, tắt *Connection pooling*, rồi đặt vào biến môi trường của phiên shell. Không ghi chuỗi này vào file.

*   **Sao lưu Database Production về máy (Git Bash):**
    ```bash
    export NEON_URL='postgresql://neondb_owner:<password>@ep-delicate-cherry-azmrwkck.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require'
    MSYS_NO_PATHCONV=1 docker run --rm -e NEON_URL postgres:15-alpine \
      sh -c 'pg_dump "$NEON_URL" --no-owner --no-privileges' > database/production_backup.sql
    ```
    File `production_backup.sql` chứa dữ liệu thật của khách hàng, **không commit**.
*   Neon gói Free có sẵn khôi phục theo thời điểm (*point-in-time restore*) trong một khoảng ngắn; xem ở Neon Console → **Backup & Restore**.
*   **CẢNH BÁO:** Tuyệt đối **KHÔNG** chạy lệnh phục hồi (Restore) đè từ Local lên Production trừ trường hợp khẩn cấp có sự đồng ý của quản trị viên hệ thống để tránh ghi đè làm mất dữ liệu giao dịch thật của khách hàng.

---

## 4. Khôi phục khi DB Production chết (sự cố 11/11/2026)

**Triệu chứng:** `/api/health` vẫn trả 200, nhưng mọi API có truy vấn DB trả 500 `{"error":"Connection terminated unexpectedly"}`.

**Nguyên nhân lần trước:** Production chạy trên PostgreSQL gói Free của Render. Gói này hết hạn 30 ngày sau khi tạo và không có backup, nên toàn bộ dữ liệu thật trên đó bị mất. Redis gói Free trên Upstash cũng bị xoá do lâu không dùng (log báo `getaddrinfo ENOTFOUND civil-skylark-152666.upstash.io`).

**Cách đã khôi phục:**
1. Dump DB local: `docker exec sdl_postgres pg_dump -U sdl_user -d sdl_db --no-owner --no-privileges --clean --if-exists > sdl_restore.sql`
2. Tạo project Neon ở region Singapore, nạp dump vào:
   ```bash
   MSYS_NO_PATHCONV=1 docker run --rm -i -e NEON_URL postgres:15-alpine \
     sh -c 'psql "$NEON_URL" -v ON_ERROR_STOP=1 --single-transaction -q' < sdl_restore.sql
   ```
3. Đối chiếu số dòng từng bảng giữa local và Neon.
4. Tạo Redis mới trên Upstash, rồi cập nhật các biến ở mục 1 trên Render và bấm **Save, rebuild and deploy**.

**Dữ liệu sau khôi phục:** lấy từ DB local tại thời điểm 11/11/2026, gồm 12 sách, 11 danh mục, 4 user, 21 đơn hàng, 3 bài viết, 3 coupon. Mật khẩu các tài khoản là mật khẩu trong DB local, **không phải** `password123`.

**Đọc log Render khi deploy:** mã trong ngoặc vuông (ví dụ `[4vd87]`) là ID instance. Trong lúc deploy, log của instance cũ và mới lẫn vào nhau; instance cũ chỉ bị tắt khi instance mới chạy được. Nếu Events báo *Deploy failed*, web vẫn chạy bằng instance cũ với env cũ.

**Script bảo trì Production** (`scratch/*production*.js`, `scratch/sync_books_to_prod.js`, `scratch/check_all_books.js`, `scratch/find_fullname_columns.js`): không còn ghi cứng chuỗi kết nối. Đặt biến trong phiên shell (hoặc thêm vào `.env` local, file này đã được `.gitignore`) rồi mới chạy:
```bash
export PROD_DATABASE_URL='postgresql://neondb_owner:<password>@ep-delicate-cherry-azmrwkck.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require'
export PROD_REDIS_URL='rediss://default:<password>@apparent-spaniel-129440.upstash.io:6379'   # chỉ cho flush_production_redis.js
node scratch/check_all_books.js
```
Nếu thiếu biến, script dừng ngay với thông báo `❌ Thiếu biến môi trường ...` chứ không kết nối nhầm chỗ.

**AI Service:** khi kiểm tra ngày 11/11/2026, cả bản Render (`sdl-ai-service.onrender.com`) và Railway (`sdl-ai-service-production.up.railway.app`) đều đã bị xoá. Biến `AI_SERVICE_URL` trên Render vẫn trỏ về Railway; khi deploy lại AI Service cần cập nhật biến này.

**Phòng ngừa:** Neon gói Free không hết hạn theo thời gian, nhưng Upstash có thể xoá Redis bị bỏ không quá lâu. Định kỳ sao lưu DB production theo mục 3B.

---

## 5. Nguyên tắc Vận hành An toàn
1.  **Không dùng chung Redis:** Đảm bảo `REDIS_URL` ở local trỏ về `redis://localhost:6379`, không bao giờ trỏ lên Upstash Redis của Production để tránh xung đột hàng đợi gửi mail.
2.  **Bảo mật file `.env`:** Tuyệt đối không xóa `.env` khỏi file `.gitignore`. Không đẩy mật khẩu production lên các kho chứa git công khai.
