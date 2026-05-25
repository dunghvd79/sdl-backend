# 🔄 Sơ đồ Trình tự (Sequence Diagrams)

Tài liệu này mô tả chi tiết luồng tương tác giữa các hệ thống (Frontend, Backend Services, Databases) cho các nghiệp vụ cốt lõi của dự án SDL.

## 1. E-commerce Workflows (Task 4.1)

### 1.1. Luồng Xác thực: Đăng nhập & Refresh Token
**Mục đích:** Mô tả cách Frontend lấy Token, lưu trữ và tự động gọi lại API để làm mới Access Token khi bị hết hạn (Mượt mà, không bắt User đăng nhập lại).

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant FE as Frontend (Web/App)
    participant API as Node.js Service (Auth)
    participant DB as PostgreSQL

    %% --- Luồng Đăng nhập ---
    User->>FE: Nhập Email & Password
    FE->>API: POST /auth/login {email, password}
    
    API->>DB: Query User by Email
    DB-->>API: Trả về User record & Password Hash
    
    alt Sai thông tin
        API-->>FE: 401 Unauthorized (Sai mật khẩu)
        FE-->>User: Hiển thị thông báo lỗi
    else Thông tin hợp lệ
        API->>API: Generate AccessToken (15m) & RefreshToken (7d)
        API-->>FE: 200 OK {accessToken, refreshToken, user}
        FE->>FE: Lưu Token (Local Storage / Cookie)
        FE-->>User: Chuyển hướng vào Trang chủ
    end

    %% --- Luồng gọi API & Refresh Token ---
    Note over User, DB: ... 20 phút sau (AccessToken đã hết hạn) ...
    
    User->>FE: Vào trang Giỏ hàng
    FE->>API: GET /cart (Header: Bearer AccessToken)
    
    API->>API: Verify AccessToken
    API-->>FE: 401 Token Expired
    
    Note over FE, API: Bắt đầu luồng Refresh (Ngầm)
    FE->>API: POST /auth/refresh-token {refreshToken}
    
    alt Refresh Token cũng hết hạn/không hợp lệ
        API-->>FE: 403 Forbidden
        FE->>FE: Xóa dữ liệu phiên cũ
        FE-->>User: Bắt buộc đăng nhập lại
    else Refresh Token hợp lệ
        API->>API: Generate NEW AccessToken (15m)
        API-->>FE: 200 OK {new_accessToken}
        FE->>FE: Cập nhật AccessToken mới
        
        Note over FE, API: Tự động gọi lại API bị lỗi ban đầu
        FE->>API: GET /cart (Header: Bearer NEW_AccessToken)
        API->>DB: Lấy dữ liệu giỏ hàng
        DB-->>API: Dữ liệu giỏ hàng
        API-->>FE: 200 OK {cart_data}
        FE-->>User: Hiển thị Giỏ hàng
    end

```

### 1.2. Luồng Thanh toán & Xử lý Tồn kho (Checkout & Inventory Hold)
**Mục đích:** Đảm bảo tính toàn vẹn dữ liệu khi đặt hàng. Giữ (Hold) hàng khi user bắt đầu thanh toán để tránh bán vượt mức (Overselling), và tự động nhả (Release) hàng nếu user không thanh toán trong vòng 15 phút.

```mermaid
sequenceDiagram
    autonumber
    actor User as Customer
    participant FE as Frontend (Web/App)
    participant API as Node.js Service (Orders)
    participant DB as PostgreSQL (Inventory)
    participant Pay as VNPay Gateway

    %% --- Luồng Tạo đơn & Giữ hàng ---
    User->>FE: Bấm "Thanh toán" (Checkout)
    FE->>API: POST /orders/checkout {cart_items}
    
    Note over API, DB: Bắt đầu Transaction 1: Giữ hàng (Hold Stock)
    API->>DB: Kiểm tra Tồn kho (SELECT availableQty)
    DB-->>API: Trả về số lượng hiện tại
    
    alt Không đủ hàng (availableQty < requestedQty)
        API-->>FE: 400 Bad Request (Sản phẩm đã hết)
        FE-->>User: Hiển thị thông báo xin lỗi
    else Đủ hàng
        API->>DB: UPDATE Inventory (availableQty -= qty, reservedQty += qty)
        API->>DB: INSERT Order (status = PENDING)
        DB-->>API: Trả về thông tin đơn hàng (order_id)
        
        Note over API, Pay: Tích hợp Thanh toán VNPay
        API->>Pay: Gọi API tạo Payment URL
        Pay-->>API: Trả về URL thanh toán an toàn
        API-->>FE: 200 OK {paymentUrl, order_id}
        FE-->>User: Chuyển hướng sang cổng VNPay
    end

    %% --- Luồng Xử lý kết quả thanh toán ---
    alt Thanh toán thành công
        User->>Pay: Nhập thông tin thẻ & Xác nhận
        Pay-->>FE: Redirect về trang Web (Hiển thị Success)
        
        Note over Pay, API: VNPay gọi ngầm Server để xác nhận (Webhook/IPN)
        Pay->>API: POST /payment/webhook (Giao dịch thành công)
        
        Note over API, DB: Transaction 2: Xác nhận bán (Commit Sale)
        API->>DB: UPDATE Order (status = PAID)
        API->>DB: UPDATE Inventory (reservedQty -= qty)
        API-->>Pay: 200 OK (Đã nhận thông báo)
        
    else Hủy bỏ hoặc Hết thời gian (Timeout 15 phút)
        Note over API, DB: Cron Job quét các đơn PENDING quá hạn
        API->>DB: SELECT Orders WHERE status='PENDING' AND created_at < (now - 15m)
        
        Note over API, DB: Transaction 3: Nhả hàng (Release Stock)
        API->>DB: UPDATE Order (status = CANCELLED)
        API->>DB: UPDATE Inventory (reservedQty -= qty, availableQty += qty)
    end
```

### 1.3. Luồng Tìm kiếm & Thêm vào Giỏ hàng (Browse & Add to Cart)
**Mục đích:** Mô tả cách người dùng tương tác với hệ thống để tìm kiếm sản phẩm và các bước Backend xử lý khi đưa một cuốn sách vào giỏ hàng.

```mermaid
sequenceDiagram
    autonumber
    actor User as Customer
    participant FE as Frontend (Web/App)
    participant API as Node.js Service (Books & Cart)
    participant DB as PostgreSQL

    %% --- Luồng Tìm kiếm & Xem chi tiết (Browse & Search) ---
    User->>FE: Nhập từ khóa "AI" & Tìm kiếm
    FE->>API: GET /books?search=AI
    API->>DB: Query sách theo từ khóa (LIKE '%AI%')
    DB-->>API: Trả về danh sách sách
    API-->>FE: 200 OK (List of books)
    FE-->>User: Hiển thị kết quả tìm kiếm

    User->>FE: Bấm xem chi tiết cuốn sách (ID = 5)
    FE->>API: GET /books/5
    API->>DB: Query chi tiết sách & Tồn kho
    DB-->>API: Data sách (ID: 5)
    API-->>FE: 200 OK (Book details)
    FE-->>User: Hiển thị trang chi tiết sản phẩm

    %% --- Luồng Thêm vào giỏ (Add to Cart) ---
    User->>FE: Chọn số lượng (2) & Bấm "Thêm vào giỏ"
    
    Note over FE, API: Request phải có chứa Access Token
    FE->>API: POST /cart/items {bookId: 5, quantity: 2} 
    API->>DB: Kiểm tra cuốn sách này đã có trong giỏ chưa?
    
    alt Sách đã tồn tại trong giỏ
        API->>DB: UPDATE CartItem (quantity += 2)
    else Sách chưa có trong giỏ
        API->>DB: INSERT CartItem (bookId: 5, quantity: 2)
    end
    
    DB-->>API: Lưu thành công
    API-->>FE: 200 OK (Message: Thêm thành công)
    FE-->>User: Hiển thị Toast thông báo & Cập nhật số lượng trên icon Giỏ hàng
```

## 2. RAG AI Workflows (Task 4.2)

### 2.1. Luồng Upload & Trích xuất Dữ liệu Vector (Upload & Embedding)
**Mục đích:** Mô tả quá trình Curator tải một file PDF lên hệ thống. Server sẽ cắt nhỏ tài liệu, biến thành vector và lưu vào ChromaDB. Frontend sử dụng cơ chế Polling để kiểm tra tiến độ.

```mermaid
sequenceDiagram
    autonumber
    actor Curator
    participant FE as Frontend (Admin Panel)
    participant RAG as FastAPI (Knowledge Base)
    participant Embed as Embedding Model (SBERT/OpenAI)
    participant DB as PostgreSQL
    participant VectorDB as ChromaDB

    Curator->>FE: Upload file PDF sách & Bấm "Index Data"
    FE->>RAG: POST /documents/upload (PDF File, book_id)
    
    %% Trả về phản hồi ngay lập tức để không treo giao diện
    RAG-->>FE: 202 Accepted (Đang xử lý ngầm trong Background)
    FE-->>Curator: Hiện thanh tiến trình "Đang xử lý..."

    Note over RAG, VectorDB: Tiến trình xử lý dữ liệu (Background Job)
    RAG->>RAG: 1. Extract Text (Bóc tách chữ)
    RAG->>RAG: 2. Chunking (Cắt text thành các đoạn 512 tokens)

    loop Xử lý từng Chunk văn bản
        RAG->>Embed: Gửi nội dung text để tạo Vector
        Embed-->>RAG: Trả về Embedding Vector [0.12, -0.84, ...]

        RAG->>DB: INSERT INTO document_chunks (Lưu text gốc)
        DB-->>RAG: Trả về chunk_id (Khóa chính)

        RAG->>VectorDB: Lưu Vector + Metadata {chunk_id, book_id}
        VectorDB-->>RAG: Xác nhận lưu thành công
    end
    
    RAG->>DB: UPDATE books SET is_indexed = true WHERE id = book_id
    
    %% Cơ chế Polling để kiểm tra trạng thái
    Note over FE, RAG: FE liên tục gọi API kiểm tra trạng thái mỗi 3 giây (Polling)
    FE->>RAG: GET /documents/status/{book_id}
    RAG-->>FE: 200 OK (Status: COMPLETED)
    FE-->>Curator: Hiển thị thông báo "Đã index xong!"
```

### 2.2. Luồng Hỏi Đáp AI Tích hợp Tìm kiếm (RAG Chat Query)
**Mục đích:** Mô tả cách Chatbot trả lời câu hỏi của User dựa trên nội dung sách (PDF) đã được xử lý ở bước trên.

sequenceDiagram
    autonumber
    actor User as Customer
    participant FE as Frontend (Chat UI)
    participant RAG as FastAPI (Chat Service)
    participant Embed as Embedding Model
    participant VectorDB as ChromaDB
    participant DB as PostgreSQL
    participant LLM as Large Language Model (OpenAI/Gemini)

    User->>FE: Gửi câu hỏi (VD: "Chương 2 sách này nói gì?")
    FE->>RAG: POST /chat/ask {session_id, book_id, message}
    
    RAG->>DB: Lưu tin nhắn của User vào bảng `messages`
    
    Note over RAG, DB: Bước 1: Query & Retrieval (Tìm kiếm ngữ nghĩa)
    RAG->>Embed: Chuyển câu hỏi của User thành Vector (Query Vector)
    Embed-->>RAG: Trả về mảng Float [0.45, 0.11, ...]
    
    RAG->>VectorDB: Semantic Search (Query Vector, filter: book_id, top_k=3)
    VectorDB-->>RAG: Trả về danh sách Top 3 chunk_id & Điểm tương đồng (Similarity Score)
    
    alt Điểm tương đồng quá thấp (Không có thông tin trong sách)
        RAG->>DB: Lưu tin nhắn AI: "Xin lỗi, sách không đề cập đến vấn đề này"
        RAG-->>FE: 200 OK {answer: "Xin lỗi, sách không...", citations: []}
        FE-->>User: Hiển thị thông báo AI không tìm thấy
    else Điểm tương đồng đạt yêu cầu
        RAG->>DB: SELECT content FROM document_chunks WHERE id IN (Top 3 chunk_id)
        DB-->>RAG: Trả về nội dung text thô của 3 đoạn văn
        
        Note over RAG, LLM: Bước 2: Generation (Sinh câu trả lời)
        RAG->>RAG: Ghép Context (3 đoạn văn) + Câu hỏi User thành System Prompt
        RAG->>LLM: Gửi Prompt yêu cầu trả lời BÁM SÁT vào Context
        LLM-->>RAG: Trả về câu trả lời hoàn chỉnh (Text stream)
        
        RAG->>DB: Lưu tin nhắn của AI vào bảng `messages`
        RAG-->>FE: 200 OK {answer, citations: [Top 3 chunk_id]}
        FE-->>User: Hiển thị câu trả lời AI (kèm trích dẫn nguồn)
    end
```
### 3. Admin Workflows (Task 4.3)

#### 3.1. Luồng Quản lý Tồn kho & Đơn hàng (Manage Inventory & Orders)
**Mục đích:** Mô tả cách Admin kiểm tra các đơn hàng mới, cập nhật trạng thái giao hàng và rà soát, nhập thêm số lượng tồn kho của sách.

```mermaid
sequenceDiagram
    autonumber
    actor Admin
    participant FE as Frontend (Admin Dashboard)
    participant API as Node.js Service
    participant DB as PostgreSQL

    %% --- Luồng Xem và Xử lý Đơn hàng (View Orders) ---
    Admin->>FE: Truy cập trang "Quản lý Đơn hàng"
    FE->>API: GET /orders?status=PAID
    API->>DB: SELECT * FROM orders WHERE status = 'PAID'
    DB-->>API: Danh sách đơn hàng đã thanh toán
    API-->>FE: 200 OK (Orders List)
    FE-->>Admin: Hiển thị danh sách cần giao
    
    Admin->>FE: Chọn đơn hàng & Đổi trạng thái thành "SHIPPED"
    FE->>API: PUT /orders/{id}/status {status: "SHIPPED"}
    API->>DB: UPDATE orders SET status = 'SHIPPED' WHERE id = {id}
    DB-->>API: Cập nhật thành công
    API-->>FE: 200 OK
    FE-->>Admin: Thông báo "Đã cập nhật trạng thái giao hàng"

    %% --- Luồng Quản lý Tồn kho (Manage Inventory) ---
    Note over Admin, DB: Luồng Kiểm tra và Nhập thêm sách
    Admin->>FE: Chuyển sang trang "Quản lý Kho" (Inventory)
    
    FE->>API: GET /books?sort=stock_asc
    API->>DB: Query sách sắp hết hàng (availableQty < 10)
    DB-->>API: Danh sách sách cần nhập thêm
    API-->>FE: 200 OK (Low Stock Books)
    FE-->>Admin: Bật cảnh báo các sách sắp hết hàng
    
    Admin->>FE: Bấm "Nhập kho" cho sách ID=5 (Thêm 50 cuốn)
    FE->>API: PUT /books/5 {add_stock: 50}
    API->>DB: UPDATE inventory SET availableQty = availableQty + 50 WHERE bookId = 5
    DB-->>API: Cập nhật thành công
    API-->>FE: 200 OK
    FE-->>Admin: Hiển thị "Cập nhật tồn kho thành công"
```