const pool = require('../config/database');

class NotificationController {
    // GET /api/notifications
    static async getMyNotifications(req, res) {
        try {
            const userId = req.user.id;

            const result = await pool.query(
                'SELECT id, title, content, type, is_read, created_at FROM notifications WHERE user_id = $1 ORDER BY created_at DESC',
                [userId]
            );

            res.status(200).json({ data: result.rows });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // PUT /api/notifications/:id/read
    static async markAsRead(req, res) {
        try {
            const { id } = req.params;
            const userId = req.user.id;

            const result = await pool.query(
                'UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2 RETURNING *',
                [id, userId]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Không tìm thấy thông báo!' });
            }

            res.status(200).json({
                message: 'Đã đánh dấu thông báo là đã đọc!',
                data: result.rows[0]
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // PUT /api/notifications/read-all
    static async markAllAsRead(req, res) {
        try {
            const userId = req.user.id;

            await pool.query(
                'UPDATE notifications SET is_read = TRUE WHERE user_id = $1',
                [userId]
            );

            res.status(200).json({
                message: 'Đã đánh dấu tất cả thông báo là đã đọc!'
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = NotificationController;
