# ⚙️ Smart Digital Library (SDL) — Backend API Context

> **Dự án:** Smart Digital Library (SDL) - Phân hệ Backend API  
> **Cập nhật lần cuối:** 06/2026  
> **Backend API Production URL:** [https://sdl-backend.onrender.com](https://sdl-backend.onrender.com)  
> **Frontend URL:** [https://pigeon-bookstore.pages.dev](https://pigeon-bookstore.pages.dev)  
> **AI Service URL:** [https://sdl-ai-service.onrender.com](https://sdl-ai-service.onrender.com)

---

## 🎯 Tổng quan repo Backend
Thư mục này chứa mã nguồn **Backend API** cho ứng dụng **Smart Digital Library (SDL)**. Backend chịu trách nhiệm cung cấp RESTful API, quản lý cơ sở dữ liệu PostgreSQL, xác thực người dùng, xử lý các logic nghiệp vụ đặt hàng, thanh toán qua cổng PayOS, và làm trung gian giao tiếp với AI/RAG Service.

---

## 🏗️ Kiến trúc & Công nghệ (Tech Stack)

*   **Node.js**: Nền tảng thực thi Javascript phía Server.
*   **Express 5.2**: Web Framework mới nhất với cơ chế xử lý Router nâng cấp, quản lý lỗi bất đồng bộ dễ dàng hơn.
*   **PostgreSQL 16**: Hệ quản trị cơ sở dữ liệu quan hệ (chạy Cloud, hỗ trợ Connection Pool và SSL).
*   **pg (node-postgres v8.20)**: Thư viện kết nối PostgreSQL trực tiếp không qua ORM để tối ưu hiệu năng truy vấn SQL.
*   **JWT (jsonwebtoken v9)**: Cung cấp cơ chế xác thực token không trạng thái (stateless), thời hạn hết hạn là 24 giờ.
*   **bcryptjs v3**: Mã hóa mật khẩu người dùng trước khi lưu vào database (salt rounds = 10).
*   **multer v2.1**: Xử lý việc tải lên tệp tin (ảnh bìa sách, file ảnh đại diện).
*   **@payos/node v2.0**: SDK chính thức tích hợp cổng thanh toán trực tuyến VietQR (PayOS).

---

## 📁 Cấu trúc thư mục (`src/`)

```
src/
├── config/             # Cấu hình Express app và thiết lập Connection Pool PostgreSQL
├── controllers/        # Logic nghiệp vụ xử lý request và trả về response
├── middleware/         # Các bộ lọc trung gian (Xác thực JWT, Kiểm tra phân quyền, Cấu hình CORS...)
├── models/             # Định nghĩa cấu trúc bảng và các câu lệnh truy vấn SQL thuần (Raw SQL)
├── routes/             # Định nghĩa các endpoint API và ánh xạ vào các controller tương ứng
├── services/           # Tích hợp dịch vụ bên ngoài (Khởi tạo giao dịch PayOS)
├── utils/              # Các công cụ hỗ trợ (Migrate database, Seed dữ liệu mẫu...)
└── server.js           # Điểm khởi chạy (Entry Point) của server Express
```

---

## 💾 Thiết kế Cơ sở dữ liệu (Database Models)

Hệ thống quản lý dữ liệu thông qua 10 Model chính tương ứng với các bảng trong PostgreSQL:

1.  **User**: Thông tin tài khoản (`id`, `email`, `password`, `full_name`, `role` [ADMIN, CURATOR, CUSTOMER], `created_at`).
2.  **Book**: Quản lý sách (`id`, `title`, `author`, `description`, `price`, `cover_image`, `pdf_url`, `category_id`, `created_at`).
3.  **Category**: Danh mục sách (`id`, `name`, `description`).
4.  **Inventory**: Theo dõi tồn kho (`id`, `book_id`, `quantity`, `last_updated`).
5.  **Order**: Đơn hàng (`id`, `user_id`, `total_amount`, `status` [PENDING, CONFIRMED, PACKAGING, DELIVERING, DELIVERED, CANCELLED], `shipping_address`, `payment_method`, `created_at`).
6.  **Payment**: Trạng thái thanh toán (`id`, `order_id`, `payment_gateway_order_id`, `amount`, `status` [PENDING, PAID, FAILED], `payos_payment_link`).
7.  **Review**: Đánh giá & Bình luận sách (`id`, `book_id`, `user_id`, `rating` [1-5 sao], `comment`, `created_at`).
8.  **Coupon**: Mã giảm giá (`id`, `code`, `discount_percent`, `valid_from`, `valid_to`, `active`).
9.  **Article**: Bài viết trên Blog (`id`, `title`, `content`, `author_id`, `published_at`).

---

## 🔌 API Routes Mapping

Hệ thống chia làm nhiều phân hệ route phục vụ API cho Client:

*   `/api/auth`: Đăng ký (`/register`), đăng nhập (`/login`), lấy thông tin cá nhân (`/profile`).
*   `/api/books`: Lấy danh sách sách, chi tiết sách, thêm/sửa/xóa sách (Admin/Curator).
*   `/api/categories`: Quản lý danh mục sách.
*   `/api/cart`: Lấy, cập nhật hoặc xóa các sản phẩm trong giỏ hàng.
*   `/api/orders`: Tạo đơn hàng mới, lịch sử đơn hàng của người dùng, cập nhật trạng thái đơn hàng (Admin).
*   `/api/payments`: Khởi tạo link thanh toán PayOS VietQR, nhận webhook tự động từ PayOS để đổi trạng thái đơn hàng sang `PAID`.
*   `/api/ai`: Chuyển tiếp request tải tài liệu PDF lên AI Service, chuyển tiếp câu hỏi Chat RAG của User sang AI Service.
*   `/api/notifications`: Các thông báo hệ thống gửi tới tài khoản.
*   `/api/admin`: Thống kê tổng quan doanh thu, số lượng đơn hàng, người dùng cho Dashboard Admin.

---

## 🔄 Luồng tích hợp cổng thanh toán PayOS (VietQR)

```
[Khách hàng] ──Chọn PayOS──> [Backend SDL] ──Tạo link TT──> [PayOS API]
     ▲                             │                             │
     │                             ▼                             │
 quét mã VietQR <──────── Trả về link QRCode & redirect <────────┘
     │
     ▼ (Quét thành công)
[Hệ thống PayOS] ──Gửi IPN Webhook tự động──> [Backend SDL] ──> [Đổi trạng thái đơn thành PAID & Mở khóa sách số]
```

*   **Endpoint Webhook nhận IPN:** `POST /api/payments/payos/webhook` (hoặc `GET /api/payments/payos/return` cho redirect url).

---

## ⚙️ Cấu hình môi trường Local

Tạo file `.env` nằm tại thư mục gốc backend (`sdl-project/`):

```ini
PORT=5000
DATABASE_URL=postgres://<user>:<password>@<host>:<port>/<db>?ssl=true
JWT_SECRET=Ma_Bao_Mat_JWT_Sieu_Cap_Cua_Ban
FRONTEND_URL=http://localhost:5173
PAYOS_CLIENT_ID=your_payos_client_id
PAYOS_API_KEY=your_payos_api_key
PAYOS_CHECKSUM_KEY=your_payos_checksum_key
AI_SERVICE_URL=http://localhost:8000
```

---

## 🚀 Hướng dẫn khởi chạy Local

1.  Di chuyển vào thư mục backend:
    ```bash
    cd sdl-project
    ```
2.  Cài đặt dependencies:
    ```bash
    npm install
    ```
3.  Tạo cấu trúc bảng dữ liệu (Migration):
    ```bash
    npm run migrate
    ```
4.  Tạo dữ liệu người dùng mẫu (Seed):
    ```bash
    npm run seed:users
    ```
5.  Chạy ứng dụng trong môi trường phát triển (tự động reload khi sửa file):
    ```bash
    npm run dev
    ```
    *API local sẽ hoạt động tại:* [http://localhost:5000](http://localhost:5000)
