# Feature Specification: Đăng nhập bằng Google

**Feature Branch**: `005-google-sign-in` (làm trực tiếp trên `main`, theo quy trình của dự án)

**Created**: 2026-11-17

**Status**: Draft

**Input**: User description: "Đăng nhập bằng Google (Google Sign-In / OpenID Connect) cho Pigeon Bookstore, bổ sung bên cạnh đăng nhập email + mật khẩu hiện có. Frontend hiển thị nút "Đăng nhập bằng Google" ở trang Đăng nhập và Đăng ký. Backend xác minh danh tính Google (chữ ký, đúng ứng dụng, hạn dùng, email đã xác minh); nhận diện người dùng bằng mã định danh Google chứ không chỉ email; tìm hoặc tạo tài khoản rồi cấp phiên của hệ thống như đăng nhập thường. Email Google trùng tài khoản mật khẩu đã có thì gộp vào tài khoản đó; vì hệ thống chưa xác minh email khi đăng ký (B56), khi gộp phải chống chiếm tài khoản trước: huỷ mật khẩu cũ và thu hồi mọi phiên của tài khoản chưa xác minh. Tài khoản chỉ dùng Google không có mật khẩu: đổi mật khẩu / quên mật khẩu phải xử lý trường hợp này. Tài khoản bị khoá không đăng nhập được bằng Google. Tài khoản mới tạo qua Google luôn là CUSTOMER."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Khách mới đăng nhập bằng Google, không cần tạo mật khẩu (Priority: P1)

Khách chưa có tài khoản bấm "Đăng nhập bằng Google" ở trang Đăng nhập hoặc Đăng ký, chọn tài khoản
Google của mình. Hệ thống tạo tài khoản khách hàng mới với email và họ tên lấy từ Google, rồi đưa khách
vào trạng thái đã đăng nhập ngay, giống hệt đăng nhập bằng mật khẩu (dùng trên nhiều thiết bị, tự gia hạn
phiên, đăng xuất được). Lần sau bấm nút đó, khách vào đúng tài khoản cũ.

**Why this priority**: Đây là giá trị chính của tính năng: đăng ký trong vài giây, không phải nghĩ mật khẩu,
và email chắc chắn là của khách (Google đã xác minh).

**Independent Test**: Với một tài khoản Google chưa từng dùng trên hệ thống, đăng nhập bằng Google, kiểm tra
tài khoản mới được tạo đúng email / họ tên / vai trò khách hàng, phiên dùng được và gia hạn được; đăng xuất
rồi đăng nhập Google lần nữa, kiểm tra vào lại đúng tài khoản đó, không tạo thêm tài khoản.

**Acceptance Scenarios**:

1. **Given** email Google chưa có tài khoản nào, **When** khách đăng nhập bằng Google, **Then** hệ thống
   tạo một tài khoản khách hàng với email (chữ thường) và họ tên từ Google, và khách ở trạng thái đã đăng nhập.
2. **Given** khách đã từng đăng nhập bằng Google, **When** đăng nhập bằng Google lần nữa (trên thiết bị
   này hoặc thiết bị khác), **Then** khách vào đúng tài khoản cũ, không có tài khoản trùng nào được tạo,
   các thiết bị đang đăng nhập khác không bị đăng xuất.
3. **Given** khách đã đăng nhập bằng Google, **When** dùng trang web như bình thường, **Then** phiên được
   tự gia hạn, đăng xuất / đăng xuất mọi nơi hoạt động y như tài khoản mật khẩu.
4. **Given** khách đổi địa chỉ email của tài khoản Google sau khi đã liên kết, **When** đăng nhập bằng
   Google, **Then** khách vẫn vào đúng tài khoản cũ (nhận diện theo mã định danh Google, không theo email).

---

### User Story 2 - Khách đã có tài khoản mật khẩu dùng Google cùng email (Priority: P1)

Khách đã đăng ký bằng email + mật khẩu từ trước, nay bấm "Đăng nhập bằng Google" bằng tài khoản Google có
cùng email. Hệ thống gộp vào tài khoản sẵn có (giữ nguyên đơn hàng, giỏ hàng, đánh giá...), không tạo tài
khoản thứ hai. Vì hệ thống chưa từng xác minh rằng người đặt mật khẩu cũ thật sự sở hữu email đó, khi gộp,
mật khẩu cũ bị huỷ và mọi phiên cũ bị thu hồi: người duy nhất còn vào được là người chứng minh sở hữu email
qua Google.

**Why this priority**: Không gộp thì khách có hai tài khoản cùng email (mất lịch sử mua hàng). Gộp mà không
huỷ mật khẩu cũ thì mở ra lỗ hổng chiếm tài khoản trước: kẻ xấu đăng ký trước bằng email của nạn nhân với
mật khẩu của hắn, chờ nạn nhân đăng nhập Google rồi dùng chung tài khoản.

**Independent Test**: Tạo tài khoản mật khẩu với email X, đăng nhập trên một thiết bị; đăng nhập Google bằng
email X; kiểm tra không có tài khoản mới, dữ liệu cũ còn nguyên, mật khẩu cũ không đăng nhập được nữa và
phiên trên thiết bị cũ không gia hạn được.

**Acceptance Scenarios**:

1. **Given** có tài khoản mật khẩu với email X (bất kể chữ hoa / thường) chưa liên kết Google, **When**
   khách đăng nhập Google bằng email X, **Then** khách vào chính tài khoản đó, dữ liệu cũ (đơn hàng, giỏ,
   vai trò) giữ nguyên, không tạo tài khoản mới.
2. **Given** điều kiện như trên, **When** gộp xong, **Then** mật khẩu cũ không còn đăng nhập được, mọi
   phiên đang có của tài khoản đó trên các thiết bị khác không gia hạn được nữa.
3. **Given** tài khoản đã được gộp, **When** khách muốn dùng lại mật khẩu, **Then** khách dùng "Quên mật
   khẩu" để đặt mật khẩu mới (email đi tới hộp thư khách đã chứng minh sở hữu), sau đó đăng nhập được bằng
   cả mật khẩu mới và Google.
4. **Given** email X đã liên kết với một tài khoản Google khác (mã định danh khác), **When** một tài khoản
   Google mới cũng xưng email X đăng nhập, **Then** bị từ chối với thông báo tiếng Việt, không tài khoản
   nào bị thay đổi.

---

### User Story 3 - Tài khoản chỉ dùng Google với các chức năng mật khẩu (Priority: P2)

Tài khoản tạo qua Google không có mật khẩu. Ở trang hồ sơ, khách được báo rõ tài khoản chưa có mật khẩu
và được hướng tới cách tạo (Quên mật khẩu), thay vì một form đòi "mật khẩu hiện tại" không bao giờ nhập
đúng được. Đăng nhập bằng email + mật khẩu vào tài khoản chưa có mật khẩu báo lỗi chung như sai mật khẩu.

**Why this priority**: Không chặn luồng chính (P1) nhưng nếu bỏ qua, khách gặp form không dùng được và lỗi
khó hiểu.

**Independent Test**: Với tài khoản tạo qua Google: đăng nhập bằng mật khẩu bất kỳ bị từ chối với câu lỗi
chung; trang hồ sơ hiển thị hướng dẫn tạo mật khẩu; dùng Quên mật khẩu đặt mật khẩu xong thì đăng nhập
được bằng mật khẩu đó.

**Acceptance Scenarios**:

1. **Given** tài khoản chỉ dùng Google, **When** ai đó đăng nhập bằng email đó và một mật khẩu bất kỳ,
   **Then** bị từ chối với đúng câu "Email hoặc mật khẩu không chính xác!" như mọi lần sai mật khẩu.
2. **Given** tài khoản chỉ dùng Google đang đăng nhập, **When** mở phần đổi mật khẩu ở trang hồ sơ,
   **Then** thấy thông báo tài khoản chưa có mật khẩu kèm cách tạo, không thấy form đòi mật khẩu hiện tại.
3. **Given** tài khoản chỉ dùng Google, **When** gọi API đổi mật khẩu trực tiếp, **Then** bị từ chối với
   thông báo tiếng Việt hướng dẫn dùng Quên mật khẩu.
4. **Given** tài khoản chỉ dùng Google, **When** dùng Quên mật khẩu và đặt mật khẩu mới, **Then** đăng
   nhập được bằng cả mật khẩu đó lẫn Google.

---

### User Story 4 - Từ chối các trường hợp không an toàn (Priority: P1)

Hệ thống chỉ tin bằng chứng danh tính do chính Google cấp cho đúng ứng dụng Pigeon Bookstore, còn hạn, với
email đã được Google xác minh. Tài khoản bị khoá không vào được bằng Google. Đăng nhập Google không bao giờ
tạo hay nâng quyền quản trị.

**Why this priority**: Một điểm sai ở đây là chiếm được tài khoản bất kỳ.

**Independent Test**: Gửi các bằng chứng sai chữ ký, cấp cho ứng dụng khác, hết hạn, email chưa xác minh;
đăng nhập Google vào tài khoản bị khoá; kiểm tra tất cả bị từ chối và không tài khoản nào bị tạo / sửa.

**Acceptance Scenarios**:

1. **Given** bằng chứng danh tính giả mạo, bị sửa, hết hạn, hoặc cấp cho ứng dụng khác, **When** gửi lên,
   **Then** bị từ chối, không tạo / sửa tài khoản, thông báo không lộ chi tiết kỹ thuật.
2. **Given** tài khoản Google có email chưa được Google xác minh, **When** đăng nhập, **Then** bị từ chối.
3. **Given** tài khoản trên hệ thống bị quản trị viên khoá, **When** chủ tài khoản đăng nhập bằng Google,
   **Then** bị từ chối với đúng câu báo khoá như đăng nhập bằng mật khẩu, không cấp phiên.
4. **Given** bất kỳ đăng nhập Google nào, **When** tạo tài khoản mới, **Then** vai trò luôn là khách hàng;
   khi gộp vào tài khoản sẵn có, vai trò hiện tại giữ nguyên, không đổi.

---

### Edge Cases

- Gửi cùng một bằng chứng Google hai lần (bấm đúp, mạng chập chờn): không tạo hai tài khoản; hai yêu
  cầu tạo tài khoản đồng thời cho cùng một người Google chỉ tạo đúng một tài khoản.
- Họ tên từ Google rỗng, quá dài, hoặc chứa ký tự mà form đăng ký thường không cho: vẫn tạo được tài khoản;
  họ tên rỗng thì lấy phần trước `@` của email; dài quá giới hạn thì cắt bớt.
- Hệ thống chưa được cấu hình cho Google (thiếu mã ứng dụng): nút Google không hiển thị; gọi thẳng API thì
  nhận thông báo tiếng Việt rằng tính năng chưa bật; máy chủ vẫn khởi động bình thường và ghi cảnh báo.
- Dịch vụ Google tạm không truy cập được khi xác minh: báo lỗi tiếng Việt, thử lại sau; không làm sập máy chủ.
- Khách đang đăng nhập tài khoản A trên trình duyệt rồi đăng nhập Google vào tài khoản B: phiên A trên
  trình duyệt đó bị thay bằng phiên B, dữ liệu cá nhân của A trên máy được xoá như khi đăng nhập thường (B54).
- Khách đóng cửa sổ chọn tài khoản Google giữa chừng: không có gì thay đổi, không hiện lỗi.
- Trình duyệt chặn cookie bên thứ ba (Safari / iPhone, B19): hạn chế y như đăng nhập bằng mật khẩu hiện nay,
  không xử lý riêng trong tính năng này.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Trang Đăng nhập và trang Đăng ký PHẢI có nút "Đăng nhập bằng Google"; nút chỉ hiển thị khi
  hệ thống đã được cấu hình cho Google.
- **FR-002**: Hệ thống PHẢI chỉ chấp nhận bằng chứng danh tính do Google ký, cấp cho đúng ứng dụng của hệ
  thống, do Google phát hành, còn hạn, và có email đã được Google xác minh; mọi trường hợp khác PHẢI bị từ
  chối mà không tạo hay sửa tài khoản.
- **FR-003**: Hệ thống PHẢI nhận diện người dùng Google bằng mã định danh Google cố định của người đó; email
  chỉ dùng để tìm tài khoản có sẵn ở lần liên kết đầu tiên.
- **FR-004**: Khi chưa có tài khoản nào khớp mã định danh hoặc email, hệ thống PHẢI tạo tài khoản mới vai trò
  khách hàng, email chữ thường (theo B55), họ tên từ Google (rỗng thì lấy phần trước `@`), không có mật khẩu,
  ghi nhận email đã xác minh.
- **FR-005**: Khi email Google khớp một tài khoản chưa liên kết Google, hệ thống PHẢI liên kết vào tài khoản
  đó, giữ nguyên dữ liệu và vai trò, đồng thời trong cùng một thao tác: huỷ mật khẩu hiện có, huỷ mọi mã
  đặt lại mật khẩu đang chờ, thu hồi mọi phiên đang có, và ghi nhận email đã xác minh.
- **FR-006**: Khi email Google khớp một tài khoản đã liên kết với mã định danh Google khác, hệ thống PHẢI từ
  chối với thông báo tiếng Việt và không thay đổi tài khoản nào.
- **FR-007**: Tài khoản bị khoá PHẢI bị từ chối đăng nhập Google với cùng thông báo như đăng nhập mật khẩu.
- **FR-008**: Đăng nhập Google thành công PHẢI cấp phiên giống hệt đăng nhập bằng mật khẩu (thẻ truy cập
  ngắn hạn, phiên dài hạn trong cookie, gia hạn, nhiều thiết bị, đăng xuất, đăng xuất mọi nơi), kèm dạng dữ
  liệu người dùng trả về giống đăng nhập thường; nếu trình duyệt đang giữ phiên khác thì phiên đó bị thu hồi
  như đăng nhập thường.
- **FR-009**: Đăng nhập bằng email + mật khẩu vào tài khoản chưa có mật khẩu PHẢI bị từ chối với đúng câu
  lỗi chung của sai mật khẩu (không lộ tài khoản dùng Google).
- **FR-010**: Đổi mật khẩu trên tài khoản chưa có mật khẩu PHẢI bị từ chối với thông báo tiếng Việt hướng
  dẫn dùng Quên mật khẩu; trang hồ sơ PHẢI hiển thị hướng dẫn đó thay cho form đổi mật khẩu.
- **FR-011**: Quên mật khẩu / đặt lại mật khẩu PHẢI dùng được cho tài khoản chưa có mật khẩu và sau đó tài
  khoản đăng nhập được bằng cả mật khẩu và Google.
- **FR-012**: Đăng nhập Google KHÔNG ĐƯỢC tạo tài khoản vai trò khác khách hàng và KHÔNG ĐƯỢC đổi vai trò của
  tài khoản có sẵn.
- **FR-013**: Hai yêu cầu đăng nhập Google đồng thời của cùng một người PHẢI không tạo ra hai tài khoản.
- **FR-014**: Endpoint đăng nhập Google PHẢI có giới hạn tần suất như các endpoint đăng nhập khác, PHẢI kiểm
  tra đầu vào bằng schema, và mọi lỗi PHẢI trả thông báo tiếng Việt không lộ chi tiết nội bộ.
- **FR-015**: Thiếu cấu hình Google PHẢI không chặn máy chủ khởi động; máy chủ ghi cảnh báo lúc khởi động
  (cùng cơ chế kiểm tra cấu hình B53), endpoint trả thông báo tính năng chưa bật.

### Key Entities

- **Người dùng (users)**: thêm mã định danh Google (duy nhất, có thể trống) và thời điểm email được xác minh
  (có thể trống); mật khẩu trở thành có thể trống (tài khoản chỉ dùng Google). Dữ liệu cũ không bị sửa.
- **Phiên (refresh_tokens)**: dùng lại nguyên cơ chế spec 002, không thay đổi.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Khách mới có tài khoản và ở trạng thái đã đăng nhập bằng Google với tối đa 2 thao tác (bấm
  nút, chọn tài khoản Google), dưới 15 giây.
- **SC-002**: 100% lần đăng nhập Google lặp lại của cùng một người vào đúng một tài khoản; không có tài khoản
  trùng email nào được tạo, kể cả khi gửi đồng thời.
- **SC-003**: 100% bằng chứng danh tính giả mạo, hết hạn, sai ứng dụng hoặc email chưa xác minh bị từ chối
  mà không tạo / sửa tài khoản (kiểm chứng bằng bộ test tự động).
- **SC-004**: Sau khi gộp tài khoản, 0 phiên cũ gia hạn được và mật khẩu cũ đăng nhập thất bại 100%.
- **SC-005**: Toàn bộ bộ test tự động hiện có của backend và frontend vẫn xanh; đăng nhập bằng mật khẩu
  không thay đổi hành vi với tài khoản có mật khẩu.

## Assumptions

- Dùng nút đăng nhập chính thức của Google trên trình duyệt; chỉ xin quyền danh tính cơ bản (email, họ tên),
  không truy cập dữ liệu khác của khách trên Google.
- Chủ dự án tự tạo mã ứng dụng Google (OAuth Client ID) và khai báo địa chỉ trang web production + local;
  việc này không cần tên miền riêng.
- Họ tên lấy từ Google một lần khi tạo tài khoản; về sau khách tự sửa trong hồ sơ, đăng nhập Google không ghi
  đè họ tên hay email đã lưu.
- Email trong hệ thống vẫn không đổi được (như hiện tại); khi email Google đổi, tài khoản vẫn giữ email cũ.
- Không làm "huỷ liên kết Google" và không làm trang quản lý phương thức đăng nhập trong đợt này.
- Không xử lý B56 (xác minh email cho tài khoản đăng ký bằng mật khẩu) trong đợt này; chỉ ghi nhận email đã
  xác minh cho tài khoản đi qua Google.
- Hạn chế cookie bên thứ ba trên Safari / iPhone (B19) giữ nguyên như đăng nhập bằng mật khẩu.
