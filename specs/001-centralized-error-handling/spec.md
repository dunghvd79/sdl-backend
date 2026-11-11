# Feature Specification: Xử lý lỗi tập trung cho API

**Feature Branch**: `001-centralized-error-handling` (làm trực tiếp trên `main`, theo quy trình của dự án)

**Created**: 2026-11-11

**Status**: Draft

**Input**: User description: "Bước 4 của lộ trình nâng cấp bảo mật backend: error handler tập trung. API hiện trả nguyên văn thông báo lỗi nội bộ cho client ở 72 chỗ (56 chỗ mã 500, 15 chỗ mã 400, 1 chỗ mã 401). Cần phân biệt lỗi nghiệp vụ được phép hiển thị với lỗi hệ thống phải che đi, và xử lý mọi lỗi ở một nơi."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Không lộ chi tiết nội bộ khi hệ thống gặp sự cố (Priority: P1)

Khi có sự cố ngoài dự kiến (mất kết nối cơ sở dữ liệu, lỗi truy vấn, lỗi lập trình, dịch vụ ngoài
không phản hồi), người dùng và kẻ tấn công chỉ nhận được một thông báo chung bằng tiếng Việt kèm
mã tham chiếu. Toàn bộ chi tiết kỹ thuật chỉ được ghi vào nhật ký máy chủ, gắn với cùng mã tham
chiếu đó để đội vận hành tra cứu.

**Why this priority**: Đây là lỗ hổng bảo mật đang tồn tại. Thông báo lỗi nội bộ để lộ tên bảng,
tên cột, cấu trúc truy vấn, giúp kẻ tấn công dò hệ thống.

**Independent Test**: Gây lỗi hệ thống có chủ đích trên một API bất kỳ, kiểm tra phản hồi chỉ chứa
thông báo chung và mã tham chiếu, đồng thời nhật ký máy chủ có đủ chi tiết với đúng mã tham chiếu.

**Acceptance Scenarios**:

1. **Given** cơ sở dữ liệu báo lỗi khi xử lý yêu cầu xem danh sách đơn hàng, **When** khách gọi API,
   **Then** khách nhận mã 500 với thông báo chung tiếng Việt và mã tham chiếu, không có bất kỳ chuỗi
   nào từ thông báo lỗi gốc.
2. **Given** cùng sự cố trên, **When** quản trị viên xem nhật ký máy chủ, **Then** tìm được chi tiết
   lỗi gốc bằng mã tham chiếu mà khách nhận được.
3. **Given** một lỗi hệ thống xảy ra trên luồng mà trước đây trả mã 400 (ví dụ thêm vào giỏ hàng),
   **When** khách gọi API, **Then** khách nhận mã 500 với thông báo chung, không nhận thông báo lỗi gốc.

---

### User Story 2 - Thông báo lỗi nghiệp vụ giữ nguyên như hiện tại (Priority: P1)

Các lỗi nghiệp vụ mà người dùng cần biết để tự xử lý (giỏ hàng trống, sai mật khẩu, email đã đăng
ký, kho không đủ hàng, mã giảm giá hết hạn, không có quyền...) vẫn hiển thị đúng nội dung tiếng Việt
và đúng mã trạng thái như hiện nay. Giao diện web không cần sửa gì.

**Why this priority**: Giao diện hiển thị trực tiếp nội dung lỗi từ API ở 60 vị trí. Nếu nội dung
hoặc mã trạng thái đổi, người dùng sẽ thấy thông báo sai hoặc thông báo chung vô nghĩa ở những chỗ
trước đây hiển thị rõ ràng.

**Independent Test**: Chạy các kịch bản lỗi nghiệp vụ tiêu biểu (đăng nhập sai, giỏ hàng trống, kho
không đủ, đặt hàng thiếu thông tin) trước và sau thay đổi; nội dung và mã trạng thái phải giống hệt.

**Acceptance Scenarios**:

1. **Given** khách đăng nhập sai mật khẩu, **When** gửi yêu cầu đăng nhập, **Then** nhận mã 401 với
   thông báo "Email hoặc mật khẩu không chính xác!" như hiện tại.
2. **Given** giỏ hàng trống, **When** khách đặt hàng, **Then** nhận mã 400 với thông báo
   "Giỏ hàng trống, không thể thanh toán!" như hiện tại.
3. **Given** kho chỉ còn 1 cuốn, **When** khách đặt 3 cuốn, **Then** nhận mã 400 với thông báo cho
   biết số lượng còn lại như hiện tại.

---

### User Story 3 - Yêu cầu sai định dạng và đường dẫn không tồn tại nhận phản hồi rõ ràng (Priority: P2)

Yêu cầu có nội dung JSON hỏng hoặc gọi tới đường dẫn API không tồn tại nhận phản hồi JSON tiếng Việt
với mã trạng thái đúng nghĩa, thay vì trang lỗi HTML mặc định hoặc mã 500.

**Why this priority**: Hiện yêu cầu JSON hỏng bị trả mã 500 (coi là sự cố hệ thống) và đường dẫn sai
trả trang HTML, làm giao diện và công cụ giám sát hiểu sai. Ảnh hưởng thấp hơn hai câu chuyện trên.

**Independent Test**: Gửi nội dung JSON hỏng và gọi một đường dẫn API không tồn tại, kiểm tra mã
trạng thái và nội dung phản hồi.

**Acceptance Scenarios**:

1. **Given** yêu cầu có nội dung JSON sai cú pháp, **When** gửi tới bất kỳ API nào, **Then** nhận mã
   400 với thông báo tiếng Việt rằng dữ liệu gửi lên không hợp lệ.
2. **Given** đường dẫn bắt đầu bằng `/api/` không tồn tại, **When** gọi tới, **Then** nhận mã 404 với
   phản hồi JSON tiếng Việt.

---

### Edge Cases

- Lỗi xảy ra sau khi phản hồi đã bắt đầu gửi đi: không được gửi phản hồi lần hai hay làm sập tiến trình.
- Lỗi từ thư viện tải tệp (tệp quá lớn, sai định dạng): giữ nguyên thông báo tiếng Việt và mã 400
  như hiện tại.
- Lỗi phát sinh trong các luồng chuyển hướng của cổng thanh toán (return URL): vẫn chuyển hướng tới
  trang kết quả thất bại như hiện tại, không trả JSON.
- Lỗi nghiệp vụ ném ra từ sâu bên trong giao dịch cơ sở dữ liệu: giao dịch vẫn được huỷ đúng cách và
  khách vẫn nhận đúng thông báo nghiệp vụ.
- Lỗi xảy ra trong tác vụ nền (huỷ đơn quá hạn, gửi email): chỉ ghi nhật ký, không ảnh hưởng tới phản
  hồi của yêu cầu đang xử lý.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Hệ thống PHẢI phân loại mọi lỗi thành hai nhóm: lỗi nghiệp vụ (được thiết kế để hiển thị
  cho người dùng, kèm mã trạng thái xác định) và lỗi hệ thống (mọi lỗi còn lại).
- **FR-002**: Với lỗi nghiệp vụ, hệ thống PHẢI trả đúng mã trạng thái và nội dung thông báo tiếng Việt
  đang được trả hiện nay cho cùng tình huống.
- **FR-003**: Với lỗi hệ thống, hệ thống PHẢI trả mã 500 kèm một thông báo chung tiếng Việt và một mã
  tham chiếu duy nhất cho mỗi lần lỗi; phản hồi KHÔNG ĐƯỢC chứa thông báo lỗi gốc, dấu vết ngăn xếp,
  tên bảng/cột hay đường dẫn tệp.
- **FR-004**: Với lỗi hệ thống, hệ thống PHẢI ghi vào nhật ký máy chủ: mã tham chiếu, phương thức và
  đường dẫn yêu cầu, thông báo lỗi gốc và dấu vết ngăn xếp.
- **FR-005**: Mọi phản hồi lỗi dạng JSON PHẢI giữ cấu trúc hiện có: thông báo nằm ở trường `error`.
  Mã tham chiếu (nếu có) nằm ở một trường riêng, không trộn vào nội dung `error`.
- **FR-006**: Yêu cầu có nội dung JSON sai cú pháp PHẢI nhận mã 400 với thông báo tiếng Việt.
- **FR-007**: Đường dẫn `/api/...` không tồn tại PHẢI nhận mã 404 với phản hồi JSON tiếng Việt.
- **FR-008**: Việc xử lý và định dạng lỗi PHẢI diễn ra ở một nơi duy nhất; các điểm xử lý yêu cầu
  không tự định dạng phản hồi cho lỗi hệ thống.
- **FR-009**: Các luồng chuyển hướng của cổng thanh toán và các tác vụ nền PHẢI giữ nguyên cách phản
  hồi hiện tại (chuyển hướng / chỉ ghi nhật ký).
- **FR-010**: Môi trường phát triển cục bộ ĐƯỢC PHÉP kèm chi tiết lỗi gốc trong phản hồi để gỡ lỗi;
  môi trường production và môi trường kiểm thử KHÔNG ĐƯỢC.

### Key Entities

- **Lỗi nghiệp vụ**: tình huống người dùng gây ra hoặc tự khắc phục được; có mã trạng thái và thông
  báo tiếng Việt cố định.
- **Lỗi hệ thống**: mọi sự cố ngoài dự kiến; người dùng chỉ thấy thông báo chung và mã tham chiếu.
- **Mã tham chiếu lỗi**: chuỗi định danh duy nhất cho một lần xảy ra lỗi hệ thống, xuất hiện ở cả
  phản hồi và nhật ký.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 0 trên 72 vị trí hiện đang trả thông báo lỗi gốc còn có thể làm lộ thông báo lỗi hệ
  thống ra ngoài.
- **SC-002**: 100% kịch bản lỗi nghiệp vụ được kiểm thử cho kết quả (mã trạng thái + nội dung) giống
  hệt trước khi thay đổi.
- **SC-003**: Với mọi lỗi hệ thống, đội vận hành tìm được chi tiết gốc trong nhật ký chỉ bằng mã tham
  chiếu khách cung cấp, trong một lần tìm kiếm.
- **SC-004**: Không cần sửa bất kỳ dòng nào ở giao diện web để các thông báo lỗi hiện có tiếp tục hiển
  thị đúng.

## Assumptions

- Thông báo chung cho lỗi hệ thống: "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau." (có thể chỉnh câu
  chữ khi lập kế hoạch).
- Giữ nguyên mã trạng thái hiện tại kể cả khi chưa đúng ngữ nghĩa (ví dụ "Email này đã được đăng ký"
  đang trả 400 thay vì 409) để không phải sửa giao diện; chuẩn hoá mã trạng thái là việc riêng.
- Bộ kiểm tra dữ liệu đầu vào theo lược đồ (bước 6 của lộ trình) sẽ dùng chính cơ chế lỗi nghiệp vụ
  này; tính năng này không bao gồm việc viết lược đồ kiểm tra.
- Nhật ký máy chủ là đầu ra tiêu chuẩn của tiến trình, xem được qua trang Logs của Render; không
  thêm dịch vụ giám sát bên ngoài.
- Các tệp kiểm thử thủ công cũ (`src/utils/test_*.js`) nằm ngoài phạm vi.
