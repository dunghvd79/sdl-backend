# 🧠 Thiết kế Vector Database (ChromaDB)

## 1. Collection: `book_chunks`
**Mục đích:** Lưu trữ các vector ngữ nghĩa (embeddings) của các đoạn trích từ sách, phục vụ cho quá trình truy xuất thông tin (Retrieval) của RAG chatbot.

**Cấu trúc dữ liệu của 1 Document trong ChromaDB:**

| Trường (Field) | Kiểu dữ liệu | Ý nghĩa & Ví dụ |
| :--- | :--- | :--- |
| `id` | String | ID duy nhất của chunk (VD: `"book_5_chunk_105"`) |
| `document` | String | Nội dung text thô của đoạn trích (VD: `"Trí tuệ nhân tạo là..."`) |
| `embedding` | List[Float] | Vector nhúng sinh ra từ Embedding Model (VD: `[0.12, -0.45, ...]`) |
| `metadata` | Dictionary | Các thông tin phụ trợ dùng để Filter (Lọc) trước khi tìm kiếm |

**Chi tiết Metadata Dictionary:**
- `book_id` (Int): Mã ID của sách (Liên kết chặt chẽ với bảng `books` trong PostgreSQL).
- `chapter` (String): Tên chương sách (Dùng để hiển thị trích dẫn Citation).
- `chunk_index` (Int): Thứ tự của chunk để biết vị trí tương đối trong sách.

## 2. Chiến lược Chunking (Chunking Strategy)
- **Phương pháp:** Recursive Character Text Splitting (Cắt theo ký tự đệ quy, giữ nguyên cấu trúc đoạn văn).
- **Chunk Size:** 512 tokens (Đảm bảo đủ bối cảnh ngữ nghĩa cho câu hỏi phức tạp).
- **Chunk Overlap:** 50 tokens (Tránh mất mát thông tin ở các điểm cắt).
- **Embedding Model:** Đề xuất sử dụng các model nhẹ và tiếng Việt tốt (như `keepitreal/vietnamese-sbert` hoặc OpenAI `text-embedding-3-small`).