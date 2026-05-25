# 🗄️ SDL Data Dictionary

## 1. Bảng `users`
**Mục đích:** Lưu thông tin tài khoản đăng nhập và phân quyền của người dùng[cite: 1].

| Tên cột | Kiểu dữ liệu | Ràng buộc (Constraints) | Mô tả |
| :--- | :--- | :--- | :--- |
| `id` | SERIAL | PRIMARY KEY | ID định danh duy nhất (tự tăng) |
| `email` | VARCHAR(255)| NOT NULL, UNIQUE | Email đăng nhập của hệ thống |
| `password_hash`| VARCHAR(255)| NOT NULL | Mật khẩu đã được mã hóa |
| `role` | VARCHAR(50) | CHECK, DEFAULT 'CUSTOMER' | Vai trò: CUSTOMER, ADMIN, CURATOR[cite: 1] |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Thời gian tạo tài khoản |

**Quan hệ (Relationships):**
- 1 `user` có 1 `user_profile` (1:1)
- 1 `user` có nhiều `orders` (1:N)
- 1 `user` có nhiều `chat_sessions` (1:N)

---

## 2. Bảng `books`
**Mục đích:** Lưu trữ thông tin cơ bản của sách trong hệ thống E-commerce.

| Tên cột | Kiểu dữ liệu | Ràng buộc (Constraints) | Mô tả |
| :--- | :--- | :--- | :--- |
| `id` | SERIAL | PRIMARY KEY | ID định danh duy nhất của sách |
| `title` | VARCHAR(255)| NOT NULL | Tiêu đề cuốn sách |
| `author` | VARCHAR(255)| NULL | Tên tác giả |
| `description` | TEXT | NULL | Tóm tắt nội dung sách |
| `price` | DECIMAL(10,2)| NOT NULL | Giá bán hiện tại |
| `stock_quantity`| INT | DEFAULT 0 | Số lượng còn lại trong kho |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Thời gian thêm vào hệ thống |

**Quan hệ (Relationships):**
- 1 `book` thuộc nhiều `categories` (N:M qua bảng `book_categories`)
- 1 `book` có nhiều `document_chunks` (1:N - dùng cho RAG)