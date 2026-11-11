// Truy cập bảng refresh_tokens (spec 002, data-model.md). Chỉ lưu băm SHA-256 của token.
const crypto = require('crypto');
const pool = require('../config/database');
const { REFRESH_TOKEN_TTL_MS } = require('../utils/authTokens');

class RefreshToken {
    // Tạo phiên mới (family mới khi familyId không truyền vào)
    static async create(executor, { userId, tokenHash, familyId = crypto.randomUUID(), userAgent = null }) {
        const db = executor || pool;
        const { rows: [row] } = await db.query(
            `INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at, user_agent)
             VALUES ($1, $2, $3, NOW() + ($4 || ' milliseconds')::interval, $5)
             RETURNING *`,
            [userId, tokenHash, familyId, String(REFRESH_TOKEN_TTL_MS), userAgent]
        );
        return row;
    }

    // So sánh thời gian bằng đồng hồ của DB (cột TIMESTAMP không có múi giờ; Node và Postgres có thể
    // chạy múi giờ khác nhau → không so sánh bằng Date của Node).
    static async findByHash(tokenHash, graceMs = 0) {
        const { rows } = await pool.query(
            `SELECT *,
                    expires_at > NOW() AS is_unexpired,
                    revoked_at > NOW() - ($2 || ' milliseconds')::interval AS revoked_within_grace
             FROM refresh_tokens WHERE token_hash = $1`,
            [tokenHash, String(graceMs)]
        );
        return rows[0] || null;
    }

    // Xoay vòng trong một transaction: chỉ thành công nếu token cũ còn hiệu lực ở thời điểm khoá dòng.
    // Trả bản ghi mới, hoặc null nếu token cũ đã bị xoay/huỷ bởi yêu cầu khác.
    static async rotate(oldId, { userId, familyId, newTokenHash, userAgent = null }) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const { rowCount } = await client.query(
                `UPDATE refresh_tokens SET revoked_at = NOW(), revoked_reason = 'rotated'
                 WHERE id = $1 AND revoked_at IS NULL`,
                [oldId]
            );
            if (rowCount === 0) {
                await client.query('ROLLBACK');
                return null;
            }
            const created = await RefreshToken.create(client, { userId, tokenHash: newTokenHash, familyId, userAgent });
            await client.query('COMMIT');
            return created;
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

    // Chuỗi phiên còn ít nhất một token chưa bị huỷ và chưa hết hạn?
    static async hasActiveInFamily(familyId) {
        const { rows } = await pool.query(
            `SELECT 1 FROM refresh_tokens
             WHERE family_id = $1 AND revoked_at IS NULL AND expires_at > NOW() LIMIT 1`,
            [familyId]
        );
        return rows.length > 0;
    }

    static async revokeFamily(familyId, reason) {
        await pool.query(
            `UPDATE refresh_tokens SET revoked_at = NOW(), revoked_reason = $2
             WHERE family_id = $1 AND revoked_at IS NULL`,
            [familyId, reason]
        );
    }

    static async revokeAllForUser(userId, reason) {
        await pool.query(
            `UPDATE refresh_tokens SET revoked_at = NOW(), revoked_reason = $2
             WHERE user_id = $1 AND revoked_at IS NULL`,
            [userId, reason]
        );
    }

    // Xoá bản ghi đã hết hạn quá 1 ngày (chạy định kỳ trong server.js)
    static async deleteExpired() {
        const { rowCount } = await pool.query(
            "DELETE FROM refresh_tokens WHERE expires_at < NOW() - INTERVAL '1 day'"
        );
        return rowCount;
    }
}

module.exports = RefreshToken;
