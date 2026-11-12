# Backlog — việc cần sửa trong tương lai

Ghi lại những điểm phát hiện trong lúc nâng cấp nhưng **chưa sửa** (ngoài phạm vi bước đang làm,
cần quyết định nghiệp vụ, hoặc để dành cho bước sau trong lộ trình). Khi làm xong một mục, chuyển nó
xuống phần "Đã xong" kèm commit.

Mức độ: 🔴 bảo mật/mất dữ liệu · 🟠 lỗi nghiệp vụ · 🟡 kỹ thuật · ⚪ dọn dẹp

## Đã lên lịch trong lộ trình nâng cấp

| # | Mức | Việc | Bước |
|---|---|---|---|

## Chưa lên lịch

| # | Mức | Việc | Ghi chú |
|---|---|---|---|
| B38 | 🔴 | Tài khoản test trên **production** (`admin@test.vn` quyền ADMIN, `curator@test.vn`, `customer@test.vn`) dùng mật khẩu được ghi cứng trong repo (`scratch/seed_production_users.js`, `src/utils/seed_test_users.js`); admin chính dùng mật khẩu 6 ký tự phổ biến | Phát hiện 12/11/2026. Đổi mật khẩu / khoá tài khoản test trên production; bỏ mật khẩu cố định khỏi script seed (đọc từ biến môi trường) |
| B11 | 🔴 | Mật khẩu DB Render cũ và Upstash cũ còn trong lịch sử git `sdl-backend` | Dịch vụ đã bị xoá nên vô hại; nếu repo public thì cân nhắc viết lại lịch sử |
| B12 | 🔴 | Đổi mật khẩu Neon (đã bị gửi trong phiên chat 11/11/2026), cập nhật `DB_PASSWORD` trên Render | Việc của chủ dự án |
| B13 | 🟠 | Tiền về sau khi đơn đã huỷ: đơn giữ CANCELLED, payment `REFUND_PENDING`, nhưng **chưa có màn hình/quy trình hoàn tiền** cho admin | Cần quyết định nghiệp vụ: hoàn tiền hay vẫn giao hàng |
| B14 | 🟠 | Ảnh upload lưu trên đĩa của Render (bị xoá mỗi lần deploy/restart); chỉ ảnh đã commit vào repo còn tồn tại | Chuyển sang lưu trữ đối tượng (Cloudinary/S3/R2) |
| B15 | 🟡 | Chuẩn hoá mã HTTP cho lỗi nghiệp vụ (vd "Email đã được đăng ký" 400 → 409, "Không tìm thấy đơn hàng" 400 → 404) | Phải sửa frontend cùng lúc; tạm giữ mã cũ ở spec 001 |
| B16 | 🟡 | Migration chạy lại toàn bộ mỗi lần khởi động trong `src/config/database.js` (~400 dòng); nên có hệ migration có thứ tự | |
| B17 | 🟡 | Migration `setval(..., 0)` cho `users_id_seq` / `articles_id_seq` báo lỗi khi bảng rỗng (DB mới tinh) | |
| B18 | 🟡 | Rate limit dùng bộ nhớ trong tiến trình: reset khi restart, không chia sẻ nếu chạy nhiều instance | Có thể dùng Redis store khi cần scale |
| B19 | 🟠 | Cookie phiên `sdl_rt` là cookie bên thứ ba (pages.dev ↔ onrender.com): bị chặn trên Safari/iPhone, cửa sổ ẩn danh Chrome và Chrome có bật "chặn cookie bên thứ ba" (đã xác nhận 12/11/2026 trên máy chủ dự án: "blocked due to user preferences") → khách bị đăng xuất sau 15 phút | Cách sửa: tên miền chung (vd `pigeon.vn` + `api.pigeon.vn`) hoặc proxy `/api` qua Cloudflare Pages Functions (cần đọc IP thật cho rate limit) |
| B20 | 🟡 | AI Service đã chết (Render và Railway đều bị xoá); `/api/ai/*` lỗi trên production | Chủ dự án chọn bỏ qua RAG lúc này |
| B21 | 🟡 | 20 lỗ hổng low/moderate trong `jest` (chỉ dev) | Chờ jest bản vá; không chạy trên production |
| B22 | ⚪ | Cache Redis chỉ áp dụng cho sách (`books:*`) | |
| B23 | ⚪ | `.cursorrules` ghi sai đường dẫn skill (`planning`, `tdd`, `review`) và tên middleware `authorizeRoles` (thực tế là `requireRole`) | |
| B24 | ⚪ | Các file `report_*.md` (báo cáo đồ án) còn URL AI Service cũ | |
| B26 | 🟡 | `src/services/aiService.js` `require('form-data')` nhưng `package.json` không khai báo; đang chạy được nhờ `axios` cài kèm | Thêm vào dependencies khi sửa AI Service |
| B27 | ⚪ | Lỗi multer khác `LIMIT_FILE_SIZE` (vd sai tên field) giờ trả câu chung "File tải lên không hợp lệ." thay vì thông báo tiếng Anh của thư viện | Đổi ở spec 001; tách thông báo riêng nếu cần |
| B29 | ⚪ | Cột `users.session_id` không còn dùng sau spec 002 (vẫn còn migration tạo cột trong `database.js` và `User.findById` vẫn đọc) | Xoá cột + migration khi dọn dẹp |
| B30 | ⚪ | CORS chưa cho phép bản preview của Cloudflare Pages (`*.pigeon-bookstore.pages.dev`) | Thêm qua `CORS_ORIGINS` hoặc regex nếu cần test bản preview |
| B31 | 🟡 | Quên mật khẩu vẫn có thể lộ email qua **thời gian phản hồi** (email có thật phải chờ cập nhật DB + đẩy vào Redis) | Code review spec 002 (Minor 2); sửa bằng gửi mail không chờ hoặc độ trễ cố định. Lợi ích hạn chế vì trang đăng ký vẫn báo "Email này đã được đăng ký!" |
| B32 | 🟡 | Đăng ký báo "Email này đã được đăng ký!" và đăng nhập báo "tài khoản bị khoá" trước khi kiểm tra mật khẩu → dò được email/trạng thái khoá | Có từ trước spec 002 |
| B33 | ⚪ | Mất phản hồi của `/auth/refresh` (mạng di động rớt) → trình duyệt giữ cookie cũ → lần gia hạn sau 30 giây bị coi là dùng lại và đăng xuất | Hệ quả đã biết của thiết kế R4 (spec 002); chấp nhận |
| B34 | ⚪ | Migration chạy bất đồng bộ sau khi server đã `listen`: vài giây đầu sau lần deploy có bảng mới, request dùng bảng đó có thể lỗi 500 | Có từ trước; cân nhắc chạy migration trước khi `listen` |
| B35 | ⚪ | `/auth/refresh` và `/auth/reset-password` chỉ có rate limit chung 300/15 phút | Cân nhắc limiter riêng |
| B36 | ⚪ | Kiểm tra thiếu trường và một số quy tắc vẫn nằm rải rác trong controller (vd `validateBookInput`, kiểm tra số điện thoại); lược đồ Zod chỉ bổ sung phần còn thiếu | Gom hết vào lược đồ khi dọn dẹp, giữ nguyên câu thông báo |
| B37 | ⚪ | Tham số đường dẫn (`:id`, `:userId`...) chưa có lược đồ; đang dựa vào giải mã hashId/parseInt trong controller | Thêm `validate({ params })` nếu cần |
| B28 | 🟡 | Mọi cột thời gian dùng `TIMESTAMP` **không múi giờ**; `pg` đọc theo múi giờ của Node. Postgres local/Neon chạy UTC, máy dev chạy +7 → so sánh thời gian bằng `Date` của Node lệch 7 giờ (đã gặp ở refresh token, sửa bằng so sánh trong SQL). Production hiện đúng vì Render cũng UTC | Rà các chỗ so sánh thời gian ở Node; cân nhắc chuyển sang `TIMESTAMPTZ` |
| B25 | ⚪ | Script kiểm thử chạy tay cũ `src/utils/test_*.js`, `scratch/test_*.js` không thuộc bộ test Jest | Xoá hoặc chuyển thành test Jest |

## Đã xong

| Việc | Commit |
|---|---|
| Kho bị trừ nhiều lần khi PayOS return URL/webhook xử lý cùng một đơn | `85b1d69` |
| VNPay cho phép giả mạo thanh toán bằng khoá dự phòng ghi cứng — đã gỡ VNPay | `6457f05` |
| 1 critical + 6 high trong `npm audit --omit=dev`; gỡ `nodemailer` không dùng | `2082e23` |
| Script `scratch/` ghi cứng chuỗi kết nối DB/Redis | `46923f7` |
| 72 chỗ trả `err.message` lộ lỗi nội bộ; lỗi trùng danh mục lộ tên ràng buộc DB — xử lý lỗi tập trung (spec 001) | `cd8c24b` |
| `/mock-gateway` bật trên production, chèn `orderId`/`amount` vào HTML không escape (XSS phản chiếu) — bước 7 | (commit bước 7) |
| `/api/payments/webhook` gọi `PaymentService.processWebhook` không tồn tại → luôn 500 — bước 7 | (commit bước 7) |
| Upload ảnh tin `mimetype` do client gửi và giữ đuôi file gốc (có thể lưu `.html` dưới dạng ảnh) — bước 7 | (commit bước 7) |
| Chưa có validation theo lược đồ cho phần lớn API (chỉ đăng ký/đặt lại mật khẩu kiểm tra tay) — spec 003 (Zod) | `d02cbea` |
| `handleDatabaseError` trong bookController trả nguyên văn lỗi DB lạ (sót từ spec 001) | `d02cbea` |
| Đặt lại mật khẩu không thu hồi token cũ (không đổi `session_id`) — spec 002 | `3a9c161`, `43212da`, frontend `949a033` |
| Quên mật khẩu báo "Email này không tồn tại" → dò được email đã đăng ký — spec 002 | `3a9c161`, `43212da`, frontend `949a033` |
| Token đặt lại mật khẩu lưu nguyên văn trong DB (nên lưu băm) — spec 002 | `3a9c161`, `43212da`, frontend `949a033` |
| Chính sách mật khẩu yếu (6 ký tự, chữ + số) — spec 002 | `3a9c161`, `43212da`, frontend `949a033` |
| CORS mở cho mọi origin (`cors()`); auth bằng cookie bắt buộc phải giới hạn origin + `credentials` — spec 002 | `3a9c161`, `43212da`, frontend `949a033` |
| Với access token không tra DB: khoá tài khoản / đổi role có hiệu lực chậm tối đa bằng tuổi thọ access token — **đã quyết định 11/11/2026: chấp nhận trễ** — spec 002 | `3a9c161`, `43212da`, frontend `949a033` |
