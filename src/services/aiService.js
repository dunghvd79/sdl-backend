// ==========================================
// FILE 1: src/services/aiService.js
// Nhiệm vụ: "Gọi điện" sang cho FastAPI
// ==========================================
const axios = require('axios');
const FormData = require('form-data');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';

class AiService {
    // Hỏi đáp RAG
    static async askQuestion(bookId, question) {
        try {
            const response = await axios.post(`${AI_SERVICE_URL}/api/chat/search`, {
                book_id: bookId.toString(),
                question: question
            });
            return response.data;
        } catch (error) {
            console.error('Lỗi khi gọi sang AI Service:', error.message);
            throw new Error('Hệ thống AI đang bận hoặc mất kết nối, vui lòng thử lại sau.');
        }
    }

    // Upload & vector hóa file PDF cho một cuốn sách
    static async uploadBookPDF(bookId, fileBuffer, originalName) {
        try {
            const formData = new FormData();
            // Đính kèm file PDF vào form data (buffer + tên file gốc)
            formData.append('file', fileBuffer, {
                filename: originalName,
                contentType: 'application/pdf'
            });
            formData.append('book_id', bookId.toString());

            const response = await axios.post(
                `${AI_SERVICE_URL}/api/documents/upload`,
                formData,
                {
                    headers: {
                        ...formData.getHeaders()  // Lấy Content-Type multipart/form-data tự động
                    },
                    maxBodyLength: Infinity,       // Cho phép file lớn
                    timeout: 120000                // Timeout 2 phút cho quá trình vector hóa
                }
            );

            return response.data;
        } catch (error) {
            console.error('Lỗi khi upload PDF sang AI Service:', error.message);
            throw new Error('Không thể tải lên file PDF cho AI Service. ' + (error.response?.data?.detail || error.message));
        }
    }
}

module.exports = AiService;