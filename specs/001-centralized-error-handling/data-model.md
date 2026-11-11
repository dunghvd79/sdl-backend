# Data Model: Xử lý lỗi tập trung cho API

Tính năng không thêm bảng hay cột nào. Các "thực thể" dưới đây là đối tượng trong bộ nhớ.

## AppError (lỗi nghiệp vụ)

| Thuộc tính | Kiểu | Ràng buộc |
|---|---|---|
| `message` | string | Tiếng Việt, hiển thị nguyên văn cho người dùng |
| `statusCode` | number | 400–499, hoặc 500 khi cần giữ thông báo cũ (R3: `ai.ask`) |
| `name` | string | `'AppError'` |

Quy tắc: chỉ ném `AppError` khi người dùng đọc được và tự xử lý được thông báo.

## Lỗi hệ thống

Mọi `Error` không phải `AppError` (lỗi DB, lỗi lập trình, lỗi dịch vụ ngoài), trừ hai trường hợp được
ánh xạ riêng trong middleware lỗi:

| Nhận diện | Mã | Thông báo |
|---|---|---|
| `err.type === 'entity.parse.failed'` | 400 | Dữ liệu gửi lên không đúng định dạng JSON. |
| `err.code === '23505'` (PostgreSQL UNIQUE) | 400 | Dữ liệu này đã tồn tại. |

## Mã tham chiếu lỗi (errorId)

- UUID v4, sinh mới cho mỗi lỗi hệ thống (mã 500).
- Xuất hiện ở trường `errorId` của phản hồi và trong dòng nhật ký tương ứng.
- Không có cho lỗi nghiệp vụ, JSON hỏng, 404.
