-- 1. Tạo bảng Giỏ hàng (Carts) - Mỗi user có 1 giỏ hàng
CREATE TABLE IF NOT EXISTS carts (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tạo bảng Chi tiết Giỏ hàng (Cart Items) - Chứa các cuốn sách trong giỏ
CREATE TABLE IF NOT EXISTS cart_items (
    id SERIAL PRIMARY KEY,
    cart_id INT REFERENCES carts(id) ON DELETE CASCADE,
    book_id INT REFERENCES books(id) ON DELETE CASCADE,
    quantity INT NOT NULL DEFAULT 1,
    price_at_add DECIMAL NOT NULL, -- Lưu lại giá lúc thêm vào giỏ, phòng khi admin đổi giá sách
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(cart_id, book_id) -- Đảm bảo 1 cuốn sách không bị lặp lại nhiều dòng trong 1 giỏ
);

-- 3. Tạo bảng Kho hàng (Inventory) - Tách biệt với bảng books để quản lý chuyên sâu
CREATE TABLE IF NOT EXISTS inventory (
    book_id INT PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
    available_qty INT DEFAULT 0, -- Số lượng có thể bán
    reserved_qty INT DEFAULT 0,  -- Số lượng đang bị "giữ chỗ" chờ thanh toán
    sold_qty INT DEFAULT 0,      -- Số lượng đã bán thành công
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Đổ dữ liệu tồn kho giả định cho cuốn sách Clean Code (ID = 1) mà bạn vừa tạo lúc nãy
-- Giả sử kho đang có 10 cuốn
INSERT INTO inventory (book_id, available_qty) 
VALUES (1, 10) 
ON CONFLICT (book_id) DO NOTHING;

-- 5. Tạo bảng Nhật ký Biến động Kho (Inventory Transactions)
CREATE TABLE IF NOT EXISTS inventory_transactions (
    id SERIAL PRIMARY KEY,
    book_id INT REFERENCES books(id) ON DELETE CASCADE,
    type VARCHAR(50) CHECK (type IN ('STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT', 'RETURN')),
    quantity INT NOT NULL, -- Số lượng thay đổi (dương khi nhập, âm khi xuất)
    previous_qty INT NOT NULL, -- Số lượng có sẵn trước khi đổi
    new_qty INT NOT NULL, -- Số lượng có sẵn sau khi đổi
    reason TEXT, -- Lý do (ví dụ: 'Đơn hàng #102', 'Cập nhật thủ công')
    created_by INT REFERENCES users(id) ON DELETE SET NULL, -- ID của admin/curator thực hiện
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);