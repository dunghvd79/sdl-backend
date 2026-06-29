# ⚙️ Smart Digital Library (SDL) — Backend API Context

> **Dự án:** Smart Digital Library (SDL) - Phân hệ Backend API  
> **Cập nhật lần cuối:** 06/2026 (Database & Infrastructure Hardening)  
> **Backend API Production URL:** [https://sdl-backend.onrender.com](https://sdl-backend.onrender.com)  
> **Frontend URL:** [https://pigeon-bookstore.pages.dev](https://pigeon-bookstore.pages.dev)  
> **AI Service URL:** [https://sdl-ai-service.onrender.com](https://sdl-ai-service.onrender.com)

---

## 🎯 Tổng quan repo Backend
Thư mục này chứa mã nguồn **Backend API** cho ứng dụng **Smart Digital Library (SDL)**. Backend chịu trách nhiệm cung cấp RESTful API, quản lý cơ sở dữ liệu PostgreSQL, xác thực người dùng, xử lý các logic nghiệp vụ đặt hàng, thanh toán qua cổng PayOS, và làm trung gian giao tiếp với AI/RAG Service.

---

## 🏗️ Kiến trúc & Công nghệ (Tech Stack)

*   **Node.js**: Nền tảng thực thi Javascript phía Server (Node 20+).
*   **Express 5.2**: Web Framework mới nhất với cơ chế xử lý Router nâng cấp, quản lý lỗi bất đồng bộ dễ dàng hơn.
*   **PostgreSQL 16**: Hệ quản trị cơ sở dữ liệu quan hệ (chạy Cloud/Local, hỗ trợ Connection Pool, SSL và Full-Text Search).
*   **pg (node-postgres v8.20)**: Thư viện kết nối PostgreSQL trực tiếp không qua ORM để tối ưu hiệu năng truy vấn SQL.
*   **BullMQ v5**: Hệ thống quản lý hàng đợi (Message Queue) dùng để xử lý gửi email và các tác vụ nền bất đồng bộ hiệu năng cao.
*   **Redis**: Làm cơ sở dữ liệu in-memory phục vụ lưu cache API và làm backend lưu trữ hàng đợi cho BullMQ.
*   **Bảo mật OWASP Top 10**:
    *   **Helmet**: Bảo vệ HTTP Headers (chống Clickjacking, MIME sniffing, XSS Filter).
    *   **express-rate-limit**: Giới hạn tần suất gửi yêu cầu để chống tấn công brute-force và DDoS.
    *   **xss**: Middleware tự động loại bỏ mã độc XSS trong payload đầu vào (`req.body`).
*   **JWT (jsonwebtoken v9)**: Cung cấp cơ chế xác thực token không trạng thái (stateless).
*   **bcryptjs v3**: Mã hóa mật khẩu người dùng trước khi lưu vào database (salt rounds = 10).
*   **@payos/node v2.0**: Tích hợp cổng thanh toán trực tuyến VietQR (PayOS).
*   **Docker & Docker Compose**: Đóng gói container hóa toàn bộ dịch vụ (Frontend, Backend, AI Service, Postgres, Redis) phục vụ nhất quán môi trường triển khai.

---

## 📁 Cấu trúc thư mục (`src/`)

```
src/
├── config/             # Cấu hình Express app, Helmet, Rate Limiters, và Connection Pool PostgreSQL
├── controllers/        # Logic nghiệp vụ xử lý request và trả về response
├── middleware/         # Các bộ lọc trung gian (Xác thực JWT, Phân quyền, Lọc mã độc XSS...)
├── models/             # Định nghĩa cấu trúc bảng và các câu lệnh truy vấn SQL thuần (Raw SQL)
├── queues/             # Cấu hình BullMQ (connection, emailQueue, emailWorker xử lý ngầm)
├── routes/             # Định nghĩa các endpoint API và ánh xạ vào các controller
├── services/           # Tích hợp dịch vụ bên ngoài (PayOS, Resend Email Service)
├── utils/              # Các công cụ hỗ trợ (Migrate database, Seed dữ liệu...)
└── server.js           # Điểm khởi chạy (Entry Point) của server Express
```

---

## 💾 Thiết kế Cơ sở dữ liệu (Database Models)

Hệ thống quản lý dữ liệu thông qua các Model chính tương ứng với các bảng trong PostgreSQL:

1.  **User**: Tài khoản người dùng (`id`, `email`, `password_hash`, `role` [ADMIN, CURATOR, CUSTOMER], `full_name`, `phone`, `address`, `session_id`, `reset_password_token`, `reset_password_expires`, `is_active`, `created_at`).
2.  **Book**: Sách trong thư viện (`id`, `title`, `author`, `isbn`, `description`, `price`, `cover_url`, `status` [PUBLISHED, DRAFT, HIDDEN], `is_featured`, `is_bestseller`, `display_order`, `rag_indexed_at`, `created_at`).
3.  **BookImages**: Ảnh phụ chi tiết sách (`id`, `book_id` [Khóa ngoại], `image_url`, `display_order`, `created_at`).
4.  **Category**: Danh mục/thể loại sách (`id`, `name`, `description`).
5.  **Inventory**: Quản lý kho hàng (`book_id` [Khóa chính, Khóa ngoại], `available_qty`, `reserved_qty`, `sold_qty`, `updated_at`).
6.  **Order**: Đơn hàng (`id`, `user_id`, `total_amount`, `status` [PENDING, CONFIRMED, PACKAGING, DELIVERING, DELIVERED, CANCELLED], `payment_method`, `shipping_name`, `shipping_phone`, `shipping_address`, `shipping_notes`, `coupon_id`, `discount_amount`, `cancel_reason`, `created_at`).
7.  **OrderItems**: Chi tiết đơn hàng (`id`, `order_id`, `book_id`, `quantity`, `price_at_purchase`).
8.  **Cart**: Giỏ hàng người dùng (`id`, `user_id`, `created_at`).
9.  **CartItems**: Chi tiết giỏ hàng (`id`, `cart_id`, `book_id`, `quantity`, `price_at_add`, `added_at` - Ràng buộc UNIQUE [cart_id, book_id]).
10. **Coupon**: Mã giảm giá (`id`, `code`, `discount_type` [PERCENT, FIXED], `discount_value`, `min_order_amount`, `max_discount_amount`, `start_date`, `end_date`, `usage_limit`, `used_count`, `is_active`, `created_at`).
11. **UserCoupons**: Lịch sử áp dụng mã giảm giá (`user_id`, `coupon_id`, `used_at`).
12. **Wishlist**: Sách yêu thích (`id`, `user_id`, `book_id`, `created_at`).
13. **Notification**: Thông báo (`id`, `user_id`, `title`, `content`, `type` [ORDER, PROMOTION, ACCOUNT], `is_read`, `created_at`).
14. **Review**: Đánh giá sản phẩm (`id`, `book_id`, `user_id`, `rating` [1-5], `comment`, `created_at` - Ràng buộc UNIQUE [book_id, user_id]).
15. **Article**: Bài viết blog (`id`, `title`, `summary`, `content`, `cover_url`, `category`, `reading_time`, `status` [DRAFT, PUBLISHED, HIDDEN], `is_featured`, `created_at`).

---

## 🔌 API Routes Mapping

Hệ thống chia làm nhiều phân hệ route phục vụ API cho Client:

*   `/api/auth`: Đăng ký (`/register`), đăng nhập (`/login`), lấy thông tin cá nhân (`/profile`), quên/đổi mật khẩu.
*   `/api/books`: Lấy danh sách sách, chi tiết sách, thêm/sửa/xóa sách (Admin/Curator).
*   `/api/categories`: Quản lý danh mục sách.
*   `/api/cart`: Lấy, cập nhật hoặc thêm/xóa các sản phẩm trong giỏ hàng.
*   `/api/orders`: Tạo đơn hàng mới, lịch sử đơn hàng của người dùng, cập nhật trạng thái đơn hàng (Admin).
*   `/api/payments`: Khởi tạo link thanh toán PayOS VietQR, nhận webhook tự động từ PayOS.
*   `/api/ai`: Tải tài liệu PDF lên AI Service, truy vấn Chat RAG của User với AI Service.
*   `/api/notifications`: Các thông báo hệ thống gửi tới tài khoản.
*   `/api/admin`: Thống kê tổng quan doanh thu, số lượng đơn hàng, người dùng cho Dashboard Admin.

---

## 🔄 Luồng hàng đợi gửi email bất đồng bộ (BullMQ + Redis)

```
[Luồng Đăng ký / Quên MK] ──> [Đưa Job vào EmailQueue] ──> [Phản hồi Client lập tức (Dưới 50ms)]
                                        │
                                        ▼ (Chạy ngầm ở background)
                                [EmailWorker xử lý] ──Gọi Resend API──> [Gửi mail tới Khách hàng]
```

---

## ⚙️ Cấu hình môi trường Local (File `.env`)

Tạo file `.env` nằm tại thư mục `sdl-project/` (tham chiếu theo tệp mẫu `.env.example`):

```ini
PORT=3000
DB_USER=sdl_user
DB_PASSWORD=sdl_password_123
DB_HOST=localhost
DB_PORT=5432
DB_NAME=sdl_db
JWT_SECRET=Ma_Bao_Mat_JWT_Sieu_Cap_Cua_Ban
FRONTEND_URL=http://localhost:5173
REDIS_URL=redis://localhost:6379
RESEND_API_KEY=your_resend_api_key
EMAIL_FROM=onboarding@resend.dev
```

---

## 🚀 Hướng dẫn khởi chạy Local bằng Docker Compose (Khuyên dùng)

Cách nhanh nhất để chạy toàn bộ hệ thống (Postgres, Redis, Backend, Frontend, AI Service) mà không cần cài đặt môi trường cục bộ:

1.  Mở Terminal tại **thư mục gốc** của dự án (`e:\it-project\smart_digital_library`).
2.  Khởi chạy tất cả các dịch vụ:
    ```bash
    docker-compose up --build
    ```
3.  **Khởi tạo cấu trúc dữ liệu ban đầu:**
    Di chuyển vào thư mục `sdl-project` và chạy lệnh sau để thiết lập bảng và seed tài khoản mẫu lên Postgres local:
    ```bash
    cd sdl-project
    node src/utils/migrate.js
    node src/utils/seed_test_users.js
    ```
4.  **Truy cập hệ thống:**
    *   **Website (Frontend):** [http://localhost](http://localhost) (Cổng 80)
    *   **Backend API:** [http://localhost:3000](http://localhost:3000)
    *   **AI Service API:** [http://localhost:8000](http://localhost:8000)
