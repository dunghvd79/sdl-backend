# Contract: Phản hồi lỗi của API

Áp dụng cho mọi đường dẫn `/api/**` trả JSON. Không áp dụng cho các chuyển hướng của cổng thanh toán
(`/api/payments/payos_return`, `/api/payments/payos_cancel`).

Giao diện web đọc `response.data.error` (60 vị trí) — trường này **bắt buộc giữ nguyên**.

## Lỗi nghiệp vụ (`AppError`)

```http
HTTP/1.1 400 Bad Request        (hoặc 401/403/404... đúng như hiện tại)
Content-Type: application/json

{ "error": "Giỏ hàng trống, không thể thanh toán!" }
```

## Lỗi hệ thống

```http
HTTP/1.1 500 Internal Server Error
Content-Type: application/json

{ "error": "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.", "errorId": "3f1c2a9e-...-..." }
```

- KHÔNG có thông báo gốc, stack, tên bảng/cột, đường dẫn tệp.
- Chỉ khi `NODE_ENV=development`: thêm `"detail": "<thông báo gốc>"` để gỡ lỗi cục bộ.

## JSON sai cú pháp

```http
HTTP/1.1 400 Bad Request
{ "error": "Dữ liệu gửi lên không đúng định dạng JSON." }
```

## Đường dẫn API không tồn tại

```http
HTTP/1.1 404 Not Found
{ "error": "Không tìm thấy đường dẫn API." }
```

## Nhật ký máy chủ cho lỗi hệ thống

Một dòng `console.error`, sau đó là stack:

```text
[error 3f1c2a9e-...] GET /api/orders: relation "orders" does not exist
    at ...
```
