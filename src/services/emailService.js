const axios = require('axios');

class EmailService {
    /**
     * Gửi email khôi phục mật khẩu qua Resend HTTP API
     * @param {string} toEmail Email người nhận
     * @param {string} resetToken Token khôi phục mật khẩu
     * @param {string} userName Tên người dùng
     */
    static async sendResetPasswordEmail(toEmail, resetToken, userName = 'Thành viên') {
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const resetLink = `${frontendUrl}/reset-password?token=${resetToken}`;
        const fromEmail = process.env.EMAIL_FROM || 'onboarding@resend.dev';
        const apiKey = process.env.RESEND_API_KEY;

        if (!apiKey) {
            console.error('❌ Thiếu cấu hình RESEND_API_KEY trong biến môi trường!');
            throw new Error('Hệ thống chưa được cấu hình khóa gửi email!');
        }

        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <title>Khôi phục mật khẩu</title>
                <style>
                    body {
                        font-family: Georgia, serif;
                        color: #2D3A3A;
                        background-color: #F9F9F6;
                        margin: 0;
                        padding: 0;
                    }
                    .container {
                        max-width: 600px;
                        margin: 40px auto;
                        padding: 40px;
                        background-color: #FFFFFF;
                        border: 1px solid #D5DCD6;
                    }
                    .header {
                        text-align: center;
                        border-bottom: 1px solid #D5DCD6;
                        padding-bottom: 20px;
                        margin-bottom: 30px;
                    }
                    .title {
                        font-size: 24px;
                        text-transform: uppercase;
                        letter-spacing: 0.1em;
                        color: #1A3026;
                        margin: 0;
                    }
                    .content {
                        line-height: 1.8;
                        font-size: 14px;
                    }
                    .greeting {
                        font-weight: bold;
                        margin-bottom: 15px;
                    }
                    .btn-container {
                        text-align: center;
                        margin: 35px 0;
                    }
                    .btn {
                        display: inline-block;
                        background-color: #1A3026;
                        color: #FFFFFF !important;
                        text-decoration: none;
                        padding: 12px 30px;
                        font-size: 12px;
                        font-weight: bold;
                        text-transform: uppercase;
                        letter-spacing: 0.15em;
                        border: none;
                    }
                    .btn:hover {
                        background-color: #2C4A3B;
                    }
                    .warning {
                        font-size: 12px;
                        color: #7A8B7B;
                        border-top: 1px solid #E6ECE7;
                        padding-top: 20px;
                        margin-top: 30px;
                    }
                    .footer {
                        text-align: center;
                        font-size: 11px;
                        color: #A0B2A1;
                        margin-top: 40px;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1 class="title">Smart Digital Library</h1>
                    </div>
                    <div class="content">
                        <p class="greeting">Xin chào ${userName},</p>
                        <p>Chúng tôi đã nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn tại Smart Digital Library.</p>
                        <p>Vui lòng click vào nút bên dưới để tiến hành thiết lập lại mật khẩu mới cho tài khoản của mình. Liên kết này sẽ hết hạn trong vòng <strong>15 phút</strong> vì lý do bảo mật.</p>
                        
                        <div class="btn-container">
                            <a href="${resetLink}" class="btn" target="_blank" style="color: #FFFFFF;">Đặt lại mật khẩu</a>
                        </div>
                        
                        <p>Nếu nút bấm trên không hoạt động, bạn có thể sao chép và dán liên kết dưới đây vào trình duyệt của mình:</p>
                        <p style="word-break: break-all; font-family: monospace; font-size: 12px; color: #5B7262; background: #F3F6F4; padding: 10px; border: 1px solid #E1E8E3; margin-top: 10px; margin-bottom: 10px;">
                            ${resetLink}
                        </p>
                        
                        <p class="warning">
                            <em>* Lưu ý: Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này. Tài khoản của bạn vẫn được bảo mật an toàn.</em>
                        </p>
                    </div>
                    <div class="footer">
                        <p>© 2026 Smart Digital Library (SDL). Mọi quyền được bảo lưu.</p>
                        <p>Địa chỉ: E-Commerce & AI Book Platform</p>
                    </div>
                </div>
            </body>
            </html>
        `;

        try {
            const response = await axios.post('https://api.resend.com/emails', {
                from: `Smart Digital Library <${fromEmail}>`,
                to: toEmail,
                subject: '🔑 Khôi phục mật khẩu tài khoản Smart Digital Library',
                html: htmlContent
            }, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            console.log(`✉️ Email khôi phục mật khẩu đã được gửi qua Resend tới: ${toEmail}`);
            return response.data;
        } catch (error) {
            console.error('❌ Gửi email qua Resend gặp lỗi:', error.response?.data || error.message);
            throw new Error(error.response?.data?.message || 'Không thể gửi email khôi phục mật khẩu lúc này.');
        }
    }
}

module.exports = EmailService;
