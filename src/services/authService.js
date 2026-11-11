// ==========================================
// FILE 2: src/services/authService.js
// Nhiệm vụ: Chứa Logic nghiệp vụ (Kiểm tra trùng email, Tạo JWT...)
// ==========================================
const crypto = require('crypto');
const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const { signAccessToken, generateRefreshToken, hashToken } = require('../utils/authTokens');
const { queueResetPasswordEmail } = require('../queues/emailQueue');
const AppError = require('../utils/AppError');

// Ân hạn cho refresh token vừa bị xoay: nhiều tab gửi cùng cookie cũ gần như đồng thời (research R4)
const REUSE_GRACE_MS = 30 * 1000;
const REFRESH_INVALID_MESSAGE = 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';

function refreshError(code) {
    return new AppError(REFRESH_INVALID_MESSAGE, 401, code);
}

function publicUser(user) {
    return { id: user.id, email: user.email, fullName: user.full_name, role: user.role };
}

class AuthService {
    // Cấp cặp token cho một thiết bị: access (JWT 15 phút) + refresh (lưu băm, 7 ngày)
    static async issueSession(user, { userAgent = null, familyId } = {}) {
        const refreshToken = generateRefreshToken();
        await RefreshToken.create(null, { userId: user.id, tokenHash: hashToken(refreshToken), familyId, userAgent });
        return { accessToken: signAccessToken(user), refreshToken };
    }

    // Logic Đăng ký
    static async register({ email, password, fullName }, meta = {}) {
        // 1. Kiểm tra xem email đã tồn tại chưa
        const existingUser = await User.findByEmail(email);
        if (existingUser) {
            throw new AppError('Email này đã được đăng ký!', 400);
        }

        // 2. Tạo user mới
        const user = await User.create({ email, password, fullName });

        // 3. Cấp phiên cho thiết bị này
        const { accessToken, refreshToken } = await this.issueSession(user, meta);

        return { user, accessToken, refreshToken };
    }

    // Gia hạn phiên: xoay vòng refresh token, cấp access token mới với role hiện tại (data-model.md)
    static async refresh(rawToken, meta = {}) {
        if (!rawToken) throw refreshError('REFRESH_INVALID');

        const record = await RefreshToken.findByHash(hashToken(rawToken), REUSE_GRACE_MS);
        if (!record || !record.is_unexpired) {
            throw refreshError('REFRESH_INVALID');
        }

        if (record.revoked_at) {
            // Ân hạn chỉ áp dụng khi chuỗi phiên vẫn còn sống (chưa bị đăng xuất / huỷ sau khi xoay)
            const isRecentRotation = record.revoked_reason === 'rotated'
                && record.revoked_within_grace
                && await RefreshToken.hasActiveInFamily(record.family_id);
            if (!isRecentRotation) {
                if (record.revoked_reason === 'rotated') {
                    // Token đã xoay bị dùng lại sau ân hạn: nghi bị đánh cắp → huỷ cả chuỗi phiên
                    await RefreshToken.revokeFamily(record.family_id, 'reuse');
                    throw refreshError('REFRESH_REUSED');
                }
                throw refreshError('REFRESH_INVALID');
            }
        }

        const user = await User.findById(record.user_id);
        if (!user || user.is_active === false) {
            throw refreshError('REFRESH_INVALID');
        }

        if (record.revoked_at) {
            // Yêu cầu đồng thời từ tab khác trong ân hạn: trình duyệt đã có cookie mới, chỉ cấp access token
            return { user: publicUser(user), accessToken: signAccessToken(user), refreshToken: null };
        }

        const newRefreshToken = generateRefreshToken();
        const rotated = await RefreshToken.rotate(record.id, {
            userId: user.id,
            familyId: record.family_id,
            newTokenHash: hashToken(newRefreshToken),
            userAgent: meta.userAgent || null
        });
        if (!rotated) {
            // Token đã bị xoay hoặc thu hồi bởi yêu cầu khác sau khi đọc: đánh giá lại từ đầu
            // (token giờ đã có revoked_at nên lượt sau đi vào nhánh ân hạn / từ chối, không lặp vô hạn)
            return this.refresh(rawToken, meta);
        }
        return { user: publicUser(user), accessToken: signAccessToken(user), refreshToken: newRefreshToken };
    }

    // Đăng xuất thiết bị hiện tại: huỷ cả chuỗi phiên của cookie
    static async logout(rawToken) {
        if (!rawToken) return;
        const record = await RefreshToken.findByHash(hashToken(rawToken));
        if (record) await RefreshToken.revokeFamily(record.family_id, 'logout');
    }

    // Đăng xuất mọi nơi
    static async logoutAll(userId) {
        await RefreshToken.revokeAllForUser(userId, 'logout_all');
    }

    // Logic Đăng nhập
    static async login({ email, password }, meta = {}) {
        // 1. Tìm user bằng email
        const user = await User.findByEmail(email);
        if (!user) {
            throw new AppError('Email hoặc mật khẩu không chính xác!', 401);
        }

        if (user.is_active === false) {
            throw new AppError('Tài khoản của bạn đã bị khóa bởi quản trị viên!', 401);
        }

        // 2. Kiểm tra mật khẩu
        const isPasswordValid = await User.verifyPassword(password, user.password_hash);
        if (!isPasswordValid) {
            throw new AppError('Email hoặc mật khẩu không chính xác!', 401);
        }

        // 3. Đăng nhập thành công -> cấp phiên mới cho thiết bị này (không đá thiết bị khác)
        const { accessToken, refreshToken } = await this.issueSession(user, meta);

        return { user: publicUser(user), accessToken, refreshToken };
    }

    // Logic Quên mật khẩu - Tạo token gửi mail
    // Không báo cho người gọi biết email có tồn tại hay không (spec 002 FR-010): email không tồn tại
    // hoặc gửi mail lỗi đều kết thúc bình thường, lỗi chỉ ghi log.
    static async forgotPassword({ email }) {
        // 1. Tìm user theo email
        const user = await User.findByEmail(email);
        if (!user) return;

        // 2. Tạo token ngẫu nhiên bảo mật (32 bytes = 64 ký tự hex); DB chỉ lưu băm SHA-256
        const token = crypto.randomBytes(32).toString('hex');

        // 3. Thiết lập thời hạn 15 phút
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

        // 4. Lưu băm vào DB
        await User.updateResetToken(user.id, hashToken(token), expiresAt);

        // 5. Gửi mã gốc qua mail (xếp hàng vào hàng đợi BullMQ để xử lý bất đồng bộ)
        try {
            await queueResetPasswordEmail(user.email, token, user.full_name);
        } catch (err) {
            console.error('❌ Không gửi được email khôi phục mật khẩu:', err.message);
        }
    }

    // Logic Đặt lại mật khẩu mới
    static async resetPassword({ token, newPassword }) {
        // 1. Kiểm tra token và hạn dùng
        const user = await User.findByResetToken(hashToken(token));
        if (!user) {
            throw new AppError('Liên kết khôi phục mật khẩu không hợp lệ hoặc đã hết hạn!', 400);
        }

        // 2+3. Cập nhật mật khẩu, xoá mã và huỷ mọi phiên trong CÙNG một giao dịch (có khoá phiên của user):
        // lỗi giữa chừng thì không gì thay đổi và mã đặt lại vẫn dùng lại được.
        const updatedUser = await RefreshToken.withUserLock(user.id, async (client) => {
            const updated = await User.updatePasswordAndClearToken(user.id, newPassword, client);
            await RefreshToken.revokeAllForUser(user.id, 'password', client);
            return updated;
        });

        return { email: updatedUser.email };
    }
}

module.exports = AuthService;