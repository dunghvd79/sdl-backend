# Data Model: Access token + refresh token

## Bảng mới `refresh_tokens`

```sql
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash CHAR(64) NOT NULL UNIQUE,      -- SHA-256 hex của token gửi cho client
    family_id UUID NOT NULL,                  -- một lần đăng nhập = một family
    expires_at TIMESTAMP NOT NULL,            -- created_at + 7 ngày
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMP NULL,
    revoked_reason VARCHAR(20) NULL,          -- rotated | logout | logout_all | password | reuse
    user_agent TEXT NULL
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family ON refresh_tokens(family_id);
```

Migration: thêm vào `src/config/database.js` (tự chạy khi deploy, idempotent) và cập nhật
`tests/fixtures/schema.sql`.

### Trạng thái một bản ghi

```text
active ──gia hạn──▶ revoked (rotated)  ── dùng lại ≤30s ─▶ trả access token mới (không đổi gì)
   │                                    └─ dùng lại >30s ─▶ huỷ cả family (reuse) → 401
   ├──đăng xuất / đăng xuất mọi nơi / đổi-đặt lại mật khẩu──▶ revoked
   └──quá expires_at──▶ hết hạn (bị dọn sau 1 ngày)
```

Hợp lệ để gia hạn khi: tồn tại theo hash, `revoked_at IS NULL`, `expires_at > NOW()`, user tồn tại và
`is_active <> false`.

## Bảng `users` (không đổi cấu trúc)

- `reset_password_token`: từ nay lưu SHA-256 hex của mã gửi qua email (cột `VARCHAR(255)` đủ chỗ).
- `session_id`: ngừng đọc/ghi; xoá ở lần dọn dẹp sau.

## Access token (JWT, không lưu)

| Trường | Ý nghĩa |
|---|---|
| `id`, `email`, `role` | lấy từ DB tại thời điểm cấp |
| `type` | `'access'` |
| `exp` | 15 phút |
