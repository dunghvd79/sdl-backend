🧩 Sơ đồ Thành phần Kiến trúc (Component Diagram)

Tài liệu này mô tả các thành phần phần mềm của hệ thống E-commerce tích hợp RAG AI, các module nội bộ của từng dịch vụ, và các điểm tích hợp với bên thứ ba (Integration points).

1. Sơ đồ Thành phần Tổng thể

Sơ đồ dưới đây thể hiện sự tương tác giữa Client, API Gateway, các Microservices và Database.

graph TD
    subgraph ClientLayer [1. Client Layer]
        WebApp[Web / Mobile App]
        AdminUI[Admin Dashboard]
    end

    subgraph APIGateway [2. API Gateway]
        Nginx[Nginx / Load Balancer]
    end

    subgraph NodeService [3. Node.js Service (E-commerce)]
        AuthComp[Authentication & JWT]
        CatalogComp[Book Catalog & Inventory]
        OrderComp[Order & Checkout]
    end

    subgraph FastAPIService [4. FastAPI Service (RAG AI)]
        DocProcessor[Document Processor & Chunking]
        EmbedEngine[Embedding Engine]
        ChatEngine[LLM Chat Engine]
    end

    subgraph DataLayer [5. Data Layer]
        PG[(PostgreSQL<br/>Core Data)]
        Redis[(Redis<br/>Cache & Session)]
        Chroma[(ChromaDB<br/>Vector Store)]
    end

    subgraph External [6. External Services / 3rd Party]
        VNPay[VNPay Payment Gateway]
        LLM[OpenAI / Gemini API]
    end

    %% --- Connections & Dependencies ---
    WebApp -->|HTTPS| Nginx
    AdminUI -->|HTTPS| Nginx

    Nginx -->|Routing /api/v1| NodeService
    Nginx -->|Routing /api/ai| FastAPIService

    %% Node.js dependencies
    AuthComp -.->|Read/Write| PG
    AuthComp -.->|Blacklist/Session| Redis
    CatalogComp -.->|Read/Write| PG
    CatalogComp -.->|Cache| Redis
    OrderComp -.->|Transaction| PG
    OrderComp -->|REST API| VNPay

    %% FastAPI dependencies
    DocProcessor -.->|Save Text| PG
    DocProcessor -->|Send chunks| EmbedEngine
    EmbedEngine -.->|Store Vectors| Chroma
    ChatEngine -.->|Semantic Search| Chroma
    ChatEngine -->|Prompt| LLM


2. Chi tiết các Thành phần (Components & Services)

2.1. Client Layer

Web/Mobile App: Giao diện cho Customer (Người mua hàng). Xây dựng bằng React/Vue (Web) hoặc Flutter/React Native (Mobile).

Admin Dashboard: Giao diện quản trị cho Admin và Curator.

2.2. API Gateway (Nginx)

Đóng vai trò là cửa ngõ duy nhất (Single entry-point) của hệ thống.

Làm nhiệm vụ Reverse Proxy: Điều hướng /api/v1/* sang Node.js và /api/ai/* sang FastAPI.

Xử lý SSL Termination và Rate Limiting.

2.3. Node.js Service (E-commerce Core)

Authentication: Module cấp phát, xác thực JWT và phân quyền (RBAC).

Catalog & Inventory: Quản lý danh mục sách, giữ kho (Hold/Release) và xử lý giỏ hàng.

Order & Checkout: Quản lý luồng tạo đơn hàng và thanh toán.

2.4. FastAPI Service (RAG AI Core)

Document Processor: Chịu trách nhiệm nhận file PDF, bóc tách text và cắt nhỏ (Chunking).

Embedding Engine: Biến đổi text thành các Vector.

LLM Chat Engine: Ghép nối context (Retrieval), xây dựng Prompt và giao tiếp với mô hình AI.

3. Các Điểm tích hợp (Integration Points)

Hệ thống có 2 điểm phụ thuộc lớn vào dịch vụ bên ngoài (External Dependencies):

VNPay Gateway: * Giao thức: REST API / Redirect.

Nhiệm vụ: Xử lý thanh toán. Node.js Service sẽ gọi VNPay để tạo URL thanh toán, sau đó VNPay gọi ngược lại Server qua một Webhook (IPN) để xác nhận trạng thái tiền.

OpenAI / Gemini API:

Giao thức: REST API / gRPC.

Nhiệm vụ: Cung cấp Embedding Model (VD: text-embedding-3-small) để tạo Vector và LLM (VD: gpt-4o) để sinh câu trả lời trong luồng Chat.