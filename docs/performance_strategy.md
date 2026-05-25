🚀 Chiến lược Hiệu năng & Khả năng Mở rộng (Performance & Scalability Strategy)

Tài liệu này trình bày chi tiết các chiến lược tối ưu hóa hiệu suất, cấu hình Caching, Database và các phương án mở rộng hệ thống (Scalability) nhằm đáp ứng lượng người dùng lớn cho dự án E-commerce tích hợp RAG AI.

1. Caching Strategy (Task 6.1)

Sử dụng Redis làm In-memory Data Store để giảm tải cho Database chính (PostgreSQL) và tăng tốc độ phản hồi API.

1.1. Redis for What Data? (Dữ liệu nào cần Cache?)

Danh mục Sách (Category & Book List): Dữ liệu trang chủ ít thay đổi nhưng có lượng đọc (Read) cực lớn.

Giỏ hàng tạm thời (Cart Session): Lưu trữ nhanh giỏ hàng trước khi Checkout.

AI Chat Cache: Lưu kết quả của những câu hỏi phổ biến (Ví dụ: "Tóm tắt chương 1") để trả về ngay không cần gọi lại LLM.

Token Blacklist: Lưu các JWT đã bị revoke (đăng xuất) để kiểm tra bảo mật siêu tốc.

1.2. Cache Invalidation Strategy (Chiến lược xóa Cache)

Event-Driven Invalidation (Xóa theo sự kiện): Áp dụng cho Sách. Khi Admin thực hiện PUT /books/:id (sửa giá, sửa tên) hoặc thêm sách mới, Backend sẽ bắn một event xóa key cache:books:all trong Redis. Lần fetch tiếp theo sẽ tự động lấy từ DB và cache lại.

Write-through (Ghi xuyên): Áp dụng cho Giỏ hàng. Khi user thêm sách vào giỏ, ghi đồng thời vào cả Redis và Database.

1.3. TTL Settings (Thời gian sống của Cache)

books_list: 1 giờ (3600s).

cart_session: 7 ngày.

ai_common_queries: 24 giờ.

jwt_blacklist: Đúng bằng thời gian sống còn lại của Access Token (15 phút).

2. Database Optimization (Task 6.2)

Tối ưu hóa PostgreSQL để xử lý các truy vấn phức tạp và chịu tải cao.

2.1. Index Design (Thiết kế Index)

Thiết lập B-Tree Index cho các trường thường xuyên được dùng trong mệnh đề WHERE, JOIN và ORDER BY:

User: Index trên email.

Order: Index trên userId và status.

Inventory: Index trên bookId.

Review: Composite Index trên (bookId, rating) để lọc đánh giá nhanh.

2.2. Query Optimization Strategy

Pagination (Phân trang): Mặc định sử dụng Limit/Offset (Cursor-based pagination) cho danh sách sách và lịch sử đơn hàng để tránh load toàn bộ bảng vào RAM.

Select Specific Columns: Thay vì dùng SELECT *, Prisma sẽ được cấu hình để chỉ select: { id, title, price } nhằm giảm băng thông mạng.

N+1 Query Problem: Sử dụng tính năng eager loading của Prisma (include) thay vì lặp qua từng phần tử để gọi DB.

2.3. Connection Pooling

Sử dụng PgBouncer (hoặc tích hợp sẵn Prisma Connection Pool).

Lý do: Rất nhiều request Node.js đến cùng lúc sẽ làm sập kết nối của PostgreSQL. Pooling giúp duy trì một lượng kết nối ổn định, tái sử dụng chúng thay vì tạo mới cho mỗi request.

3. RAG Performance (Task 6.3)

Tối ưu hóa cụm FastAPI và Vector Database (ChromaDB) để tăng tốc độ tìm kiếm AI.

3.1. Vector Search Optimization

Sử dụng thuật toán HNSW (Hierarchical Navigable Small World) mặc định của ChromaDB để thực hiện Tìm kiếm lân cận gần nhất (ANN). HNSW cho phép tìm kiếm dưới 10ms ngay cả với hàng triệu vector.

3.2. Chunk Size Strategy

Kích thước (Chunk Size): 500 - 1000 tokens/chunk.

Overlap: 100 - 200 tokens (Để giữ lại ngữ cảnh giữa các đoạn cắt).

Lý do: Chunk quá nhỏ sẽ làm mất nghĩa câu, chunk quá lớn sẽ làm nhiễu Context đưa vào LLM và tốn chi phí token. Mức 500-1000 là tối ưu nhất cho Sách.

3.3. Batch Processing cho Embeddings

Khi Curator upload file PDF dài 500 trang:

Không gửi từng dòng text cho Model Embedding (sẽ bị lỗi Rate Limit).

Áp dụng Batching: Nhóm 50-100 chunks thành 1 mảng và gửi đi tạo vector cùng 1 lúc (API của OpenAI/SBERT đều hỗ trợ array input). Giảm số lượng HTTP Request đi 50 lần.

4. Scalability Plan (Task 6.4)

Kế hoạch mở rộng hệ thống khi lượng người dùng tăng vọt (Ví dụ: Sự kiện Flash Sale).

4.1. Horizontal Scaling Approach (Mở rộng ngang)

Cả Node.js Service và FastAPI Service đều được thiết kế Stateless (Không lưu trạng thái) (Session lưu ở Redis, Token dạng JWT).

Có thể dùng Docker & Kubernetes để spin-up thêm 5-10 containers (pods) Node.js cùng lúc khi tải CPU > 70%.

4.2. Database Replication (Nhân bản DB)

Cấu hình mô hình 1 Primary - N Replicas (Master-Slave) cho PostgreSQL.

Primary (Master): Chỉ chuyên dùng để Ghi dữ liệu (Tạo Đơn hàng, Update tồn kho).

Replicas (Slaves): Chuyên dùng để Đọc dữ liệu (Lấy danh sách sách, Xem đơn).

Giúp giảm 70% tải cho Database chính trong quá trình user lướt xem hàng.

4.3. Load Balancing Strategy (Chiến lược Cân bằng tải)

Sử dụng Nginx hoặc AWS ALB (Application Load Balancer) đặt ở phía trước các Backend.

Áp dụng thuật toán Round-Robin (chia đều request tuần tự) hoặc Least Connections (chuyển request cho server đang rảnh nhất) để phân phối lưu lượng truy cập công bằng cho toàn bộ các instances.