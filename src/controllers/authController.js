const AuthService = require('../services/authService');
const AppError = require('../utils/AppError');
const { setRefreshCookie, clearRefreshCookie, readRefreshCookie } = require('../utils/authTokens');

function sessionMeta(req) {
    const userAgent = req.headers['user-agent'];
    return { userAgent: userAgent ? String(userAgent).slice(0, 300) : null };
}

class AuthController {
    // API: Đăng ký tài khoản (POST /api/auth/register)
    static async register(req, res, next) {
        try {
            // Định dạng email / họ tên / độ mạnh mật khẩu đã kiểm ở lược đồ `schemas.auth.register` (B36)
            const { email, password, fullName } = req.body;
            const trimmedEmail = email.trim();
            const trimmedName = fullName.trim();

            // Gọi xuống Service xử lý với dữ liệu đã chuẩn hóa
            const result = await AuthService.register({
                email: trimmedEmail,
                password,
                fullName: trimmedName
            }, sessionMeta(req));

            setRefreshCookie(res, result.refreshToken);
            res.status(201).json({
                message: 'Đăng ký tài khoản thành công!',
                user: result.user,
                token: result.accessToken
            });
        } catch (err) {
            next(err); // Bắt lỗi (VD: Trùng email)
        }
    }

    // API: Đăng nhập (POST /api/auth/login)
    static async login(req, res, next) {
        try {
            const { email, password } = req.body;

            const result = await AuthService.login({ email, password }, sessionMeta(req));

            // Trình duyệt đang giữ phiên cũ (đăng nhập lại): huỷ phiên đó để không bị bỏ mồ côi 7 ngày
            const previousRefresh = readRefreshCookie(req);
            if (previousRefresh) {
                await AuthService.logout(previousRefresh);
            }

            setRefreshCookie(res, result.refreshToken);
            res.status(200).json({
                message: 'Đăng nhập thành công!',
                user: result.user,
                token: result.accessToken
            });
        } catch (err) {
            next(err);
        }
    }

    // API: Đăng nhập bằng Google (POST /api/auth/google) — spec 005. Origin + body đã kiểm tra ở route.
    // Phản hồi và cookie giống hệt /auth/login để giao diện dùng chung một cách lưu phiên.
    static async google(req, res, next) {
        try {
            const result = await AuthService.loginWithGoogle(req.body.credential, sessionMeta(req));

            // Trình duyệt đang giữ phiên khác: huỷ phiên đó (như /auth/login)
            const previousRefresh = readRefreshCookie(req);
            if (previousRefresh) {
                await AuthService.logout(previousRefresh);
            }

            setRefreshCookie(res, result.refreshToken);
            res.status(200).json({
                message: 'Đăng nhập thành công!',
                user: result.user,
                token: result.accessToken
            });
        } catch (err) {
            next(err);
        }
    }

    // API: Gia hạn phiên (POST /api/auth/refresh) — cookie sdl_rt, Origin đã kiểm tra ở route
    static async refresh(req, res, next) {
        try {
            const result = await AuthService.refresh(readRefreshCookie(req), sessionMeta(req));
            if (result.refreshToken) {
                setRefreshCookie(res, result.refreshToken);
            }
            res.status(200).json({ user: result.user, token: result.accessToken });
        } catch (err) {
            if (err instanceof AppError && err.statusCode === 401) {
                clearRefreshCookie(res);
            }
            next(err);
        }
    }

    // API: Đăng xuất thiết bị hiện tại (POST /api/auth/logout)
    static async logout(req, res, next) {
        try {
            await AuthService.logout(readRefreshCookie(req));
            clearRefreshCookie(res);
            res.status(200).json({ message: 'Đã đăng xuất.' });
        } catch (err) {
            next(err);
        }
    }

    // API: Đăng xuất mọi thiết bị (POST /api/auth/logout-all) — cần access token
    static async logoutAll(req, res, next) {
        try {
            await AuthService.logoutAll(req.user.id);
            clearRefreshCookie(res);
            res.status(200).json({ message: 'Đã đăng xuất khỏi mọi thiết bị.' });
        } catch (err) {
            next(err);
        }
    }

    // API: Xem thông tin cá nhân (GET /api/auth/profile)
    static async getProfile(req, res, next) {
        try {
            // Nhờ middleware verifyToken, ta đã có req.user
            res.status(200).json({
                message: 'Lấy thông tin thành công',
                user: req.user
            });
        } catch (err) {
            next(err);
        }
    }

    // API: Yêu cầu khôi phục mật khẩu (POST /api/auth/forgot-password)
    static async forgotPassword(req, res, next) {
        try {
            const { email } = req.body;

            await AuthService.forgotPassword({ email: email.trim() });

            // Cùng một phản hồi dù email có tồn tại hay không (chống dò tài khoản, spec 002 FR-010)
            res.status(200).json({
                message: 'Nếu email tồn tại trong hệ thống, hướng dẫn khôi phục mật khẩu đã được gửi.'
            });
        } catch (err) {
            next(err);
        }
    }

    // API: Đặt lại mật khẩu mới (POST /api/auth/reset-password)
    static async resetPassword(req, res, next) {
        try {
            const { token, newPassword } = req.body; // độ mạnh mật khẩu mới: lược đồ `schemas.auth.resetPassword`

            await AuthService.resetPassword({ token, newPassword });

            res.status(200).json({
                message: 'Đặt lại mật khẩu thành công! Vui lòng đăng nhập bằng mật khẩu mới.'
            });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = AuthController;