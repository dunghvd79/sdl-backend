# Feature Specification: Đăng nhập bằng access token và refresh token

**Feature Branch**: `002-access-refresh-tokens` (làm trực tiếp trên `main`, theo quy trình của dự án)

**Created**: 2026-11-11

**Status**: Draft

**Input**: User description: "Bước 5 của lộ trình nâng cấp bảo mật: thay cơ chế JWT 24 giờ + một phiên duy nhất bằng access token ngắn hạn và refresh token. Refresh token gửi bằng cookie httpOnly, cho phép đăng nhập nhiều thiết bị, có 'đăng xuất mọi nơi'. Gộp các lỗi xác thực trong backlog B1–B6: đặt lại mật khẩu không thu hồi phiên cũ, dò được email qua quên mật khẩu, token đặt lại mật khẩu lưu nguyên văn, chính sách mật khẩu yếu, CORS mở cho mọi nơi."

## Clarifications

### Session 2026-11-11

- Q: Khoá tài khoản / đổi quyền có cần hiệu lực ngay? → A: Chấp nhận trễ đến khi access token hết hạn.
- Q: Giao diện giữ access token ở đâu? → A: Bộ nhớ lưu trữ của trình duyệt (giữ đăng nhập khi tải lại trang).
- Q: Phiên đăng nhập sống bao lâu nếu không quay lại? → A: 7 ngày, tự gia hạn mỗi lần dùng.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Đăng nhập trên nhiều thiết bị và luôn được giữ đăng nhập (Priority: P1)

Khách đăng nhập trên điện thoại và máy tính cùng lúc mà không bị thiết bị kia đá ra. Khi đang dùng,
phiên được tự gia hạn trong nền, khách không bị đăng xuất giữa chừng khi đang thanh toán. Nếu khách
không quay lại trong 7 ngày, phiên hết hạn và phải đăng nhập lại.

**Why this priority**: Đây là thay đổi chính người dùng nhìn thấy. Cơ chế hiện tại đá thiết bị cũ ra
mỗi lần đăng nhập nơi khác và buộc đăng nhập lại sau 24 giờ dù đang dùng.

**Independent Test**: Đăng nhập trên hai thiết bị, dùng cả hai; để thời hạn ngắn hết, gọi tiếp API và
kiểm tra phiên được gia hạn tự động mà không phải nhập lại mật khẩu.

**Acceptance Scenarios**:

1. **Given** khách đã đăng nhập trên thiết bị A, **When** đăng nhập thêm trên thiết bị B, **Then** cả
   hai thiết bị vẫn dùng được.
2. **Given** thẻ truy cập ngắn hạn của khách đã hết hạn nhưng phiên còn hạn, **When** giao diện gọi API,
   **Then** giao diện tự lấy thẻ mới và yêu cầu ban đầu thành công, khách không thấy gì bất thường.
3. **Given** khách không mở web trong hơn 7 ngày, **When** quay lại, **Then** khách phải đăng nhập lại.
4. **Given** khách tải lại trang hoặc mở thẻ mới, **When** thẻ truy cập còn hạn, **Then** khách vẫn ở
   trạng thái đã đăng nhập.

---

### User Story 2 - Đăng xuất và thu hồi phiên (Priority: P1)

Khách đăng xuất thì phiên trên thiết bị đó bị huỷ ở máy chủ, không thể dùng lại. Khách chọn "đăng xuất
mọi nơi" thì mọi thiết bị khác cũng mất phiên. Đổi mật khẩu hoặc đặt lại mật khẩu qua email cũng huỷ
mọi phiên đang có.

**Why this priority**: Hiện đặt lại mật khẩu không thu hồi phiên cũ (B1): người đã lấy được phiên vẫn
dùng tiếp sau khi chủ tài khoản đổi mật khẩu.

**Independent Test**: Đăng nhập hai thiết bị; đặt lại mật khẩu; kiểm tra cả hai không gia hạn được phiên.

**Acceptance Scenarios**:

1. **Given** khách đã đăng nhập, **When** đăng xuất, **Then** phiên của thiết bị đó không gia hạn được
   nữa.
2. **Given** khách đăng nhập trên hai thiết bị, **When** chọn "đăng xuất mọi nơi" trên một thiết bị,
   **Then** thiết bị còn lại không gia hạn được phiên.
3. **Given** khách đăng nhập trên hai thiết bị, **When** đặt lại mật khẩu qua email hoặc đổi mật khẩu,
   **Then** không phiên cũ nào gia hạn được.
4. **Given** quản trị viên khoá tài khoản, **When** phiên của tài khoản đó cần gia hạn, **Then** bị từ
   chối; các yêu cầu bằng thẻ truy cập cũ còn hạn được chấp nhận đến khi thẻ hết hạn (đã thống nhất).

---

### User Story 3 - Phát hiện phiên bị đánh cắp (Priority: P2)

Mỗi lần gia hạn, phiên cũ bị thay bằng phiên mới. Nếu một phiên đã bị thay lại được dùng lần nữa (dấu
hiệu bị đánh cắp và dùng song song), hệ thống huỷ toàn bộ chuỗi phiên đó, buộc đăng nhập lại.

**Why this priority**: Giảm thiệt hại khi phiên bị lộ; phụ thuộc US1.

**Independent Test**: Gia hạn một phiên, rồi dùng lại phiên cũ; kiểm tra cả phiên cũ lẫn phiên mới đều
bị huỷ.

**Acceptance Scenarios**:

1. **Given** phiên P1 đã được gia hạn thành P2, **When** có yêu cầu gia hạn bằng P1, **Then** bị từ chối
   và P2 cũng bị huỷ.

---

### User Story 4 - Không dò được tài khoản, mật khẩu và liên kết đặt lại an toàn hơn (Priority: P2)

Trang quên mật khẩu luôn trả cùng một thông báo dù email có tồn tại hay không. Liên kết đặt lại mật
khẩu chỉ dùng được một lần, hết hạn sau 15 phút, và không thể bị đọc ra từ cơ sở dữ liệu nếu dữ liệu bị
lộ. Mật khẩu mới phải đủ mạnh.

**Why this priority**: Sửa B2, B3, B4; độc lập với cơ chế phiên.

**Independent Test**: Gửi quên mật khẩu với email có và không có; so sánh phản hồi. Đặt mật khẩu yếu;
kiểm tra bị từ chối.

**Acceptance Scenarios**:

1. **Given** email không tồn tại, **When** yêu cầu quên mật khẩu, **Then** nhận đúng thông báo và mã như
   khi email tồn tại.
2. **Given** liên kết đặt lại đã dùng một lần, **When** dùng lại, **Then** bị từ chối.
3. **Given** khách đăng ký hoặc đặt mật khẩu mới dưới 8 ký tự hoặc thiếu chữ/số, **When** gửi, **Then**
   bị từ chối với thông báo tiếng Việt nêu yêu cầu.

---

### User Story 5 - Chỉ giao diện chính thức gọi được API kèm phiên (Priority: P2)

Chỉ giao diện chính thức (và môi trường phát triển cục bộ) được gửi yêu cầu kèm phiên đăng nhập. Trang
web lạ không thể kích hoạt gia hạn hay đăng xuất thay cho người dùng.

**Why this priority**: Sửa B5; bắt buộc khi phiên đi qua cookie.

**Acceptance Scenarios**:

1. **Given** một trang web khác domain, **When** gọi API gia hạn phiên, **Then** bị từ chối.

---

### Edge Cases

- Nhiều yêu cầu cùng lúc gặp thẻ hết hạn: giao diện chỉ gia hạn một lần, các yêu cầu còn lại chờ và dùng
  thẻ mới (không tự kích hoạt cơ chế phát hiện đánh cắp).
- Hai thẻ trình duyệt cùng gia hạn gần như đồng thời: không được làm khách bị đăng xuất.
- Trình duyệt chặn cookie khác domain (Safari/iPhone): khách vẫn đăng nhập và dùng được trong thời hạn
  thẻ truy cập; khi thẻ hết hạn thì được đưa về trang đăng nhập với thông báo rõ ràng (đã chấp nhận).
- Thẻ truy cập của phiên bản cũ (24 giờ) sau khi triển khai: không còn được chấp nhận; khách đăng nhập
  lại một lần.
- Giao diện phiên bản cũ đang mở khi máy chủ đã cập nhật: vẫn đăng nhập được và dùng trong thời hạn thẻ.
- Phản hồi gia hạn bị mất trên đường truyền (mạng di động rớt): trình duyệt vẫn giữ phiên cũ; nếu lần
  gia hạn kế tiếp xảy ra sau 30 giây, hệ thống coi là phiên bị dùng lại và buộc đăng nhập lại (đã biết,
  chấp nhận — backlog B33).
- Thu hồi phiên (đăng xuất mọi nơi, đổi/đặt lại mật khẩu) xảy ra đúng lúc một thiết bị đang gia hạn:
  không phiên nào được sống sót (phát hiện khi code review, đã có test).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Đăng nhập và đăng ký thành công PHẢI cấp một thẻ truy cập ngắn hạn (15 phút) và một phiên
  dài hạn (7 ngày) cho thiết bị đó.
- **FR-002**: Thẻ truy cập PHẢI được kiểm tra mà không truy vấn cơ sở dữ liệu ở mỗi yêu cầu.
- **FR-003**: Phiên dài hạn PHẢI được gửi qua cookie mà mã chạy trên trang không đọc được, chỉ được gửi
  tới đường dẫn xác thực của API, chỉ qua kết nối bảo mật.
- **FR-004**: Gia hạn PHẢI cấp thẻ truy cập mới và thay phiên cũ bằng phiên mới (7 ngày tính lại).
- **FR-005**: Dùng lại một phiên đã bị thay PHẢI huỷ toàn bộ chuỗi phiên liên quan.
- **FR-006**: Gia hạn PHẢI bị từ chối khi tài khoản bị khoá hoặc phiên đã hết hạn/bị huỷ; thông tin vai
  trò trong thẻ mới PHẢI lấy từ dữ liệu hiện tại.
- **FR-007**: Hệ thống PHẢI cho phép nhiều phiên song song cho một tài khoản.
- **FR-008**: Đăng xuất PHẢI huỷ phiên hiện tại; "đăng xuất mọi nơi" PHẢI huỷ mọi phiên của tài khoản.
- **FR-009**: Đổi mật khẩu và đặt lại mật khẩu PHẢI huỷ mọi phiên của tài khoản.
- **FR-010**: Quên mật khẩu PHẢI trả cùng mã và nội dung bất kể email có tồn tại.
- **FR-011**: Mã đặt lại mật khẩu PHẢI chỉ lưu ở dạng không đảo ngược được, dùng một lần, hết hạn sau 15
  phút.
- **FR-012**: Mật khẩu mới (đăng ký, đổi, đặt lại) PHẢI có ít nhất 8 ký tự, gồm chữ cái và chữ số;
  mật khẩu hiện có vẫn đăng nhập được.
- **FR-013**: Chỉ nguồn giao diện được cấu hình được gửi yêu cầu kèm thông tin đăng nhập; các yêu cầu
  gia hạn/đăng xuất từ nguồn khác PHẢI bị từ chối.
- **FR-014**: Giao diện PHẢI tự gia hạn khi thẻ truy cập hết hạn, gộp các yêu cầu đồng thời thành một
  lần gia hạn, và chỉ đưa khách về trang đăng nhập khi gia hạn thất bại.
- **FR-015**: Phản hồi đăng nhập/đăng ký PHẢI giữ trường thẻ hiện có để giao diện phiên bản cũ vẫn
  hoạt động trong thời gian chuyển tiếp.
- **FR-016**: Đăng xuất trên một thẻ trình duyệt PHẢI đăng xuất các thẻ khác của cùng trình duyệt (giữ
  hành vi hiện tại).

### Key Entities

- **Thẻ truy cập**: chứng nhận ngắn hạn (15 phút) gồm định danh và vai trò người dùng; không lưu ở máy chủ.
- **Phiên (refresh token)**: thuộc một người dùng và một thiết bị; có hạn 7 ngày; trạng thái còn hiệu
  lực / đã bị thay / đã huỷ; thuộc một chuỗi phiên để phát hiện dùng lại.
- **Mã đặt lại mật khẩu**: gắn với người dùng, lưu dạng không đảo ngược được, hạn 15 phút, dùng một lần.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Khách đang hoạt động không bị buộc đăng nhập lại trong suốt 7 ngày liên tục sử dụng (trên
  trình duyệt cho phép cookie).
- **SC-002**: 100% phiên của một tài khoản không gia hạn được sau khi đặt lại/đổi mật khẩu hoặc "đăng
  xuất mọi nơi".
- **SC-003**: Phản hồi quên mật khẩu giống hệt nhau (mã + nội dung) cho email có và không có.
- **SC-004**: Đọc toàn bộ cơ sở dữ liệu không cho phép dùng được bất kỳ phiên hay liên kết đặt lại mật
  khẩu nào.
- **SC-005**: Quyền mới hoặc trạng thái khoá có hiệu lực chậm nhất 15 phút sau khi quản trị viên thay đổi.

## Assumptions

- Thời hạn thẻ truy cập 15 phút; phiên 7 ngày tự gia hạn (đã chốt).
- Thẻ truy cập ở bộ nhớ lưu trữ của trình duyệt (đã chốt); rủi ro XSS giới hạn trong thời hạn 15 phút.
- Safari/iPhone chặn cookie khác domain: chấp nhận khách phải đăng nhập lại khi thẻ hết hạn; khắc phục
  triệt để bằng tên miền chung (backlog B19).
- Sau triển khai, mọi người dùng đăng nhập lại một lần (thẻ cũ không còn hợp lệ).
- Nguồn giao diện được phép: `https://pigeon-bookstore.pages.dev` và `http://localhost:5173` (cấu hình
  được qua biến môi trường).
- Cột phiên cũ trong bảng người dùng không còn dùng; xoá ở một lần dọn dẹp sau (backlog).
- Không thay đổi giao diện trang quản trị ngoài việc thêm nút "đăng xuất mọi nơi" ở trang tài khoản.
