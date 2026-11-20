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
| B39 | ⚪ | Giao diện hỏi `/notifications` mỗi 15 giây kể cả khi tab ẩn (`Navbar.jsx`, `NotificationsPage.jsx`) — tốn request vô ích | Rủi ro bị 429 đã giảm nhờ spec 004 (hạn mức chung 1000/15 phút theo tài khoản); vẫn nên dừng hỏi khi tab ẩn |
| B44 | ⚪ | Trang thanh toán (frontend) bỏ khoảng trắng giữa số điện thoại trước khi kiểm tra (`091 234 5678` qua được), nhưng backend đặt hàng không bỏ → khách thấy lỗi từ máy chủ thay vì ngay trên form. Hồ sơ thì backend có bỏ | Thống nhất: hoặc frontend gửi số đã bỏ khoảng trắng, hoặc lược đồ checkout chuẩn hoá giống hồ sơ |
| B47 | ⚪ | (Đã chuyển phần đổi trạng thái/huỷ đơn sang `OrderService` — `57132d1`) Phần còn lại vẫn truy vấn thẳng trong controller: thống kê, quản lý người dùng trong `adminController`; `inventoryController`, `wishlistController` | Chuyển dần khi đụng tới; không gây lỗi hiện tại |
| B50 | ⚪ | Mã trạng thái lỗi nghiệp vụ chưa đúng nghĩa ở vài chỗ cũ: khách huỷ / đổi COD đơn của người khác → `400` (đúng là `403`); không tìm thấy đơn → `400` phía khách nhưng `404` phía admin | Phát hiện 16/11/2026. Spec 001 cố ý giữ nguyên hành vi; đổi cần kiểm tra giao diện có dựa vào mã 400 không |
| B51 | ⚪ | Middleware `validate` chỉ kiểm tra, không gán `result.data` vào `req` (spec 003 R3) → controller nhận dữ liệu thô: phải `trim` lại, số từ form vẫn là chuỗi (chạy được nhờ ép kiểu ngầm), và kiểm tra lệch với dữ liệu lưu — hồ sơ chấp nhận `091 234 5678` nhưng lưu nguyên chuỗi có khoảng trắng (liên quan B44) | Phát hiện 16/11/2026. Hướng: "parse, don't validate" — `validate` gán dữ liệu đã parse, chuyển dần từng nhóm lược đồ (bắt đầu từ đặt hàng / hồ sơ), kèm test payload thật của giao diện |
| B56 | ⚪ | Đăng ký không xác minh email: tài khoản dùng được ngay với email bất kỳ (kể cả email của người khác) | Phát hiện 17/11/2026. Hướng: gửi link xác minh qua Resend, cột `email_verified_at`; quyết định chặn những gì khi chưa xác minh. **17/11/2026: chờ tên miền (B60)** — trong lúc chờ giữ thiết kế hiện tại, khuyến khích đăng nhập Google (nút đưa lên đầu form). Khi làm B56 thì sửa bước gộp Google: tài khoản đã xác minh email giữ mật khẩu |
| B60 | 🟡 | Email quên mật khẩu chỉ gửi được tới email chủ tài khoản Resend: `EMAIL_FROM=onboarding@resend.dev` (địa chỉ thử nghiệm). 17/11/2026 đã sửa phần chặn hoàn toàn — Render thiếu `RESEND_API_KEY` và `EMAIL_FROM` là `@gmail.com` (Resend 403 "domain is not verified"); đã thử đặt lại mật khẩu thành công trên production | Việc của chủ dự án: mua tên miền → xác minh trên Resend → `EMAIL_FROM=no-reply@<tên miền>` (cùng tên miền giải quyết luôn B19). Server đã cảnh báo lúc khởi động khi thiếu khoá / dùng hộp thư công cộng (`src/config/env.js`) |
| B61 | 🟡 | Không có log truy cập (access log): request thành công không để lại dấu vết trên Render (method, đường dẫn, mã trả về, thời gian xử lý) → khó điều tra sự cố, không biết request có tới backend không | Phát hiện 17/11/2026. Hướng: `pino-http` (hoặc `morgan`) một dòng mỗi request kèm request id (dùng chung với `errorId`); không ghi body, header `Authorization`, cookie, `?token=` |
| B63 | 🟡 | Template email ([src/services/emailService.js](../src/services/emailService.js)) chèn thẳng `userName` vào HTML (`Xin chào ${userName}`). Họ tên tạo qua Google (spec 005) không đi qua `sanitizeMiddleware` → phá giả định "chuỗi người dùng đã lọc XSS"; tác động chỉ tới hộp thư chính chủ | Phát hiện 17/11/2026 (code review spec 005, Minor #2). Hướng: escape HTML mọi giá trị chèn vào template email |
| B64 | ⚪ | Liên kết Google huỷ mật khẩu cũ nhưng không báo người dùng → lần sau đăng nhập mật khẩu chỉ thấy "sai mật khẩu" | Phát hiện 17/11/2026 (code review spec 005, Minor #1; câu hướng dẫn ở trang hồ sơ đã sửa). Hướng: email "Tài khoản đã liên kết Google, mật khẩu cũ đã bị huỷ" tới hộp thư vừa xác minh — cần B60 (tên miền gửi mail) |
| B65 | ⚪ | `GoogleLoginButton` gọi `google.accounts.id.initialize` lại mỗi lần trang Đăng nhập / Đăng ký được mở → Google in cảnh báo trên console (vô hại) | Phát hiện 17/11/2026 (code review spec 005, Minor #4). Hướng: nhớ `clientId` đã khởi tạo ở cấp module, chỉ đổi callback qua ref |
| B66 | 🟡 | Một lần chạy `npm test` (17/11/2026, khi máy chậm bất thường — quá 10 phút thay vì ~2 phút) có 1 test fail không rõ tên (output chỉ giữ dòng tổng); chạy lại toàn bộ và lặp riêng các file test mới 4 lần đều xanh | Theo dõi: lần sau có test chập chờn thì lưu nguyên output (`npm test > file`) để biết tên test và lỗi |
| B67 | ⚪ | ID số thật lộ ra ngoài cho người dùng, danh mục, mã giảm giá, thông báo (hashId chỉ áp dụng sách / đơn hàng / bài viết). Ví dụ: access token và response đăng nhập (`publicUser`) có `id: 15` → tạo tài khoản mới là ước lượng được số người dùng. Không phải lỗ bảo mật: API của khách lấy id từ token đã ký, route `/admin/users/:userId` chỉ ADMIN gọi được | Phát hiện 17/11/2026. Ưu tiên thấp. Muốn che thì thêm loại `users` vào `src/utils/hashids.js`, encode ở `publicUser` + `signAccessToken` + danh sách user của admin, decode ở các route `/admin/users/:userId`; sửa frontend đồng bộ. Phải giữ kiểm tra quyền (chống IDOR) — hashId chỉ che, không bảo vệ |
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
| B36 | ⚪ | (Đã gom cho đặt hàng + hồ sơ — `dea695a`) Kiểm tra thiếu trường và một số quy tắc vẫn nằm rải rác trong controller (vd `validateBookInput`, kiểm tra số điện thoại); lược đồ Zod chỉ bổ sung phần còn thiếu | Gom hết vào lược đồ khi dọn dẹp, giữ nguyên câu thông báo |
| B37 | ⚪ | Tham số đường dẫn (`:id`, `:userId`...) chưa có lược đồ; đang dựa vào giải mã hashId/parseInt trong controller | Thêm `validate({ params })` nếu cần |
| B28 | 🟡 | Mọi cột thời gian dùng `TIMESTAMP` **không múi giờ**; `pg` đọc theo múi giờ của Node. Postgres local/Neon chạy UTC, máy dev chạy +7 → so sánh thời gian bằng `Date` của Node lệch 7 giờ (đã gặp ở refresh token, sửa bằng so sánh trong SQL). Production hiện đúng vì Render cũng UTC | Rà các chỗ so sánh thời gian ở Node; cân nhắc chuyển sang `TIMESTAMPTZ` |
| B69 | ⚪ | Khung transaction: `ROLLBACK` trong `catch` lỗi (kết nối đứt) thì che mất lỗi gốc; `client.release()` không truyền lỗi nên kết nối hỏng quay lại pool | Phát hiện 18/11/2026 khi soạn bài học transaction. Sửa: bọc `ROLLBACK` trong try/catch riêng, `release(err)` khi lỗi kết nối; cân nhắc helper `withTransaction` dùng chung |
| B75 | 🟡 | "Thanh toán lại" (`GET /payments/url/:id` từ trang đơn hàng / lịch sử) mỗi lần tạo thêm một dòng `payments` PENDING và gọi PayOS tạo link mới với **cùng `orderCode`** — PayOS thường từ chối mã đơn trùng → khách đóng tab thanh toán rồi không lấy lại được link | Phát hiện 20/11/2026 khi soạn bài học 08. **Cần thử trên PayOS thật** để xác nhận. Sửa: nếu đã có link còn hiệu lực thì `paymentRequests.get(orderCode)` lấy lại `checkoutUrl`; không tạo dòng payments trùng |
| B76 | ⚪ | Đặt hàng không có Idempotency-Key: request gửi lại (mạng chập, bấm nhanh hai lần) → hai đơn; hiện chỉ dựa vào nút bị khoá khi đang gửi. Webhook PayOS cũng chưa đối chiếu `amount` với `total_amount` của đơn | Phát hiện 20/11/2026. Rủi ro thấp; Idempotency-Key = header + bảng UNIQUE lưu kết quả |
| B71 | ⚪ | Test chập chờn: `tests/auth.google.test.js:208` ("email đã liên kết với tài khoản Google khác → 409", `userCount()` khác 1) lỗi 1 lần khi chạy cả bộ 18/11/2026; chạy riêng 3 lần và chạy lại cả bộ đều qua | Theo dõi; nếu lặp lại thì tìm request/khoá còn chạy dở từ test trước |
| B25 | ⚪ | Script kiểm thử chạy tay cũ `src/utils/test_*.js`, `scratch/test_*.js` không thuộc bộ test Jest | Xoá hoặc chuyển thành test Jest |
| B40 | ⚪ | 10 cảnh báo ESLint còn lại sau khi thêm `eslint.config.js`: `no-unused-vars` (paymentController.js, Inventory.js, paymentService.js), `no-useless-escape` (authController.js, bookController.js — đã hạ xuống "warn" để không churn regex), `eslint-disable` thừa (errorHandler.js:12) | Dọn khi tiện; đều là code cũ, không ảnh hưởng chạy. Phát hiện khi thêm ESLint 15/11/2026 |

## Đã xong

| Việc | Commit |
|---|---|
| Kho bị trừ nhiều lần khi PayOS return URL/webhook xử lý cùng một đơn | `85b1d69` |
| VNPay cho phép giả mạo thanh toán bằng khoá dự phòng ghi cứng — đã gỡ VNPay | `6457f05` |
| 1 critical + 6 high trong `npm audit --omit=dev`; gỡ `nodemailer` không dùng | `2082e23` |
| Script `scratch/` ghi cứng chuỗi kết nối DB/Redis | `46923f7` |
| 72 chỗ trả `err.message` lộ lỗi nội bộ; lỗi trùng danh mục lộ tên ràng buộc DB — xử lý lỗi tập trung (spec 001) | `cd8c24b` |
| Regex số điện thoại `[3 | `dea695a` |
| `adminController.updateOrderStatus` đọc trạng thái đơn NGOÀI transaction, không khoá, rồi trừ/hoàn kho theo trạng thái cũ và UPDATE vô điều kiện → admin xác nhận đúng lúc webhook PayOS xác nhận cùng đơn có thể trừ kho 2 lần (cùng họ lỗi đã sửa ở `confirmPaidOrder`) | `7a8c367` |
| B45 Checkout đọc mã giảm giá ngoài transaction, không khoá dòng → hai đơn đồng thời vượt `usage_limit`; cùng một người thì nhận lỗi chung "Dữ liệu này đã tồn tại." — sửa bằng `findByCode(..., client, { forUpdate: true })` + `checkUserUsed` trong transaction (`tests/coupon.race.test.js`) | `bd18363` |
| B46 Admin đổi trạng thái đơn cho phép mọi cặp (trừ kho 2 lần qua CONFIRMED → PENDING → CONFIRMED, đơn huỷ sống lại không trừ kho, huỷ được đơn đang giao) — thêm máy trạng thái `src/utils/orderStatus.js`: tiến từng bước, lùi một bước khi bấm nhầm (không về PENDING), chỉ huỷ khi chưa giao; gửi lại cùng trạng thái → 200 không làm gì (`tests/admin.order.status.test.js`) | `f4cc8be` frontend `3610309` |
| B42 + B47 (phần đơn hàng) Admin huỷ đơn đã thanh toán không chuyển payment sang `REFUND_PENDING` do logic huỷ bị chép ở controller. Gom vào `OrderService._cancelInTransaction` dùng chung cho khách và admin; `updateStatusByAdmin` chuyển từ controller sang service; khách huỷ giờ khoá dòng đơn trước khi đọc trạng thái (sửa đua với PayOS làm mất hàng trong kho) (`tests/order.cancel.test.js`) | `57132d1` |
| B48 Duyệt / huỷ hàng loạt gửi 1 request mỗi đơn → quá 30 đơn bị `writeLimiter` chặn giữa chừng. Thêm `POST /api/admin/orders/bulk-status` (≤ 100 đơn / request, 1 lượt đếm, mỗi đơn một transaction riêng, trả `succeeded` / `failed` kèm lý do); giao diện chia lô 100 và báo kết quả, giữ lại các đơn lỗi trong danh sách chọn (`tests/admin.order.bulk.test.js`) | `436a188` |
| B49 Giao diện không hiển thị `errorId` của lỗi 500 → interceptor axios nối "(Mã lỗi: 8 ký tự đầu)" vào `response.data.error`, mọi trang tự có (`src/utils/errorMessage.js`) | frontend `4ef6f8e` |
| B52 (OWASP A01) API công khai tin `?adminMode=true` / `?status=DRAFT` của client → khách vãng lai xem được sách, bài viết nháp và đã ẩn (cả danh sách, chi tiết theo id, danh sách chuyên mục). Sửa: `optionalVerifyToken` trên các route xem; chế độ nhân viên chỉ bật khi `req.user.role` là ADMIN/CURATOR (`staffAccess` trong `middleware/auth.js`); chi tiết sách kiểm trạng thái **sau** khi đọc cache; nhân viên có token hết hạn mà xin chế độ nhân viên → `401 TOKEN_EXPIRED` để giao diện tự gia hạn (`tests/public.visibility.test.js`) | `f7ab587` |
| B54 Frontend để sót thông tin giao hàng và mã giảm giá của tài khoản trước trong localStorage (đăng xuất chỉ xoá token/user) → người đăng nhập sau thấy địa chỉ, SĐT người trước ở trang thanh toán. Sửa: `src/utils/userStorage.js` — dữ liệu cá nhân gắn khoá theo user id; `clearPersonalData()` ở mọi đường đăng xuất; đăng nhập xoá dữ liệu tài khoản khác để lại (Vitest `userStorage.test.js`, `AuthContext.test.jsx`) | frontend `1d525c9` |
| B55 Email phân biệt chữ hoa/thường → `A@gmail.com` và `a@gmail.com` thành 2 tài khoản; đăng nhập / quên mật khẩu gõ khác kiểu chữ bị báo sai. Sửa: `User.create` lưu email chữ thường, `findByEmail` tìm bằng `LOWER(email)` (tài khoản cũ viết hoa vẫn tìm được, không sửa dữ liệu cũ), unique index `users_email_lower_key` trên `LOWER(email)` — migration chỉ ghi log nếu DB đã có email trùng khác kiểu chữ (`tests/auth.email-case.test.js`) | `cdd14a1` |
| B57 Đăng ký gọi `/auth/register` (đã cấp phiên) rồi gọi thêm `login()` → thừa 1 request + 1 lần bcrypt + 1 phiên (bị `login` thu hồi ngay); `register` trả user dạng dòng DB thô, khác `login`. Sửa: backend trả `publicUser` (`tests/auth.register.test.js`); frontend `AuthContext.register()` dùng thẳng response (`startSession` chung với `login`) | `5a750a8` + frontend `80cbde1` |
| B58 Nhãn form không gắn ô nhập, thiếu `autoComplete`. Sửa: `htmlFor`/`id` + `autoComplete` (name, email, current/new-password) ở Đăng ký, Đăng nhập, Quên / Đặt lại mật khẩu, Đổi mật khẩu | frontend `32ff3a8`, `80cbde1` |
| B59 Quy tắc mật khẩu chỉ báo sau khi gửi. Sửa: `utils/passwordRules.js` (một nguồn quy tắc), `PasswordRules` tick từng điều kiện khi gõ, `PasswordMismatch` báo ngay dưới ô xác nhận — ở Đăng ký, Đặt lại mật khẩu, Đổi mật khẩu | frontend `80cbde1` |
| B53 + B60 (phần code) Thiếu `JWT_SECRET` không bị phát hiện lúc khởi động (chạy rồi lỗi 500 khi đăng nhập); thiếu `RESEND_API_KEY` / `EMAIL_FROM` là gmail làm email hỏng âm thầm. Sửa: `src/config/env.js` gọi đầu `server.js` — thiếu `JWT_SECRET` thì dừng khởi động; `JWT_SECRET` < 32 ký tự, thiếu `RESEND_API_KEY`, `EMAIL_FROM` thuộc hộp thư công cộng thì cảnh báo `⚠️ [Config]`; không in giá trị bí mật (`tests/config.env.test.js`) | `9dfa9a6` |
| B62 Đặt lại mật khẩu thành công không xoá phiên đang có trên trình duyệt → về trang chủ với phiên cũ (vd Admin). Sửa: `ResetPasswordPage` gọi `logout()` khi đang có phiên; mã không hợp lệ / hết hạn thì nhắc dùng email mới nhất + liên kết "Yêu cầu email mới" (`ResetPasswordPage.test.jsx`) | frontend `061314d` |
| Spec 005 — Đăng nhập bằng Google (`specs/005-google-sign-in/`). Code review phát hiện và đã sửa: (1) race đăng nhập / đổi mật khẩu chạy bcrypt ngoài khoá ↔ liên kết Google → kẻ đăng ký trước giữ được phiên 7 ngày: cấp phiên / ghi mật khẩu trong `withUserLock` + đọc lại hash (`tests/auth.google.race.test.js`); (2) chỉ tự liên kết khi Google quản lý hộp thư — gmail / Workspace `hd` (FR-005a, `GOOGLE_LINK_NOT_ALLOWED`); thêm thời gian chờ 5 giây khi lấy khoá Google; dải "hoặc" chỉ hiện khi nút Google đã vẽ | `1375a75` + frontend `a650755` |
| B68 Login CSRF: `/auth/login`, `/auth/register` set cookie `sdl_rt` nhưng thiếu `requireAllowedOrigin` → trang lạ dùng `<form method=POST>` đăng nhập trình duyệt nạn nhân vào tài khoản kẻ xấu. Sửa: thêm `requireAllowedOrigin` (403 khi Origin lạ / thiếu); test trong `tests/auth.reuse.test.js` | `0c3789a` |
| `/auth/refresh` và `/auth/reset-password` chỉ có rate limit chung 300/15 phút — spec 004 | (commit spec 004) |
| Rate limit chung theo IP + 10 lượt gộp cho xác thực (người chung mạng bị phạt lây, đăng nhập đúng cũng bị đếm) — spec 004 | (commit spec 004) |
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
| Pool `pg` không có `pool.on('error')`: kết nối rảnh bị DB cắt (Neon tạm dừng khi vắng khách) làm sập cả server (phát hiện khi xét B69) | `0a01e4a` |
| B70 Bảng `inventory` thiếu `CHECK` → thêm `inventory_qty_check` (không âm, giữ chỗ ≤ tồn kho) | `0a01e4a` |
| B72 Deadlock khi khoá kho nhiều món (đặt hàng, huỷ đơn, admin xác nhận, job quá hạn, PayOS) → mọi luồng khoá theo `book_id` tăng dần (`src/utils/lockOrder.js`) | `e58c6d5` |
| B73 Test hai khách tranh cuốn cuối cùng đồng thời (bằng chứng cho "chống bán vượt"; bỏ `FOR UPDATE` thì đỏ) | `a7ced2e` |
| B74 Sách chưa có dòng kho tự tạo 10 cuốn ảo → mặc định 0 (chủ dự án chốt 20/11/2026), `Inventory.lockRow` | `c7e380e` |
