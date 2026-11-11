# Research: Xử lý lỗi tập trung cho API

Tất cả kết luận dưới đây được rút ra bằng cách đọc code hiện có (`src/`) ngày 2026-11-11.

## R1. Cách chuyển lỗi về một nơi xử lý trong Express 5

- **Decision**: Controller gọi `next(err)` trong khối `catch` thay cho `res.status(...).json({ error: err.message })`.
  Một middleware lỗi duy nhất (đặt cuối `app.js`) quyết định mã trạng thái và nội dung phản hồi.
- **Rationale**: Express 5 tự chuyển promise bị reject của handler async sang middleware lỗi, nhưng
  mọi controller hiện có đều tự `try/catch`. Đổi dòng trả lỗi thành `next(err)` là thay đổi nhỏ nhất,
  giữ nguyên các nhánh `return res.status(400).json({ error: '...' })` kiểm tra đầu vào đã viết sẵn
  (các nhánh này không lộ lỗi nội bộ nên không cần đụng tới).
- **Alternatives considered**: Bỏ hẳn `try/catch` để Express 5 tự bắt — diff lớn hơn và đổi luồng ở
  những controller có xử lý riêng trong `catch`; viết hàm tiện ích `sendError(res, err)` gọi ở từng
  controller — vẫn phân tán, trái FR-008.

## R2. Phân biệt lỗi nghiệp vụ với lỗi hệ thống

- **Decision**: Thêm lớp `AppError extends Error` mang `statusCode`. Chỉ `AppError` được hiển thị
  nguyên văn; mọi lỗi khác là lỗi hệ thống.
- **Rationale**: 42 câu `throw new Error(...)` trong service/model hiện không phân biệt được với lỗi
  DB. Đánh dấu tại nơi ném là cách duy nhất biết chắc lỗi nào được thiết kế để người dùng đọc.
- **Alternatives considered**: Danh sách trắng theo nội dung thông báo — dễ vỡ khi đổi câu chữ;
  coi mọi lỗi có chữ tiếng Việt là nghiệp vụ — không kiểm chứng được.

## R3. Mã trạng thái cho từng lỗi nghiệp vụ (giữ nguyên hành vi, FR-002)

Mã trạng thái hiện do `catch` của controller quyết định, không do nơi ném. Ánh xạ đo được:

| Nơi ném (service/model) | Controller bắt | Mã hiện tại → mã `AppError` |
|---|---|---|
| `authService.register` | `auth.register` | 400 |
| `authService.login` (2 thông báo) | `auth.login` | 401 |
| `authService.forgotPassword`, `resetPassword` | `auth.*` | 400 |
| `cartService.*` (9 câu) | `cart.add/addBatch/remove/prepareCheckout/removeBulk` | 400 |
| `orderService.checkout/cancelOrder/changeToCod` (16 câu) | `order.*` | 400 |
| `Inventory.checkAvailability`, `Inventory.hold` | qua giỏ hàng / đặt hàng | 400 |
| `paymentService.processPayOSWebhook` (chữ ký sai, không tìm thấy giao dịch) | `payment.payosWebhook` | 400 |
| `aiService.askQuestion` ("Hệ thống AI đang bận...") | `ai.ask` | 500, giữ thông báo |

Các câu ném **là lỗi hệ thống** (cấu hình, dịch vụ ngoài) và sẽ chuyển sang thông báo chung:
`getPayOS` thiếu cấu hình, `createPayOSPaymentLink` mã đơn không hợp lệ, `verifyAndProcessPayOSPayment`
không lấy được link, `emailService` thiếu khoá/lỗi Resend.

- **Thay đổi có chủ đích so với hiện tại**:
  - `forgotPassword` khi email gửi thất bại do cấu hình: 400 kèm "Hệ thống chưa được cấu hình khóa gửi
    email!" → 500 chung. Đây là sự cố hệ thống, không phải lỗi người dùng.
  - `aiService.uploadBookPDF` / `resetBookRAG`: bỏ phần chi tiết từ AI Service nối vào thông báo (chỉ
    ghi log), giữ câu chính và mã 500.

## R4. Lỗi ràng buộc dữ liệu của PostgreSQL

- **Decision**: Middleware lỗi ánh xạ mã `23505` (vi phạm UNIQUE) sang 400 "Dữ liệu này đã tồn tại."
  Các mã PostgreSQL khác là lỗi hệ thống.
- **Rationale**: `category.createCategory/updateCategory` hiện trả 400 kèm nguyên văn
  `duplicate key value violates unique constraint "categories_name_key"` — lộ tên ràng buộc. Giữ mã
  400 nhưng thay bằng câu tiếng Việt chung. `couponController` đã tự bắt `23505` với thông báo riêng;
  giữ nguyên.
- **Hệ quả phụ**: `review.createReview` trùng đánh giá (`23505`) đổi từ 500 sang 400 — đúng ngữ nghĩa
  hơn, giao diện vẫn đọc `error` như cũ.

## R5. Mã tham chiếu và nhật ký

- **Decision**: Mỗi lỗi hệ thống sinh `errorId = crypto.randomUUID()`; phản hồi
  `{ error: '<thông báo chung>', errorId }`; ghi một dòng `console.error` có `errorId`, phương thức,
  đường dẫn, thông báo gốc, kèm stack.
- **Rationale**: Render thu stdout/stderr vào trang Logs có ô tìm kiếm; tìm theo UUID cho đúng một kết
  quả (SC-003). `crypto.randomUUID` có sẵn trong Node 20, không thêm thư viện.
- **Alternatives considered**: Thư viện log (pino/winston) — thêm phụ thuộc, chưa cần (nguyên tắc IV).

## R6. JSON hỏng và đường dẫn không tồn tại

- **Decision**: Lỗi của `body-parser` có `err.type === 'entity.parse.failed'` → 400 "Dữ liệu gửi lên
  không đúng định dạng JSON." Thêm `app.use('/api', ...)` sau mọi route để trả 404 JSON.
- **Rationale**: Hiện JSON hỏng rơi xuống handler chung trả 500; đường dẫn sai trả trang HTML mặc
  định "Cannot GET".

## R7. Cách gây lỗi hệ thống trong test

- **Decision**: Dùng `jest.spyOn(...).mockRejectedValueOnce(new Error('relation "x" does not exist'))`
  trên hàm model/`pool.query` để mô phỏng DB hỏng, và đường dẫn thật cho lỗi nghiệp vụ.
- **Rationale**: Constitution cho phép mock phụ thuộc không thể gây lỗi thật trong test; thứ được kiểm
  thử ở đây là middleware lỗi, không phải model bị mock.

## R8. Những chỗ giữ nguyên cách phản hồi

- `payosReturn` / `payosCancel`: luôn chuyển hướng về trang kết quả — không đổi.
- `upload.js` có middleware lỗi riêng cho multer — không đổi.
- `payosWebhook` phản hồi cho máy chủ PayOS: giữ mã 400 cho `AppError`, lỗi khác trả 500 chung.
- Tác vụ nền (`checkAndCancelExpiredOrders`, email worker) chỉ ghi log — không đổi.
