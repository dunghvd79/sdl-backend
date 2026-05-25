const app = require('./config/app');
require('./config/database'); // Gọi file này để chạy test kết nối DB

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`🚀 Server đang chạy tại cổng ${PORT}`);
    console.log(`🌍 Môi trường: ${process.env.NODE_ENV}`);
});