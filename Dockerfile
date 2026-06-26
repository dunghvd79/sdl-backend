# Sử dụng base image Node.js chính thức bản LTS
FROM node:20-alpine

# Thiết lập thư mục làm việc trong container
WORKDIR /app

# Sao chép các tệp cấu hình package
COPY package*.json ./

# Cài đặt các dependencies
RUN npm ci --only=production

# Sao chép toàn bộ mã nguồn ứng dụng
COPY . .

# Expose cổng chạy mặc định của Express
EXPOSE 3000

# Khởi chạy ứng dụng
CMD ["node", "src/server.js"]
