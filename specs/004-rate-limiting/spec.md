# Feature Specification: Giới hạn tần suất theo chức năng

**Feature Branch**: `004-rate-limiting` (làm trực tiếp trên `main`)

**Created**: 2026-11-12

**Status**: Draft

**Input**: User description: "Thay giới hạn tần suất chung (300 yêu cầu/15 phút/IP + 10 lượt gộp cho đăng nhập/đăng ký/quên mật khẩu) bằng giới hạn theo từng chức năng như các hệ thống doanh nghiệp: chặt cho xác thực, đếm theo người dùng khi đã đăng nhập, có giới hạn riêng cho đặt hàng/thanh toán/ghi dữ liệu." Liên quan backlog B35, B39.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Chặn dò mật khẩu mà không khoá người đăng nhập đúng (Priority: P1)

Kẻ dò mật khẩu bị chặn sau vài lần sai cho một tài khoản; người dùng đăng nhập đúng, đăng xuất, đăng
nhập lại nhiều lần không bị tính. Quên mật khẩu không bị dùng để gửi hàng loạt email tới một hộp thư.

**Why this priority**: Giới hạn hiện tại gộp đăng nhập đúng, đăng ký và quên mật khẩu vào 10 lượt chung
theo IP: người dùng thật dễ tự khoá mình, trong khi một hộp thư có thể bị gửi 10 email mỗi 15 phút.

**Independent Test**: 5 lần sai cho một email → lần 6 bị 429; đăng nhập đúng 15 lần liên tiếp → không bị
429; sai mật khẩu email A không ảnh hưởng email B; quên mật khẩu cho một email quá 3 lần/giờ → 429.

**Acceptance Scenarios**:

1. **Given** 5 lần đăng nhập sai cho email A trong 15 phút, **When** thử lần 6 (kể cả đúng mật khẩu),
   **Then** nhận 429 với thông báo tiếng Việt và thời gian chờ.
2. **Given** người dùng đăng nhập đúng nhiều lần, **When** đăng nhập lần thứ 15, **Then** vẫn thành công.
3. **Given** email A đã bị chặn, **When** đăng nhập email B từ cùng nơi, **Then** vẫn được thử.
4. **Given** đã yêu cầu quên mật khẩu 3 lần cho một email trong giờ qua, **When** yêu cầu lần 4,
   **Then** nhận 429.

---

### User Story 2 - Người dùng chung mạng không bị phạt lây (Priority: P1)

Khi đã đăng nhập, giới hạn chung được đếm theo từng tài khoản thay vì theo địa chỉ mạng; trang web tự
cập nhật thông báo mỗi 15 giây không làm người dùng mở vài thẻ bị chặn.

**Why this priority**: Hiện giới hạn chung theo IP (300/15 phút); riêng việc hỏi thông báo đã tốn 60 lượt
mỗi thẻ (B39). Văn phòng/ký túc xá dùng chung một IP sẽ bị chặn chung.

**Independent Test**: Hai tài khoản từ cùng một IP: tài khoản A dùng hết hạn mức, tài khoản B vẫn gọi
được. Một tài khoản gọi 400 lần trong 15 phút vẫn không bị chặn.

**Acceptance Scenarios**:

1. **Given** tài khoản A đã dùng hết hạn mức chung, **When** tài khoản B (cùng IP) gọi API, **Then** thành
   công.
2. **Given** khách chưa đăng nhập, **When** vượt hạn mức chung theo IP, **Then** nhận 429.

---

### User Story 3 - Chống spam các thao tác tốn tài nguyên (Priority: P2)

Đặt hàng, tạo liên kết thanh toán, tải ảnh, gửi đánh giá và các thao tác ghi của quản trị có giới hạn
riêng theo tài khoản, đủ rộng cho dùng thật nhưng chặn spam (vd tạo hàng loạt đơn để giữ hàng ảo).

**Independent Test**: Đặt 11 đơn trong 1 phút bằng một tài khoản → đơn thứ 11 nhận 429.

**Acceptance Scenarios**:

1. **Given** tài khoản đã đặt 10 đơn trong 1 phút, **When** đặt đơn thứ 11, **Then** nhận 429 và không
   tạo đơn, không giữ hàng.
2. **Given** gia hạn phiên quá 10 lần/15 phút cho một phiên, **Then** nhận 429.

### Edge Cases

- Phản hồi 429 giữ cấu trúc `{ error }` tiếng Việt và có header cho biết bao lâu thử lại.
- Thẻ truy cập hết hạn/giả: đếm theo IP như khách.
- Server khởi động lại: bộ đếm về 0 (chấp nhận, một instance — backlog B18).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Đăng nhập PHẢI giới hạn **số lần sai** theo cặp (nơi gửi, email): tối đa 5 / 15 phút; lần
  đăng nhập đúng KHÔNG bị đếm. Thêm giới hạn số lần sai theo nơi gửi (bất kể email): 20 / 15 phút.
- **FR-002**: Quên mật khẩu: tối đa 3 / giờ cho mỗi email và 10 / giờ cho mỗi nơi gửi.
- **FR-003**: Đăng ký: tối đa 5 / giờ cho mỗi nơi gửi. Đặt lại mật khẩu: 10 / 15 phút cho mỗi nơi gửi.
- **FR-004**: Gia hạn phiên: tối đa 10 / 15 phút cho mỗi phiên (theo cookie), hoặc theo nơi gửi khi không
  có cookie.
- **FR-005**: Giới hạn chung cho mọi API: 1000 / 15 phút, đếm theo tài khoản khi có thẻ truy cập hợp lệ,
  ngược lại theo nơi gửi.
- **FR-006**: Đặt hàng và tạo liên kết thanh toán: 10 / phút cho mỗi tài khoản.
- **FR-007**: Tải ảnh, gửi đánh giá, và mọi thao tác ghi của quản trị (sách, danh mục, bài viết, mã
  giảm giá, kho, người dùng, trạng thái đơn): 30 / phút cho mỗi tài khoản.
- **FR-008**: Phản hồi bị chặn PHẢI là 429 với `{ error }` tiếng Việt nói rõ thời gian chờ, kèm header
  chuẩn về hạn mức/thời gian thử lại.

### Key Entities

- **Bộ đếm hạn mức**: khoá (tài khoản / nơi gửi / email / phiên), số lượt, cửa sổ thời gian.

## Success Criteria *(mandatory)*

- **SC-001**: Kịch bản dò mật khẩu bị chặn ở lần sai thứ 6 cho một email; 0 trường hợp người đăng nhập
  đúng bị chặn trong kiểm thử.
- **SC-002**: Hai tài khoản chung IP không ảnh hưởng hạn mức của nhau.
- **SC-003**: 100% bộ test hiện có vẫn xanh.

## Assumptions

- Bộ đếm lưu trong bộ nhớ tiến trình (Render chạy 1 instance). Chuyển sang Redis khi chạy nhiều instance
  (backlog B18) — không làm lúc này vì gói miễn phí Upstash giới hạn số lệnh/tháng.
- Không thêm CAPTCHA trong đợt này.
- Giới hạn đọc dữ liệu đủ rộng để trang tự hỏi thông báo mỗi 15 giây không chạm ngưỡng.
