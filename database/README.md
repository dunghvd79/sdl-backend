# Hướng dẫn Quản lý & Vận hành Database Smart Digital Library (SDL)

Tài liệu này hướng dẫn cách phân tách và vận hành hệ thống cơ sở dữ liệu (PostgreSQL) giữa hai môi trường: **Local Development** (Phát triển) và **Production** (Thực tế).

---

## 1. Bản đồ Kiến trúc Database

Dự án SDL áp dụng nguyên tắc **Cô lập Môi trường (Environment Isolation)** tuyệt đối:

| Thành phần | Local Development | Production (Render) |
| :--- | :--- | :--- |
| **Dịch vụ Hosting** | Chạy trong Docker container (`postgres:15-alpine`) | Managed PostgreSQL trên Render (Singapore Cloud) |
| **Cổng kết nối** | `localhost:5432` | `dpg-d8v159cm0tmc738p8bsg-a.singapore-postgres.render.com:5432` |
| **Cấu hình** | Đọc từ file `.env` cục bộ | Đọc từ cài đặt **Environment Variables** trên Render |
| **Dữ liệu (Data)** | Dữ liệu giả định (Mock Data) phục vụ viết code và test | Dữ liệu thật của khách hàng (Tài khoản thật, đơn hàng thật, tiền thật) |

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

### B. Môi trường Production (Render Cloud)

Bạn có thể đứng ở máy local để sao lưu dữ liệu từ xa (Remote Backup) bằng chuỗi kết nối Production:

*   **Sao lưu Database Production về máy:**
    ```powershell
    pg_dump "postgresql://sdl_database_new_user:XvBZdbja7OJ9F4TlTJoNNbVX9DqiebFD@dpg-d8v159cm0tmc738p8bsg-a.singapore-postgres.render.com/sdl_database_new" -f database/production_backup.sql
    ```
*   **CẢNH BÁO:** Tuyệt đối **KHÔNG** chạy lệnh phục hồi (Restore) đè từ Local lên Production trừ trường hợp khẩn cấp có sự đồng ý của quản trị viên hệ thống để tránh ghi đè làm mất dữ liệu giao dịch thật của khách hàng.

---

## 4. Nguyên tắc Vận hành An toàn
1.  **Không dùng chung Redis:** Đảm bảo `REDIS_URL` ở local trỏ về `redis://localhost:6379`, không bao giờ trỏ lên Upstash Redis của Production để tránh xung đột hàng đợi gửi mail.
2.  **Bảo mật file `.env`:** Tuyệt đối không xóa `.env` khỏi file `.gitignore`. Không đẩy mật khẩu production lên các kho chứa git công khai.
