const pool = require('../config/database');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

class UserController {
    // GET /api/users/profile
    static async getProfile(req, res) {
        try {
            const user = await User.findById(req.user.id);
            if (!user) {
                return res.status(404).json({ error: 'Không tìm thấy người dùng' });
            }

            res.status(200).json({ data: user });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // PUT /api/users/profile
    static async updateProfile(req, res) {
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
            res.status(500).json({ error: error.message });
        }
    }

    // PUT /api/users/change-password
    static async changePassword(req, res) {
        try {
            const { currentPassword, newPassword } = req.body;

            if (!currentPassword || !newPassword) {
                return res.status(400).json({ error: 'Vui lòng cung cấp mật khẩu hiện tại và mật khẩu mới' });
            }

            if (newPassword.length < 6) {
                return res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 6 ký tự' });
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

            const updateQuery = 'UPDATE users SET password_hash = $1 WHERE id = $2';
            await pool.query(updateQuery, [newPasswordHash, req.user.id]);

            res.status(200).json({ message: 'Đổi mật khẩu thành công' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = UserController;
