🏗️ Sơ đồ Triển khai (Deployment Diagram)

Tài liệu này mô tả cấu trúc hạ tầng vật lý / ảo hóa (Infrastructure) để triển khai hệ thống SDL E-commerce & RAG AI, bao gồm cách thiết lập Container, Database và giao tiếp với các dịch vụ bên ngoài.

1. Sơ đồ Triển khai Hạ tầng (Infrastructure Architecture)

Hệ thống được thiết kế theo mô hình Cloud-Native sử dụng Container (Docker) và được đặt trong một Mạng riêng ảo (VPC - Virtual Private Cloud) để đảm bảo bảo mật.

architecture-beta
    group cloud(cloud)[Cloud Provider (AWS/GCP/VPS)]
    group vpc(cloud)[Virtual Private Cloud (VPC)] in cloud
    
    %% Public Subnet
    group public(server)[Public Subnet] in vpc
    service nginx(internet)[Nginx / Load Balancer] in public
    
    %% Private Subnet - App
    group private_app(server)[Private Subnet - App Layer] in vpc
    service nodejs(server)[Node.js (E-commerce)] in private_app
    service fastapi(server)[FastAPI (RAG AI)] in private_app
    
    %% Private Subnet - DB
    group private_db(database)[Private Subnet - Data Layer] in vpc
    service pg(database)[PostgreSQL] in private_db
    service redis(database)[Redis] in private_db
    service chroma(database)[ChromaDB] in private_db
    
    %% External Services
    group external(internet)[External Services]
    service vnpay(internet)[VNPay API] in external
    service openai(internet)[OpenAI API] in external

    %% Connections
    nginx:R --> L:nodejs
    nginx:B --> T:fastapi
    
    nodejs:B --> T:pg
    nodejs:R --> L:redis
    
    fastapi:R --> L:chroma
    fastapi:B --> T:pg
    fastapi:B --> T:redis
    
    nodejs:T --> B:vnpay
    fastapi:T --> B:openai


(Lưu ý: Nếu sơ đồ Architecture ở trên không hiển thị tốt trên một số trình duyệt, bạn có thể tham khảo phiên bản Graph tiêu chuẩn dưới đây)

graph TD
    Client((Clients: Web/Mobile))

    subgraph "Cloud / VPS (Ubuntu)"
        subgraph "Public Network"
            Nginx[Nginx Reverse Proxy\n(Port 80/443)]
        end

        subgraph "Docker Network (Private)"
            NodeApp[Node.js Container\nE-commerce API]
            FastAPIApp[FastAPI Container\nRAG AI Engine]
            
            DB_PG[(PostgreSQL\nContainer)]
            DB_Redis[(Redis\nContainer)]
            DB_Chroma[(ChromaDB\nContainer)]
        end
    end

    subgraph "External Providers"
        VNPay[VNPay Payment Gateway]
        OpenAI[OpenAI / Gemini API]
    end

    %% Routing
    Client -- "HTTPS" --> Nginx
    Nginx -- "/api/v1" --> NodeApp
    Nginx -- "/api/ai" --> FastAPIApp

    %% Internal Connections
    NodeApp -- "TCP/5432" --> DB_PG
    NodeApp -- "TCP/6379" --> DB_Redis
    
    FastAPIApp -- "TCP/5432" --> DB_PG
    FastAPIApp -- "TCP/8000" --> DB_Chroma
    FastAPIApp -- "TCP/6379" --> DB_Redis

    %% External Connections
    NodeApp -- "HTTPS" --> VNPay
    FastAPIApp -- "HTTPS" --> OpenAI


2. Chi tiết Thiết lập (Task 7.3 Details)

2.1. Container / VM Setup

Môi trường Host: Máy chủ Linux ảo (VM) như Ubuntu 22.04 LTS trên AWS EC2 hoặc DigitalOcean Droplet.

Docker hóa (Containerization): - Toàn bộ ứng dụng (Node.js, FastAPI) được đóng gói thành các Docker Image độc lập thông qua Dockerfile.

Quản lý vòng đời và mạng lưới giữa các container bằng docker-compose.yml.

Bảo mật mạng (Network Isolation): Chỉ duy nhất Nginx Container được public cổng 80 (HTTP) và 443 (HTTPS) ra Internet. Các container App và Database chỉ giao tiếp ngầm với nhau qua một Bridge Network nội bộ của Docker.

2.2. Database Setup

PostgreSQL: Chạy trên container riêng, thư mục chứa dữ liệu được mount ra ổ đĩa vật lý của máy host (Docker Volumes) để tránh mất dữ liệu khi container khởi động lại.

Redis: Chạy trên container riêng, được cấu hình cấp phát RAM tối đa (Ví dụ: 1GB) và sử dụng chính sách allkeys-lru để tự động xóa cache cũ khi đầy bộ nhớ.

ChromaDB: Cài đặt thông qua Docker image chính thức (chromadb/chroma). Vector data cũng được mount ra Docker Volume để đảm bảo persistent data (dữ liệu bền vững).

2.3. External Services (Tích hợp Dịch vụ Ngoài)

Các server Backend sẽ mở kết nối Outbound qua giao thức HTTPS (Port 443) ra ngoài Internet để gọi API của VNPay và OpenAI.

Thông tin xác thực (Secret Keys, API Keys của OpenAI, Hash Key của VNPay) TUYỆT ĐỐI KHÔNG hardcode trong source, mà được truyền vào Container thông qua file .env (Environment Variables) trong lúc deploy.