flowchart TD
    %% Entity
    User([Khách hàng])
    LLM([Mô hình LLM/Embedding])

    %% Data Stores
    D1[(D1: PostgreSQL - document_chunks)]
    D2[(D2: ChromaDB)]

    %% Processes
    P21((2.1\nTiếp nhận\nCâu hỏi))
    P22((2.2\nTạo\nEmbedding))
    P23((2.3\nTìm kiếm\nNgữ nghĩa))
    P24((2.4\nTrích xuất\nNgữ cảnh))
    P25((2.5\nSinh câu\ntrả lời))

    %% Flows
    User -- "Câu hỏi (Text)" --> P21
    P21 -- "Text thô" --> P22
    
    P22 -- "Gọi API Embedding" --> LLM
    LLM -- "Trả về Vector [0.1, 0.5...]" --> P22
    
    P22 -- "Query Vector" --> P23
    P23 -- "Tìm KNN" --> D2
    D2 -- "Trả về Top 3 chunk_ids" --> P23

    P23 -- "Danh sách chunk_ids" --> P24
    P24 -- "SELECT content" --> D1
    D1 -- "Text các đoạn văn" --> P24

    P24 -- "Context + Câu hỏi" --> P25
    P25 -- "Gửi Prompt" --> LLM
    LLM -- "Trả lời dựa trên sách" --> P25

    P25 -- "Câu trả lời + Trích dẫn" --> User
