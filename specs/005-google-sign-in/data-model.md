# Data Model: Đăng nhập bằng Google (spec 005)

## Bảng `users` — thay đổi

| Cột | Kiểu | Thay đổi | Ghi chú |
|---|---|---|---|
| `google_sub` | `VARCHAR(255) NULL` | **mới** | Mã định danh Google (`sub`). Unique index `users_google_sub_key` (NULL không tính trùng) |
| `email_verified_at` | `TIMESTAMP NULL` | **mới** | Thời điểm email được chứng minh sở hữu. Đợt này chỉ gán khi đi qua Google (tạo mới / liên kết). Dùng lại cho B56 |
| `password_hash` | `VARCHAR(255)` | `NOT NULL` → **NULL được** | NULL = tài khoản chưa có mật khẩu (chỉ dùng Google) |

Giữ nguyên: unique `users_email_key (email)`, `users_email_lower_key (LOWER(email))` (B55), `role`,
`is_active`, `reset_password_token/expires`.

Migration (trong `src/config/database.js`, idempotent, không sửa dữ liệu cũ):

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub_key ON users (google_sub);
```

Cập nhật `tests/fixtures/schema.sql` tương ứng.

## Trạng thái phương thức đăng nhập của một tài khoản

| `password_hash` | `google_sub` | Đăng nhập được bằng |
|---|---|---|
| có | NULL | mật khẩu (như hiện nay) |
| NULL | có | Google |
| có | có | mật khẩu + Google (sau khi tài khoản Google đặt mật khẩu qua Quên mật khẩu) |
| NULL | NULL | không tồn tại trong luồng này (không có thao tác nào tạo ra) |

## Chuyển trạng thái

```text
[mật khẩu, chưa liên kết] ──đăng nhập Google, email khớp──▶ [Google] (password_hash=NULL, reset token=NULL,
                                                              mọi phiên bị thu hồi 'google_link', email_verified_at=NOW())
[không có tài khoản]      ──đăng nhập Google────────────────▶ [Google] (role=CUSTOMER, email_verified_at=NOW())
[Google]                  ──Quên mật khẩu + đặt lại─────────▶ [mật khẩu + Google]
[mật khẩu + Google]       ──đăng nhập Google────────────────▶ (không đổi gì, chỉ cấp phiên)
```

## Bảng `refresh_tokens`

Không đổi schema. Thêm giá trị `revoked_reason = 'google_link'` (≤ 20 ký tự, vừa cột `VARCHAR(20)`).

## Quy tắc dữ liệu

- `google_sub`: chuỗi khác rỗng từ payload đã xác minh; không bao giờ lấy từ client ngoài ID token.
- Email tạo mới: `payload.email` trim + chữ thường (B55).
- Họ tên tạo mới: `payload.name` trim; rỗng → phần trước `@` của email; cắt tối đa 100 ký tự.
- Đăng nhập Google không ghi đè `email`, `full_name`, `role` của tài khoản có sẵn.
