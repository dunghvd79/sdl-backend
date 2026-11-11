# Feature Specification: Kiểm tra dữ liệu đầu vào theo lược đồ

**Feature Branch**: `003-input-validation` (làm trực tiếp trên `main`)

**Created**: 2026-11-12

**Status**: Draft

**Input**: User description: "Bước 6 của lộ trình nâng cấp bảo mật: validation bằng Zod (backlog B7). Hầu hết API mới chỉ kiểm tra thiếu trường; chưa kiểm tra kiểu, độ dài, khoảng giá trị, giá trị liệt kê. Dữ liệu sai rơi xuống cơ sở dữ liệu thành lỗi hệ thống 500 hoặc được lưu vào (số lượng âm, giá âm...)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Dữ liệu sai bị từ chối rõ ràng trước khi chạm tới dữ liệu (Priority: P1)

Khi người dùng hoặc công cụ gửi dữ liệu sai kiểu, quá dài, ngoài khoảng hoặc ngoài danh sách cho phép,
hệ thống từ chối ngay với mã 400 và câu tiếng Việt nêu trường nào sai, thay vì báo "lỗi hệ thống" hoặc
lưu dữ liệu vô nghĩa.

**Why this priority**: Đây là lỗ hổng đang có: số lượng âm trong giỏ, giá sách âm, mã giảm giá 150%,
chuỗi quá dài làm hỏng truy vấn (500).

**Independent Test**: Gửi các giá trị sai tiêu biểu tới giỏ hàng, đặt hàng, quản lý sách, mã giảm giá, kho,
đánh giá; kiểm tra 400 với thông báo đúng trường và dữ liệu không đổi.

**Acceptance Scenarios**:

1. **Given** khách đã đăng nhập, **When** thêm vào giỏ số lượng 0, âm, quá 99 hoặc không phải số,
   **Then** nhận 400 và giỏ không đổi.
2. **Given** quản trị viên, **When** tạo sách với giá âm, tiêu đề quá 255 ký tự hoặc trạng thái lạ,
   **Then** nhận 400 và sách không được tạo.
3. **Given** quản trị viên, **When** tạo mã giảm giá phần trăm lớn hơn 100, ngày kết thúc trước ngày bắt
   đầu hoặc giới hạn lượt dùng nhỏ hơn 1, **Then** nhận 400.
4. **Given** bất kỳ ai, **When** gửi email/mật khẩu không phải chuỗi khi đăng nhập, **Then** nhận 400
   (không phải 500).
5. **Given** bất kỳ ai, **When** xin danh sách sách với `limit` lớn hơn 500 hoặc âm, **Then** nhận 400.

---

### User Story 2 - Không làm hỏng luồng đang dùng (Priority: P1)

Mọi thao tác giao diện hiện có (thêm giỏ, đặt hàng, quản trị sách/mã giảm giá/bài viết/kho, đánh giá,
hồ sơ) vẫn chạy như cũ; các thông báo lỗi đang hiển thị giữ nguyên câu chữ.

**Why this priority**: Giao diện gửi thêm trường thừa, số dạng chuỗi, ngày dạng `YYYY-MM-DDTHH:mm`,
`limit` tới 500; kiểm tra quá chặt sẽ chặn nhầm thao tác hợp lệ.

**Independent Test**: Toàn bộ bộ test hiện có xanh; các payload thực tế của giao diện (bảng R2 trong
research) được chấp nhận.

**Acceptance Scenarios**:

1. **Given** payload sửa sách đúng như giao diện quản trị gửi (có trường thừa, `display_order` là chuỗi),
   **When** gửi, **Then** thành công như trước.
2. **Given** các tình huống thiếu trường đã có thông báo riêng (vd "Họ tên người nhận không được để
   trống"), **When** gửi thiếu, **Then** vẫn nhận đúng câu đó.

### Edge Cases

- Trường không bắt buộc gửi `null` hoặc chuỗi rỗng: được chấp nhận như hiện nay.
- Mã sách dạng mã hoá (hashId) hoặc số: đều được chấp nhận ở các trường `bookId`.
- Nhiều trường cùng sai: báo trường sai đầu tiên.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Mọi API nhận dữ liệu ghi PHẢI kiểm tra kiểu, độ dài tối đa (không vượt giới hạn lưu trữ),
  khoảng giá trị và giá trị liệt kê của từng trường trước khi xử lý.
- **FR-002**: Dữ liệu sai PHẢI bị từ chối với mã 400 và thông báo tiếng Việt nêu tên trường bằng ngôn
  ngữ người dùng; không ghi gì vào cơ sở dữ liệu.
- **FR-003**: Các tham số danh sách (`limit`, `page`, `offset`, `sortBy`, từ khoá tìm kiếm) PHẢI có giới
  hạn; `limit` tối đa 500.
- **FR-004**: Trường thừa trong yêu cầu PHẢI được bỏ qua (không gây lỗi).
- **FR-005**: Các thông báo lỗi hiện có cho trường hợp thiếu trường PHẢI giữ nguyên.
- **FR-006**: Quy tắc kiểm tra PHẢI được khai báo ở một nơi theo từng nhóm chức năng và áp dụng tại
  biên (trước khi vào xử lý nghiệp vụ).

### Key Entities

- **Lược đồ kiểm tra**: mô tả các trường của một yêu cầu, kiểu, giới hạn, thông báo lỗi.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 0 trường hợp dữ liệu sai kiểu/quá dài/ngoài khoảng trong các kịch bản kiểm thử dẫn tới lỗi
  hệ thống 500 hoặc dữ liệu được lưu.
- **SC-002**: 100% bộ test hiện có vẫn xanh; không cần sửa giao diện.
- **SC-003**: Mọi API ghi dữ liệu trong danh sách phạm vi (plan.md) có lược đồ kiểm tra.

## Assumptions

- Giới hạn độ dài lấy theo cột cơ sở dữ liệu (vd tên danh mục 100, tiêu đề sách 255, mã giảm giá 50);
  cột `text` dùng giới hạn hợp lý (mô tả sách 10.000, nội dung bài viết 100.000, nhận xét 2.000).
- Số lượng một món trong giỏ: 1–99 (một đơn sách lẻ). Giá sách: 0–100.000.000 đ.
- Kiểm tra thiếu trường có sẵn trong controller được giữ (để giữ câu thông báo); lược đồ bổ sung phần còn
  thiếu. Gom hẳn vào lược đồ là việc dọn dẹp sau (backlog).
- Thư viện: Zod (đã chốt trong constitution).
- API AI (đang ngừng) và tải tệp (multer) nằm ngoài phạm vi.
