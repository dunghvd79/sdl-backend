🛡️ Chiến lược Xử lý Đồng thời & Nhất quán Dữ liệu (Concurrency & Consistency Strategy)

Tài liệu này định nghĩa các chiến lược kỹ thuật để đảm bảo tính toàn vẹn dữ liệu của hệ thống E-commerce (SDL) khi có lượng truy cập lớn (High Concurrency), đặc biệt là trong quá trình đặt hàng, trừ kho và thanh toán.

1. Inventory Management (Task 5.1)

Để tránh tình trạng bán vượt mức (Overselling), hệ thống sử dụng mô hình Soft Allocation (Cấp phát mềm) với cơ chế Hold/Release.

1.1. Cơ chế Hold/Release

Thay vì chỉ có một cột stock, bảng Inventory sẽ có 2 cột:

availableQty: Số lượng có thể bán.

reservedQty: Số lượng đang bị "giữ" bởi các đơn hàng PENDING.

Luồng hoạt động:

Hold (Giữ hàng): Khi User bấm "Thanh toán", hệ thống kiểm tra availableQty. Nếu đủ, trừ availableQty và cộng vào reservedQty.

Commit (Chốt sales): Khi Webhook VNPay báo thanh toán thành công, trừ hẳn ở reservedQty (Hàng chính thức xuất kho).

Release (Nhả hàng): Nếu User không thanh toán sau 15 phút, hệ thống (Cron Job) sẽ trừ ở reservedQty và cộng trả lại vào availableQty.

1.2. Database Lock Strategy (Chiến lược khóa dữ liệu)

Chúng ta áp dụng Pessimistic Locking (Khóa bi quan) bằng lệnh SQL SELECT ... FOR UPDATE khi User bắt đầu quá trình Checkout.

Lý do: Trong E-commerce, tỷ lệ tranh chấp khi mua cùng một cuốn sách hot là rất cao. Khóa bi quan ép các request đến cùng lúc phải xếp hàng đợi nhau (ở cấp độ Row-level của Database), đảm bảo không ai đọc được dữ liệu tồn kho sai lệch trước khi thực hiện Transaction.

1.3. Timeout Handling

Sử dụng BullMQ hoặc Node-cron để chạy một Background Worker.

Worker này chạy mỗi phút một lần, tìm các bản ghi Order có status = 'PENDING' và createdAt < (NOW() - 15 minutes).

Cập nhật trạng thái thành CANCELLED và kích hoạt hàm Release nhả tồn kho.

2. Transaction Design (Task 5.2)

Để đảm bảo tính ACID (Đặc biệt là Atomicity - Tính nguyên tử), mọi thao tác thao tác đến Đơn hàng và Tồn kho phải được bọc trong Database Transaction.

2.1. Order Creation Transaction & Stock Update Atomicity

Đảm bảo việc Tạo đơn hàng và Trừ availableQty diễn ra đồng thời.

async function processCheckout(userId, cartItems) {
  // Bắt đầu Transaction
  return await prisma.$transaction(async (tx) => {
    let totalAmount = 0;

    for (const item of cartItems) {
      // 1. Áp dụng Pessimistic Lock (X-Lock) cho dòng dữ liệu của cuốn sách
      const inventory = await tx.$queryRaw`
        SELECT * FROM "Inventory" 
        WHERE "bookId" = ${item.bookId} 
        FOR UPDATE
      `;

      // 2. Kiểm tra tồn kho
      if (inventory[0].availableQty < item.quantity) {
        throw new Error(`Sách ID ${item.bookId} không đủ số lượng tồn kho!`);
      }

      // 3. Thực hiện Hold Stock (Update Atomicity)
      await tx.inventory.update({
        where: { bookId: item.bookId },
        data: {
          availableQty: { decrement: item.quantity },
          reservedQty: { increment: item.quantity }
        }
      });

      const book = await tx.book.findUnique({ where: { id: item.bookId } });
      totalAmount += book.price * item.quantity;
    }

    // 4. Tạo Order
    const newOrder = await tx.order.create({
      data: {
        userId,
        totalAmount,
        status: 'PENDING',
        items: {
          create: cartItems.map(item => ({
             bookId: item.bookId,
             quantity: item.quantity
          }))
        }
      }
    });

    return newOrder;
  }); // COMMIT hoặc ROLLBACK tự động
}

2.2. Payment Confirmation Transaction

Khi VNPay gửi Webhook báo người dùng đã chuyển khoản xong, hệ thống phải cập nhật đơn hàng và trừ hàng ở kho chờ (reservedQty).

async function processPaymentWebhook(orderId) {
  return await prisma.$transaction(async (tx) => {
    // 1. Lấy thông tin order kèm items
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: true }
    });

    // Idempotency: Bỏ qua nếu đơn này đã được xử lý trước đó
    if (order.status !== 'PENDING') return { success: true, message: "Đã xử lý" };

    // 2. Cập nhật trạng thái đơn hàng thành Đã thanh toán
    await tx.order.update({
      where: { id: orderId },
      data: { status: 'PAID' }
    });

    // 3. Thực hiện Commit Stock (Trừ hẳn lượng hàng đang giữ)
    for (const item of order.items) {
      await tx.inventory.update({
        where: { bookId: item.bookId },
        data: { reservedQty: { decrement: item.quantity } }
      });
    }

    return { success: true };
  });
}

3. Concurrency Test Plan (Task 5.3 & 5.4)

Để đảm bảo chiến lược hoạt động hiệu quả (Document concurrency strategy), hệ thống cần trải qua các kịch bản kiểm thử nghiêm ngặt.

3.1. Race Condition Scenarios (Kịch bản Tranh chấp)

Sử dụng Integration Test tự động để giả lập các tình huống:

Kịch bản 1 (Mua cuốn sách cuối cùng): Kho chỉ còn 1 cuốn. Giả lập 10 Users gọi API Checkout cùng một phần nghìn giây.

Kỳ vọng: Nhờ Pessimistic Lock, chỉ 1 User nhận response 200 OK, 9 Users còn lại nhận 400 Bad Request (Hết hàng). Tồn kho không bao giờ bị âm.

Kịch bản 2 (Timeout Release Stock): Giả lập 1 User tạo đơn hàng nhưng bỏ ngang không thanh toán.

Kỳ vọng: Sau 15 phút, Cronjob chạy. Số lượng reservedQty giảm và availableQty tăng trở lại đúng bằng số đã trừ.

Kịch bản 3 (Double Webhook/Spam Submit): VNPay gọi Webhook thành công 2 lần liên tiếp do lỗi mạng, hoặc User bấm "Thanh toán" 5 lần.

Kỳ vọng: Cơ chế kiểm tra trạng thái (if status !== 'PENDING') chặn không cho xử lý trừ kho lần 2.

3.2. Load Testing Strategy (Chiến lược Kiểm thử Tải)

Sử dụng công cụ k6 hoặc JMeter để giả lập lưu lượng truy cập lớn (Spike traffic).

Thông số Test: Bắn 500 Virtual Users (VUs) liên tục thực hiện luồng: Browse -> Add to Cart -> Checkout trong vòng 5 phút.

Tiêu chí Pass:

p95 Response Time < 500ms (95% request phản hồi dưới 0.5 giây).

Error Rate (Lỗi 5xx do sập hệ thống hoặc Deadlock SQL) < 0.1%. (Lỗi 4xx do hết hàng là hành vi bình thường).

3.3. Failover Handling (Xử lý Sự cố)

Node.js Crash khi đang Transaction: Nếu server sập nguồn khi vừa thực hiện decrement kho nhưng chưa kịp tạo Order, Database sẽ tự động Rollback toàn bộ. Không bao giờ có chuyện mất hàng.

Worker Crash (Lỗi Cron Job): Nếu dịch vụ nhả kho bị chết, khi khởi động lại, nhờ câu SQL quét createdAt < (NOW() - 15 minutes), nó sẽ vét sạch và xử lý bù các đơn quá hạn mà không bỏ sót.