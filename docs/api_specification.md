### 5.3. Example Requests/Responses (Ví dụ minh họa)

**1. API Đăng nhập (POST /auth/login)**
* **Request Body:**
    ```json
    {
      "email": "dung@example.com",
      "password": "securepassword123"
    }
    ```
* **Response (200 OK):**
    ```json
    {
      "success": true,
      "message": "Đăng nhập thành công",
      "data": {
        "accessToken": "eyJhbGciOiJIUzI1NiIsInR5c...",
        "refreshToken": "def456ghi789...",
        "user": { "id": 1, "role": "CUSTOMER" }
      }
    }
    ```

**2. API RAG Chat (POST /chat/ask)**
* **Request Body:**
    ```json
    {
      "book_id": 5,
      "session_id": 102,
      "message": "Tóm tắt chương 2 của cuốn sách này giúp tôi"
    }
    ```
* **Response (200 OK):**
    ```json
    {
      "success": true,
      "message": "Trích xuất AI thành công",
      "data": {
        "answer": "Trong chương 2, tác giả tập trung vào...",
        "citations": ["book_5_chunk_105", "book_5_chunk_106"]
      }
    }
    ```