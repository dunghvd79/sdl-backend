# SDL Backend Constitution

Áp dụng cho repo `sdl-backend` (thư mục `sdl-project/`): REST API của Smart Digital Library /
Pigeon Bookstore. Các từ **PHẢI**, **KHÔNG ĐƯỢC**, **NÊN** mang nghĩa bắt buộc tương ứng
MUST / MUST NOT / SHOULD.

## Core Principles

### I. Toàn vẹn dữ liệu & giao dịch

- Mọi câu SQL **PHẢI** dùng tham số (`$1, $2...`). **KHÔNG ĐƯỢC** cộng chuỗi giá trị người dùng
  vào SQL. Phần động như `ORDER BY` chỉ được chọn từ danh sách giá trị cố định trong code.
- Luồng ghi nhiều bảng (đặt hàng, thanh toán, trừ/giữ kho, áp coupon) **PHẢI** chạy trong một
  transaction `BEGIN/COMMIT/ROLLBACK` trên cùng một client; client lấy bằng `pool.connect()`
  **PHẢI** được `release()` trong `finally`.
- Xử lý sự kiện từ bên ngoài (webhook, return URL của cổng thanh toán, job nền) **PHẢI**
  idempotent: gọi lại nhiều lần với cùng dữ liệu không được trừ kho, cộng tiền hay đổi trạng
  thái thêm lần nào. Chuyển trạng thái **PHẢI** kiểm tra trạng thái hiện tại
  (ví dụ chỉ `PENDING → CONFIRMED`).

Lý do: dữ liệu ở đây là tiền và hàng tồn kho thật; lỗi trừ kho nhiều lần đã từng tồn tại vì
thiếu kiểm tra idempotency.

### II. Bảo mật theo mặc định

- Endpoint không công khai **PHẢI** đi qua `verifyToken`; endpoint quản trị **PHẢI** thêm
  `requireRole([...])`. Truy cập tài nguyên của người dùng **PHẢI** kiểm tra quyền sở hữu
  (`user_id`) hoặc vai trò nhân viên.
- Dữ liệu vào từ `body`, `params`, `query` **PHẢI** được kiểm tra bằng schema tại biên
  (route/controller) trước khi tới service. ID mã hoá (hashids) **PHẢI** được giải mã và kiểm
  tra hợp lệ trước khi dùng trong SQL.
- Lỗi trả về client **KHÔNG ĐƯỢC** lộ chi tiết nội bộ (thông báo lỗi DB, stack trace, tên bảng,
  đường dẫn). Lỗi không lường trước **PHẢI** đi qua bộ xử lý lỗi tập trung, trả thông báo chung
  và chỉ ghi chi tiết vào log.
- Endpoint công khai nhận dữ liệu từ bên thứ ba (webhook) **PHẢI** xác thực chữ ký trước khi
  thay đổi dữ liệu.
- Bí mật (mật khẩu DB/Redis, `JWT_SECRET`, khoá PayOS, Resend) **KHÔNG ĐƯỢC** xuất hiện trong
  code, tài liệu, test hay log được commit; chỉ đọc từ biến môi trường.
- Phụ thuộc có lỗ hổng mức high/critical theo `npm audit --omit=dev` **PHẢI** được xử lý hoặc
  ghi lý do chấp nhận rủi ro trước khi phát hành.

Lý do: backend phục vụ thanh toán thật và dữ liệu cá nhân khách hàng trên Internet công khai.

### III. Test-First (KHÔNG THƯƠNG LƯỢNG)

- Mọi sửa lỗi và thay đổi hành vi **PHẢI** đi theo TDD: viết test, chạy và **thấy test đỏ vì
  đúng lý do**, rồi mới viết code cho test xanh (skill `test-driven-development`).
- Test API dùng Jest + Supertest gọi vào `app` thật; test **PHẢI** chạy trên DB test riêng
  (`sdl_test`), **KHÔNG ĐƯỢC** trỏ vào DB local đang phát triển hay DB production.
- Mock chỉ dùng cho dịch vụ bên ngoài không thể gọi trong test (PayOS, Resend, AI Service).
  **KHÔNG ĐƯỢC** mock chính phần code đang được kiểm thử.
- Không được tuyên bố "xong", "đã sửa", "test pass" nếu chưa chạy toàn bộ bộ test trong lượt đó
  và đọc kết quả (skill `verification-before-completion`).

Lý do: dự án từng không có test tự động; các thay đổi lớn (error handler, validation) chạm hàng
chục file và chỉ an toàn khi có lưới test.

### IV. Đơn giản & thay đổi tối thiểu

- Mỗi thay đổi chỉ chạm phần cần thiết cho yêu cầu; **KHÔNG ĐƯỢC** dọn dẹp hay refactor code lân
  cận không liên quan trong cùng thay đổi.
- Chọn giải pháp đơn giản nhất đáp ứng yêu cầu; **KHÔNG ĐƯỢC** thêm abstraction, tuỳ chọn cấu
  hình hay lớp kiến trúc "để dành cho sau".
- Giữ kiến trúc hiện có `routes → controllers → services → models`; logic nghiệp vụ và
  transaction nằm ở service, SQL nằm ở model.
- Khi chưa rõ yêu cầu, **PHẢI** hỏi lại thay vì tự giả định.

Lý do: theo Andrej Karpathy Guidelines mà dự án đã chọn (Think Before Coding, Simplicity First,
Surgical Changes, Goal-Driven Execution).

### V. Tương thích & an toàn Production

- Hợp đồng API với frontend **PHẢI** được giữ: dạng phản hồi `{ data, message }` / `{ error }`,
  trường `hashId`, mã HTTP hiện có. Thay đổi phá vỡ tương thích **PHẢI** được nêu trong spec và
  cập nhật frontend cùng đợt.
- Thông báo hiển thị cho người dùng **PHẢI** viết bằng tiếng Việt.
- Thay đổi schema DB **PHẢI** idempotent (`IF NOT EXISTS`) và **KHÔNG ĐƯỢC** xoá hay làm mất dữ
  liệu hiện có, vì migration tự chạy trên production mỗi lần deploy.
- Phụ thuộc ngoài không thiết yếu (Redis, AI Service, email) khi lỗi **PHẢI** làm giảm tính năng
  chứ **KHÔNG ĐƯỢC** làm sập tiến trình hay chặn khởi động.

Lý do: push lên `main` tự deploy lên Render; production đã từng chết vì DB/Redis biến mất và vì
`REDIS_URL` sai định dạng làm app thoát khi khởi động.

## Ràng buộc kỹ thuật & bảo mật

- Runtime: Node.js 20, CommonJS, Express 5. Truy cập DB bằng `pg` với raw SQL, **không dùng
  ORM**.
- Validation đầu vào: **Zod** (dùng chung được với frontend React sau này).
- Test: Jest + Supertest; DB test là Postgres riêng trong Docker.
- Bảo vệ HTTP đang có và **PHẢI** giữ: `helmet`, `express-rate-limit`, lọc XSS cho `req.body`,
  `trust proxy` cho Render. CORS **NÊN** giới hạn về domain frontend thay vì mở cho mọi origin.
- Hạ tầng production: Render (backend), Neon (PostgreSQL), Upstash (Redis, bắt buộc
  `rediss://`), Cloudflare Pages (frontend). Hướng dẫn vận hành: `database/README.md`.
- Thêm thư viện mới **PHẢI** có lý do rõ ràng trong plan; ưu tiên dùng cái sẵn có.

## Quy trình phát triển & cổng chất lượng

- Thay đổi chạm nhiều file hoặc nhiều module đi theo Spec Kit:
  `/speckit-specify` → `/speckit-clarify` → `/speckit-plan` → `/speckit-tasks` →
  `/speckit-analyze` → `/speckit-implement`. Sửa một lỗi cụ thể có thể làm TDD trực tiếp.
- Lỗi và hành vi bất thường **PHẢI** được truy nguyên nhân gốc trước khi sửa (skill
  `systematic-debugging`).
- Cổng trước khi commit/push lên `main`, tất cả **PHẢI** đạt:
  1. `npm test` xanh toàn bộ, đã chạy trong lượt hiện tại.
  2. `node --check` sạch cho các file đã sửa.
  3. Diff không chứa bí mật.
  4. Thay đổi lớn đã qua code review (skill `requesting-code-review`).
- Sau khi hoàn thành, cập nhật mục "Đã hoàn thành" và "Nhật ký thay đổi" trong
  `../PROJECT_CONTEXT.local.md`.

## Governance

- Constitution này có hiệu lực cao nhất đối với repo backend. Khi `.cursorrules`, `CLAUDE.md`
  hay tài liệu khác mâu thuẫn với nó, constitution được ưu tiên và tài liệu kia cần được sửa lại.
- Mỗi plan (`/speckit-plan`) **PHẢI** có mục Constitution Check đối chiếu với từng nguyên tắc;
  vi phạm nào cũng phải được nêu rõ kèm lý do và được chủ dự án chấp thuận.
- Sửa đổi constitution: đề xuất thay đổi → chủ dự án duyệt → cập nhật file này kèm Sync Impact
  Report → commit riêng.
- Phiên bản theo semantic versioning: MAJOR khi bỏ hoặc định nghĩa lại nguyên tắc; MINOR khi
  thêm nguyên tắc/mục hoặc mở rộng đáng kể; PATCH khi sửa câu chữ.
- Hướng dẫn vận hành hằng ngày cho AI agent nằm trong `CLAUDE.md`.

**Version**: 1.0.0 | **Ratified**: 2026-11-11 | **Last Amended**: 2026-11-11
