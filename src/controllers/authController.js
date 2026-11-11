const AuthService = require('../services/authService');
const AppError = require('../utils/AppError');
const { setRefreshCookie, clearRefreshCookie, readRefreshCookie, validateNewPassword } = require('../utils/authTokens');

function sessionMeta(req) {
    const userAgent = req.headers['user-agent'];
    return { userAgent: userAgent ? String(userAgent).slice(0, 300) : null };
}

class AuthController {
    // API: Đăng ký tài khoản (POST /api/auth/register)
    static async register(req, res, next) {
        try {
            const { email, password, fullName } = req.body;

            // Validate dữ liệu đầu vào
            if (!email || !password || !fullName) {
                return res.status(400).json({ error: 'Vui lòng nhập đầy đủ email, mật khẩu và họ tên!' });
            }

            const trimmedEmail = email.trim();
            const trimmedName = fullName.trim();

            // 1. Kiểm tra Email
            const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
            if (!emailRegex.test(trimmedEmail)) {
                return res.status(400).json({ error: 'Địa chỉ email không hợp lệ (ví dụ: vi-du@email.com)!' });
            }
            if (trimmedEmail.length > 255) {
                return res.status(400).json({ error: 'Email không được dài quá 255 ký tự!' });
            }

            // 2. Kiểm tra Họ và tên
            if (trimmedName.length < 2 || trimmedName.length > 100) {
                return res.status(400).json({ error: 'Họ và tên phải dài từ 2 đến 100 ký tự!' });
            }
            const nameSpecialCharRegex = /[0-9`~!@#$%^&*()_+={}\[\]|\\:;"'<>,.?\/]/;
            if (nameSpecialCharRegex.test(trimmedName)) {
                return res.status(400).json({ error: 'Họ và tên không được chứa số hoặc ký tự đặc biệt!' });
            }

            // 3. Kiểm tra Mật khẩu (chính sách spec 002: ≥ 8 ký tự, có chữ và số)
            const passwordError = validateNewPassword(password);
            if (passwordError) {
                return res.status(400).json({ error: passwordError });
            }

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

            if (!email || !password) {
                return res.status(400).json({ error: 'Vui lòng nhập email và mật khẩu!' });
            }

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
            if (!email) {
                return res.status(400).json({ error: 'Vui lòng cung cấp email!' });
            }

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
            const { token, newPassword } = req.body;
            if (!token || !newPassword) {
                return res.status(400).json({ error: 'Mã xác thực hoặc mật khẩu mới không hợp lệ!' });
            }

            // Kiểm tra tính hợp lệ của mật khẩu mới (chính sách spec 002)
            const passwordError = validateNewPassword(newPassword);
            if (passwordError) {
                return res.status(400).json({ error: passwordError });
            }

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