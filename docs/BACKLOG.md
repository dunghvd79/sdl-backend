# Backlog — việc cần sửa trong tương lai

Ghi lại những điểm phát hiện trong lúc nâng cấp nhưng **chưa sửa** (ngoài phạm vi bước đang làm,
cần quyết định nghiệp vụ, hoặc để dành cho bước sau trong lộ trình). Khi làm xong một mục, chuyển nó
xuống phần "Đã xong" kèm commit.

Mức độ: 🔴 bảo mật/mất dữ liệu · 🟠 lỗi nghiệp vụ · 🟡 kỹ thuật · ⚪ dọn dẹp

## Đã lên lịch trong lộ trình nâng cấp

| # | Mức | Việc | Bước |
|---|---|---|---|
| B1 | 🔴 | Đặt lại mật khẩu không thu hồi token cũ (không đổi `session_id`) | 5 (auth mới) |
| B2 | 🔴 | Quên mật khẩu báo "Email này không tồn tại" → dò được email đã đăng ký | 5 |
| B3 | 🟠 | Token đặt lại mật khẩu lưu nguyên văn trong DB (nên lưu băm) | 5 |
| B4 | 🟠 | Chính sách mật khẩu yếu (6 ký tự, chữ + số) | 5 |
| B5 | 🟠 | CORS mở cho mọi origin (`cors()`); auth bằng cookie bắt buộc phải giới hạn origin + `credentials` | 5 |
| B6 | 🟡 | Với access token không tra DB: khoá tài khoản / đổi role có hiệu lực chậm tối đa bằng tuổi thọ access token — cần quyết định ở `/speckit-clarify` | 5 |
| B7 | 🟠 | Chưa có validation theo lược đồ cho phần lớn API (chỉ đăng ký/đặt lại mật khẩu kiểm tra tay) | 6 (Zod) |
| B8 | 🟠 | `/mock-gateway` bật trên production, chèn `orderId`/`amount` vào HTML không escape (XSS phản chiếu) | 7 |
| B9 | 🟡 | `/api/payments/webhook` gọi `PaymentService.processWebhook` không tồn tại → luôn 500 | 7 |
| B10 | 🟡 | Upload ảnh tin `mimetype` do client gửi và giữ đuôi file gốc (có thể lưu `.html` dưới dạng ảnh) | 7 |

## Chưa lên lịch

| # | Mức | Việc | Ghi chú |
|---|---|---|---|
| B11 | 🔴 | Mật khẩu DB Render cũ và Upstash cũ còn trong lịch sử git `sdl-backend` | Dịch vụ đã bị xoá nên vô hại; nếu repo public thì cân nhắc viết lại lịch sử |
| B12 | 🔴 | Đổi mật khẩu Neon (đã bị gửi trong phiên chat 11/11/2026), cập nhật `DB_PASSWORD` trên Render | Việc của chủ dự án |
| B13 | 🟠 | Tiền về sau khi đơn đã huỷ: đơn giữ CANCELLED, payment `REFUND_PENDING`, nhưng **chưa có màn hình/quy trình hoàn tiền** cho admin | Cần quyết định nghiệp vụ: hoàn tiền hay vẫn giao hàng |
| B14 | 🟠 | Ảnh upload lưu trên đĩa của Render (bị xoá mỗi lần deploy/restart); chỉ ảnh đã commit vào repo còn tồn tại | Chuyển sang lưu trữ đối tượng (Cloudinary/S3/R2) |
| B15 | 🟡 | Chuẩn hoá mã HTTP cho lỗi nghiệp vụ (vd "Email đã được đăng ký" 400 → 409, "Không tìm thấy đơn hàng" 400 → 404) | Phải sửa frontend cùng lúc; tạm giữ mã cũ ở spec 001 |
| B16 | 🟡 | Migration chạy lại toàn bộ mỗi lần khởi động trong `src/config/database.js` (~400 dòng); nên có hệ migration có thứ tự | |
| B17 | 🟡 | Migration `setval(..., 0)` cho `users_id_seq` / `articles_id_seq` báo lỗi khi bảng rỗng (DB mới tinh) | |
| B18 | 🟡 | Rate limit dùng bộ nhớ trong tiến trình: reset khi restart, không chia sẻ nếu chạy nhiều instance | Có thể dùng Redis store khi cần scale |
| B19 | 🟡 | Safari/iPhone chặn cookie khác domain → khách phải đăng nhập lại khi access token hết hạn | Gắn tên miền chung cho frontend và API |
| B20 | 🟡 | AI Service đã chết (Render và Railway đều bị xoá); `/api/ai/*` lỗi trên production | Chủ dự án chọn bỏ qua RAG lúc này |
| B21 | 🟡 | 20 lỗ hổng low/moderate trong `jest` (chỉ dev) | Chờ jest bản vá; không chạy trên production |
| B22 | ⚪ | Cache Redis chỉ áp dụng cho sách (`books:*`) | |
| B23 | ⚪ | `.cursorrules` ghi sai đường dẫn skill (`planning`, `tdd`, `review`) và tên middleware `authorizeRoles` (thực tế là `requireRole`) | |
| B24 | ⚪ | Các file `report_*.md` (báo cáo đồ án) còn URL AI Service cũ | |
| B25 | ⚪ | Script kiểm thử chạy tay cũ `src/utils/test_*.js`, `scratch/test_*.js` không thuộc bộ test Jest | Xoá hoặc chuyển thành test Jest |

## Đã xong

| Việc | Commit |
|---|---|
| Kho bị trừ nhiều lần khi PayOS return URL/webhook xử lý cùng một đơn | `85b1d69` |
| VNPay cho phép giả mạo thanh toán bằng khoá dự phòng ghi cứng — đã gỡ VNPay | `6457f05` |
| 1 critical + 6 high trong `npm audit --omit=dev`; gỡ `nodemailer` không dùng | `2082e23` |
| Script `scratch/` ghi cứng chuỗi kết nối DB/Redis | `46923f7` |
