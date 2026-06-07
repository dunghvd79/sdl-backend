// ==========================================
// FILE 2: src/controllers/aiController.js
// Nhiệm vụ: Nhận câu hỏi từ Frontend, kiểm tra, giao cho Service
// ==========================================
const AiService = require('../services/aiService');

class AiController {
    // POST /api/ai/ask
    static async ask(req, res) {
        try {
            let { bookId, question } = req.body;

            if (!bookId || !question) {
                return res.status(400).json({ error: 'Vui lòng cung cấp mã sách (bookId) và câu hỏi (question)!' });
            }

            const { decodeBookId } = require('../utils/hashids');
            const decodedBookId = decodeBookId(bookId);
            if (isNaN(decodedBookId)) {
                return res.status(400).json({ error: 'Mã sách không hợp lệ!' });
            }
            bookId = decodedBookId;

            const pool = require('../config/database');

            // Kiểm tra quyền sở hữu đối với CUSTOMER: Phải mua và được giao thành công (status = 'DELIVERED')
            if (req.user && req.user.role !== 'ADMIN' && req.user.role !== 'CURATOR') {
                const purchaseCheck = await pool.query(
                    `SELECT 1 FROM orders o
                     JOIN order_items oi ON o.id = oi.order_id
                     WHERE o.user_id = $1 AND oi.book_id = $2 AND o.status = 'DELIVERED'`,
                    [req.user.id, bookId]
                );
                if (purchaseCheck.rows.length === 0) {
                    return res.status(403).json({ error: 'Bạn cần mua sách này và đơn hàng được giao thành công để mở khóa tính năng AI Chat!' });
                }
            }

            const result = await AiService.askQuestion(bookId, question);

            // Tự động lưu hội thoại vào cơ sở dữ liệu để quản trị viên / CRM có thể theo dõi trong thời gian thực
            if (req.user) {
                const userId = req.user.id;

                // 1. Tìm hoặc tạo phiên chat cho cặp (user_id, book_id)
                const sessionRes = await pool.query(
                    'SELECT id FROM chat_sessions WHERE user_id = $1 AND book_id = $2 LIMIT 1',
                    [userId, bookId]
                );

                let sessionId;
                if (sessionRes.rows.length > 0) {
                    sessionId = sessionRes.rows[0].id;
                } else {
                    const sessionInsert = await pool.query(
                        'INSERT INTO chat_sessions (user_id, book_id, started_at) VALUES ($1, $2, CURRENT_TIMESTAMP) RETURNING id',
                        [userId, bookId]
                    );
                    sessionId = sessionInsert.rows[0].id;
                }

                // 2. Lưu tin nhắn gửi đi của User
                await pool.query(
                    'INSERT INTO messages (session_id, sender, content, created_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)',
                    [sessionId, 'USER', question.trim()]
                );

                // 3. Lưu câu trả lời từ AI
                const aiAnswerText = result.answer || result.content || (result.error ? `Lỗi dịch vụ AI: ${result.error}` : (typeof result === 'string' ? result : 'Tôi đã tiếp nhận câu hỏi nhưng không tìm thấy câu trả lời phù hợp.'));
                await pool.query(
                    'INSERT INTO messages (session_id, sender, content, created_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)',
                    [sessionId, 'AI', aiAnswerText.trim()]
                );
            }

            res.status(200).json({
                message: 'Thành công',
                data: result
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }

    // GET /api/ai/chats/:bookId/history
    static async getChatHistory(req, res) {
        try {
            let { bookId } = req.params;
            const userId = req.user.id;

            const { decodeBookId } = require('../utils/hashids');
            const decodedBookId = decodeBookId(bookId);
            if (isNaN(decodedBookId)) {
                return res.status(400).json({ error: 'Mã sách không hợp lệ!' });
            }
            bookId = decodedBookId;

            const pool = require('../config/database');

            const sessionRes = await pool.query(
                'SELECT id FROM chat_sessions WHERE user_id = $1 AND book_id = $2 LIMIT 1',
                [userId, bookId]
            );

            if (sessionRes.rows.length === 0) {
                return res.status(200).json({ data: [] });
            }

            const sessionId = sessionRes.rows[0].id;

            const messagesRes = await pool.query(
                'SELECT sender, content, created_at FROM messages WHERE session_id = $1 ORDER BY created_at ASC',
                [sessionId]
            );

            res.status(200).json({ data: messagesRes.rows });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }

    // POST /api/ai/upload/:bookId
    // Nhận file PDF từ Admin -> Forward sang FastAPI để vector hóa
    static async uploadBookPDF(req, res) {
        try {
            let { bookId } = req.params;

            if (!req.file) {
                return res.status(400).json({ error: 'Chưa có file PDF được tải lên!' });
            }

            const { decodeBookId } = require('../utils/hashids');
            const decodedBookId = decodeBookId(bookId);
            if (isNaN(decodedBookId)) {
                return res.status(400).json({ error: 'Mã sách không hợp lệ!' });
            }
            bookId = decodedBookId;

            // Kiểm tra định dạng file (chỉ chấp nhận PDF)
            if (req.file.mimetype !== 'application/pdf') {
                return res.status(400).json({ error: 'Chỉ chấp nhận file định dạng PDF!' });
            }

            console.log(`[Admin] Đang vector hóa sách ID=${bookId}, file: ${req.file.originalname} (${req.file.size} bytes)`);

            const result = await AiService.uploadBookPDF(
                bookId,
                req.file.buffer,
                req.file.originalname
            );

            // ✅ Lưu lại thời điểm vector hóa thành công vào database
            const pool = require('../config/database');
            await pool.query(
                'UPDATE books SET rag_indexed_at = CURRENT_TIMESTAMP WHERE id = $1',
                [bookId]
            );

            res.status(200).json({
                message: `Vector hóa thành công sách ID=${bookId}!`,
                data: result
            });
        } catch (err) {
            console.error('[Admin] Lỗi vector hóa PDF:', err.message);
            res.status(500).json({ error: err.message });
        }
    }
}

module.exports = AiController;