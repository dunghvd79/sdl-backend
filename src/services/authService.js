// ==========================================
// FILE 2: src/services/authService.js
// Nhiệm vụ: Chứa Logic nghiệp vụ (Kiểm tra trùng email, Tạo JWT...)
// ==========================================
const crypto = require('crypto');
const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const { signAccessToken, generateRefreshToken, hashToken } = require('../utils/authTokens');
const { queueResetPasswordEmail } = require('../queues/emailQueue');
const { verifyGoogleIdToken } = require('./googleIdentity');
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

const ACCOUNT_LOCKED_MESSAGE = 'Tài khoản của bạn đã bị khóa bởi quản trị viên!';
function accountLockedError() {
    return new AppError(ACCOUNT_LOCKED_MESSAGE, 401);
}
// Lỗi xác minh Google → câu tiếng Việt cố định + mã cho giao diện (contracts/auth-google-api.md).
// Không bao giờ chuyển tiếp thông báo gốc (có thể chứa token). Lỗi lạ → để errorHandler trả 500 chung.
const GOOGLE_ERRORS = {
    GOOGLE_TOKEN_INVALID: [401, 'Không xác minh được tài khoản Google. Vui lòng thử lại.'],
    GOOGLE_NOT_CONFIGURED: [503, 'Đăng nhập bằng Google chưa được bật.'],
    GOOGLE_UNAVAILABLE: [503, 'Không kết nối được Google, vui lòng thử lại sau.']
};
function googleAppError(err) {
    const mapped = GOOGLE_ERRORS[err && err.code];
    return mapped ? new AppError(mapped[1], mapped[0], err.code) : err;
}

// Google chỉ là bên quản lý hộp thư với Gmail và tài khoản Workspace (token có `hd`) — theo tài liệu Google
// "Verify the Google ID token": ngoài hai trường hợp này, email_verified không chứng minh quyền hiện tại.
const GOOGLE_MAIL_DOMAINS = ['gmail.com', 'googlemail.com'];
function googleOwnsMailbox(email, hd) {
    return GOOGLE_MAIL_DOMAINS.includes(email.split('@')[1]) || Boolean(hd);
}
function googleLinkNotAllowedError() {
    return new AppError('Email này đã có tài khoản. Vui lòng đăng nhập bằng email và mật khẩu.', 409, 'GOOGLE_LINK_NOT_ALLOWED');
}

function googleEmailLinkedError() {
    return new AppError('Email này đã được liên kết với một tài khoản Google khác.', 409, 'GOOGLE_EMAIL_LINKED');
}

// Họ tên lấy từ Google một lần khi tạo tài khoản: rỗng → phần trước @ của email; tối đa 100 ký tự
const MAX_FULL_NAME_LENGTH = 100;
function googleFullName({ name, email }) {
    const fullName = (name || '').trim() || email.split('@')[0];
    return fullName.slice(0, MAX_FULL_NAME_LENGTH);
}

class AuthService {
    // Cấp cặp token cho một thiết bị: access (JWT 15 phút) + refresh (lưu băm, 7 ngày)
    // `client`: transaction của bên gọi (khi cần cấp phiên trong khoá phiên của user)
    static async issueSession(user, { userAgent = null, familyId } = {}, client = null) {
        const refreshToken = generateRefreshToken();
        await RefreshToken.create(client, { userId: user.id, tokenHash: hashToken(refreshToken), familyId, userAgent });
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

        // Cùng dạng user với đăng nhập: giao diện dùng thẳng response này, không gọi thêm /auth/login (B57)
        return { user: publicUser(user), accessToken, refreshToken };
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

        // 2. Kiểm tra mật khẩu. Tài khoản chỉ dùng Google không có mật khẩu (spec 005): báo đúng câu sai mật khẩu
        // (không lộ tài khoản dùng Google) và không đưa NULL vào bcrypt (bcryptjs ném lỗi → 500).
        const isPasswordValid = user.password_hash
            ? await User.verifyPassword(password, user.password_hash)
            : false;
        if (!isPasswordValid) {
            throw new AppError('Email hoặc mật khẩu không chính xác!', 401);
        }

        // 3. Cấp phiên trong khoá phiên của user, sau khi đọc lại mật khẩu: bcrypt chạy ngoài khoá, trong lúc
        // đó liên kết Google (spec 005) hay đổi mật khẩu có thể đã huỷ mật khẩu cũ + mọi phiên → không cấp nữa.
        const { accessToken, refreshToken } = await RefreshToken.withUserLock(user.id, async (client) => {
            const { rows: [current] } = await client.query(
                'SELECT password_hash, is_active FROM users WHERE id = $1', [user.id]
            );
            if (!current || current.password_hash !== user.password_hash) {
                throw new AppError('Email hoặc mật khẩu không chính xác!', 401);
            }
            if (current.is_active === false) throw accountLockedError();
            return this.issueSession(user, meta, client);
        });

        return { user: publicUser(user), accessToken, refreshToken };
    }

    // Spec 005 — Đăng nhập bằng Google: xác minh ID token → tìm / tạo tài khoản → cấp phiên như đăng nhập thường
    static async loginWithGoogle(credential, meta = {}) {
        let identity;
        try {
            identity = await verifyGoogleIdToken(credential);
        } catch (err) {
            throw googleAppError(err);
        }

        const user = await this._resolveGoogleUser(identity);
        if (user.is_active === false) throw accountLockedError();

        const { accessToken, refreshToken } = await this.issueSession(user, meta);
        return { user: publicUser(user), accessToken, refreshToken };
    }

    // Nhận diện theo sub (research R3) → chưa có thì theo email để liên kết (R4) → không có thì tạo mới.
    // Hai request đồng thời cùng tạo một người: ràng buộc UNIQUE chặn bản thứ hai (23505) → tra lại một lần (R5).
    static async _resolveGoogleUser(identity, { retried = false } = {}) {
        const bySub = await User.findByGoogleSub(identity.sub);
        if (bySub) return bySub;

        const byEmail = await User.findByEmail(identity.email);
        if (byEmail) return this._linkGoogleAccount(byEmail, identity);

        try {
            return await User.createFromGoogle({
                sub: identity.sub,
                email: identity.email,
                fullName: googleFullName(identity)
            });
        } catch (err) {
            if (err.code === '23505' && !retried) {
                return this._resolveGoogleUser(identity, { retried: true });
            }
            throw err;
        }
    }

    // Liên kết Google vào tài khoản có sẵn cùng email (research R4): một transaction có khoá theo user —
    // huỷ mật khẩu + mã đặt lại (linkGoogle) và thu hồi mọi phiên cũ cùng lúc.
    static async _linkGoogleAccount(account, { sub, email, hd }) {
        if (account.google_sub && account.google_sub !== sub) throw googleEmailLinkedError();
        // FR-005a: chỉ tin email_verified khi Google là bên quản lý hộp thư; tài khoản Google tạo bằng email ngoài
        // có thể thuộc người TỪNG giữ email đó → không cho chiếm tài khoản đang có
        if (!googleOwnsMailbox(email, hd)) throw googleLinkNotAllowedError();
        if (account.is_active === false) throw accountLockedError();

        const linked = await RefreshToken.withUserLock(account.id, async (client) => {
            const updated = await User.linkGoogle(client, account.id, sub);
            if (updated) await RefreshToken.revokeAllForUser(account.id, 'google_link', client);
            return updated;
        });
        if (linked) return linked;

        // Request khác vừa liên kết trước (UPDATE có điều kiện không khớp): cùng sub thì dùng tiếp, khác thì từ chối
        const current = await User.findByGoogleSub(sub);
        if (current && current.id === account.id) return current;
        throw googleEmailLinkedError();
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