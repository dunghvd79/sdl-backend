// Truy cập bảng refresh_tokens (spec 002, data-model.md). Chỉ lưu băm SHA-256 của token.
const crypto = require('crypto');
const pool = require('../config/database');
const { REFRESH_TOKEN_TTL_MS } = require('../utils/authTokens');

// Không gian khoá advisory cho thao tác phiên của một user (tránh trùng khoá advisory khác nếu có)
const SESSION_LOCK_NAMESPACE = 2002;

class RefreshToken {
    // Tuần tự hoá mọi thao tác ghi vào phiên của CÙNG một user (xoay vòng, thu hồi, đổi mật khẩu).
    // Không có khoá này, `revokeAllForUser` chạy song song với `rotate` sẽ bỏ sót token mới vừa được
    // chèn (READ COMMITTED: snapshot của câu UPDATE không thấy dòng commit sau khi nó bắt đầu).
    static async lockUser(client, userId) {
        await client.query('SELECT pg_advisory_xact_lock($1, $2)', [SESSION_LOCK_NAMESPACE, userId]);
    }

    // Chạy `work(client)` trong một transaction đã giữ khoá phiên của user
    static async withUserLock(userId, work) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await RefreshToken.lockUser(client, userId);
            const result = await work(client);
            await client.query('COMMIT');
            return result;
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

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
        return RefreshToken.withUserLock(userId, async (client) => {
            const { rowCount } = await client.query(
                `UPDATE refresh_tokens SET revoked_at = NOW(), revoked_reason = 'rotated'
                 WHERE id = $1 AND revoked_at IS NULL`,
                [oldId]
            );
            if (rowCount === 0) return null;
            return RefreshToken.create(client, { userId, tokenHash: newTokenHash, familyId, userAgent });
        });
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
        const { rows } = await pool.query('SELECT user_id FROM refresh_tokens WHERE family_id = $1 LIMIT 1', [familyId]);
        if (rows.length === 0) return;
        await RefreshToken.withUserLock(rows[0].user_id, (client) => client.query(
            `UPDATE refresh_tokens SET revoked_at = NOW(), revoked_reason = $2
             WHERE family_id = $1 AND revoked_at IS NULL`,
            [familyId, reason]
        ));
    }

    // `executor`: client của transaction bên gọi, đã giữ khoá phiên của user (vd đổi mật khẩu)
    static async revokeAllForUser(userId, reason, executor = null) {
        const sql = `UPDATE refresh_tokens SET revoked_at = NOW(), revoked_reason = $2
                     WHERE user_id = $1 AND revoked_at IS NULL`;
        if (executor) {
            await executor.query(sql, [userId, reason]);
            return;
        }
        await RefreshToken.withUserLock(userId, (client) => client.query(sql, [userId, reason]));
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
