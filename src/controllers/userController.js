const pool = require('../config/database');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const AuthService = require('../services/authService');
const AppError = require('../utils/AppError');
const { setRefreshCookie, validateNewPassword } = require('../utils/authTokens');

class UserController {
    // GET /api/users/profile
    static async getProfile(req, res, next) {
        try {
            const user = await User.findById(req.user.id);
            if (!user) {
                return res.status(404).json({ error: 'Không tìm thấy người dùng' });
            }

            res.status(200).json({ data: user });
        } catch (error) {
            next(error);
        }
    }

    // PUT /api/users/profile
    static async updateProfile(req, res, next) {
        try {
            // Dữ liệu đã được kiểm tra định dạng bởi validate(schemas.user.updateProfile) ở route.
            const { full_name, phone, address } = req.body;

            const updatedUser = await User.updateProfileAndAddress(req.user.id, {
                fullName: full_name.trim(),
                phone: phone ? phone.trim() : null,
                address: address ? address.trim() : null
            });

            res.status(200).json({ 
                message: 'Cập nhật thông tin thành công',
                data: updatedUser 
            });
        } catch (error) {
            next(error);
        }
    }

    // PUT /api/users/change-password
    static async changePassword(req, res, next) {
        try {
            const { currentPassword, newPassword } = req.body;

            if (!currentPassword || !newPassword) {
                return res.status(400).json({ error: 'Vui lòng cung cấp mật khẩu hiện tại và mật khẩu mới' });
            }

            const passwordError = validateNewPassword(newPassword);
            if (passwordError) {
                return res.status(400).json({ error: passwordError });
            }

            // 1. Lấy user để lấy mật khẩu đã mã hóa
            const userQuery = 'SELECT password_hash FROM users WHERE id = $1';
            const userResult = await pool.query(userQuery, [req.user.id]);

            if (userResult.rows.length === 0) {
                return res.status(404).json({ error: 'Không tìm thấy người dùng' });
            }

            const user = userResult.rows[0];

            // Tài khoản chỉ dùng Google chưa có mật khẩu (spec 005): không có "mật khẩu hiện tại" để kiểm tra
            if (!user.password_hash) {
                return res.status(400).json({ error: 'Tài khoản của bạn chưa có mật khẩu. Hãy dùng "Quên mật khẩu" để tạo mật khẩu.' });
            }

            // 2. Kiểm tra mật khẩu hiện tại
            const isValidPassword = await User.verifyPassword(currentPassword, user.password_hash);
            if (!isValidPassword) {
                return res.status(401).json({ error: 'Mật khẩu hiện tại không đúng' });
            }

            // 3. Cập nhật mật khẩu mới
            const saltRounds = 10;
            const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

            // 4+5. Trong khoá phiên của user: chỉ đổi khi mật khẩu vẫn là cái vừa kiểm tra (bcrypt chạy ngoài khoá —
            // liên kết Google / đổi mật khẩu khác có thể đã chen vào, spec 005), huỷ mọi phiên (spec 002 FR-009),
            // rồi cấp phiên mới cho thiết bị này trong CÙNG giao dịch để không thao tác nào chen vào giữa.
            const userAgent = req.headers['user-agent'] ? String(req.headers['user-agent']).slice(0, 300) : null;
            const { accessToken, refreshToken } = await RefreshToken.withUserLock(req.user.id, async (client) => {
                const updated = await client.query(
                    'UPDATE users SET password_hash = $1 WHERE id = $2 AND password_hash = $3',
                    [newPasswordHash, req.user.id, user.password_hash]
                );
                if (updated.rowCount === 0) throw new AppError('Mật khẩu hiện tại không đúng', 401);
                await RefreshToken.revokeAllForUser(req.user.id, 'password', client);
                return AuthService.issueSession(req.user, { userAgent }, client);
            });
            setRefreshCookie(res, refreshToken);

            res.status(200).json({ message: 'Đổi mật khẩu thành công', token: accessToken });
        } catch (error) {
            next(error);
        }
    }
}

module.exports = UserController;
