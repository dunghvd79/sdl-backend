const pool = require('../config/database');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const AuthService = require('../services/authService');
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
            const { full_name, phone, address } = req.body;
            
            if (!full_name || full_name.trim() === '') {
                return res.status(400).json({ error: 'Họ tên không được để trống' });
            }

            if (phone && phone.trim() !== '') {
                const phoneRegex = /^(0|\+84)[3|5|7|8|9][0-9]{8}$/;
                if (!phoneRegex.test(phone.trim().replace(/\s+/g, ''))) {
                    return res.status(400).json({ error: 'Số điện thoại không hợp lệ (ví dụ: 0987654321)' });
                }
            }

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

            // 2. Kiểm tra mật khẩu hiện tại
            const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);
            if (!isValidPassword) {
                return res.status(401).json({ error: 'Mật khẩu hiện tại không đúng' });
            }

            // 3. Cập nhật mật khẩu mới
            const saltRounds = 10;
            const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

            // 4. Đổi mật khẩu + huỷ mọi phiên trong cùng một giao dịch (spec 002 FR-009)
            await RefreshToken.withUserLock(req.user.id, async (client) => {
                await client.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newPasswordHash, req.user.id]);
                await RefreshToken.revokeAllForUser(req.user.id, 'password', client);
            });

            // 5. Cấp phiên mới cho thiết bị đang đổi mật khẩu
            const userAgent = req.headers['user-agent'] ? String(req.headers['user-agent']).slice(0, 300) : null;
            const { accessToken, refreshToken } = await AuthService.issueSession(req.user, { userAgent });
            setRefreshCookie(res, refreshToken);

            res.status(200).json({ message: 'Đổi mật khẩu thành công', token: accessToken });
        } catch (error) {
            next(error);
        }
    }
}

module.exports = UserController;
