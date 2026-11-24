const pool = require('../config/database');

// Cột của sách trả ra API. Liệt kê rõ thay vì `*`: bỏ cột cũ `stock_quantity` (không còn dùng, luôn 0 — tồn kho thật
// nằm ở bảng inventory, B79). Thêm cột mới vào bảng books thì thêm vào đây nếu muốn trả ra ngoài.
const BOOK_COLUMNS = ['id', 'title', 'author', 'description', 'price', 'isbn', 'cover_url', 'status',
    'is_featured', 'is_bestseller', 'display_order', 'created_at', 'rag_indexed_at'];
const bookColumns = (alias) => BOOK_COLUMNS.map(c => (alias ? `${alias}.${c}` : c)).join(', ');

class Book {
    // 1. Thêm sách mới. `executor`: client của transaction bên gọi (mặc định pool).
    static async create(bookData, executor = pool) {
        const { title, author, isbn, description, price, cover_url, status = 'PUBLISHED', is_featured = false, is_bestseller = false, display_order = 0 } = bookData;

        const query = `
      INSERT INTO books (title, author, isbn, description, price, cover_url, status, is_featured, is_bestseller, display_order)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING ${bookColumns()}
    `;
        const result = await executor.query(query, [title, author, isbn, description, price, cover_url || null, status, is_featured, is_bestseller, display_order]);
        return result.rows[0];
    }

    // Sửa thông tin sách; không có sách → null.
    static async update(id, bookData, executor = pool) {
        const { title, author, isbn, description, price, cover_url, status, is_featured, is_bestseller, display_order } = bookData;
        const query = `
            UPDATE books
            SET title = $1, author = $2, isbn = $3, description = $4, price = $5, cover_url = $6, status = $7, is_featured = $8, is_bestseller = $9, display_order = $10
            WHERE id = $11
            RETURNING ${bookColumns()}
        `;
        const result = await executor.query(query, [title, author, isbn || null, description || null, price, cover_url || null, status, is_featured, is_bestseller, display_order, id]);
        return result.rows[0] || null;
    }

    // Thay toàn bộ danh mục của sách (gọi trong transaction: mã danh mục sai → lỗi FK → ROLLBACK cả lần sửa).
    static async replaceCategories(bookId, categoryIds, executor = pool) {
        await executor.query('DELETE FROM book_categories WHERE book_id = $1', [bookId]);
        for (const categoryId of categoryIds) {
            await this.addCategory(bookId, categoryId, executor);
        }
    }

    // Thêm ảnh chi tiết phụ (bỏ qua phần tử không có image_url).
    static async addImages(bookId, images, executor = pool) {
        for (const img of images) {
            if (img.image_url) {
                await executor.query(
                    'INSERT INTO book_images (book_id, image_url, display_order) VALUES ($1, $2, $3)',
                    [bookId, img.image_url, parseInt(img.display_order) || 0]
                );
            }
        }
    }

    // Thay toàn bộ ảnh chi tiết phụ của sách.
    static async replaceImages(bookId, images, executor = pool) {
        await executor.query('DELETE FROM book_images WHERE book_id = $1', [bookId]);
        await this.addImages(bookId, images, executor);
    }

    // Lấy chi tiết 1 cuốn sách theo ID
    static async findById(id) {
        const query = `
            SELECT ${bookColumns('b')},
                   (COALESCE(i.available_qty, 0) - COALESCE(i.reserved_qty, 0)) as available_qty,
                   COALESCE(i.reserved_qty, 0) as reserved_qty,
                   (
                       SELECT COALESCE(json_agg(json_build_object('id', cat.id, 'name', cat.name)), '[]')
                       FROM book_categories bcat
                       JOIN categories cat ON bcat.category_id = cat.id
                       WHERE bcat.book_id = b.id
                   ) as categories,
                   (
                       SELECT COALESCE(json_agg(json_build_object('id', bi.id, 'image_url', bi.image_url, 'display_order', bi.display_order) ORDER BY bi.display_order ASC), '[]')
                       FROM book_images bi
                       WHERE bi.book_id = b.id
                   ) as images
            FROM books b
            LEFT JOIN inventory i ON b.id = i.book_id
            WHERE b.id = $1
        `;
        const result = await pool.query(query, [id]);
        return result.rows[0] || null;
    }

    // Tên, giá và số còn bán được của nhiều sách trong MỘT câu (B85: thay vì findById + checkAvailability từng món).
    // Trả Map id → { id, title, price, sellable_qty }; sách không tồn tại thì không có trong Map.
    static async findForCart(bookIds) {
        const { rows } = await pool.query(
            `SELECT b.id, b.title, b.price,
                    COALESCE(i.available_qty, 0) - COALESCE(i.reserved_qty, 0) AS sellable_qty
             FROM books b
             LEFT JOIN inventory i ON i.book_id = b.id
             WHERE b.id = ANY($1::int[])`,
            [bookIds]
        );
        return new Map(rows.map(row => [row.id, row]));
    }

    // 2. Thêm danh mục cho sách (Lưu vào bảng trung gian N:M)
    static async addCategory(bookId, categoryId, executor = pool) {
        const query = `
      INSERT INTO book_categories (book_id, category_id)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING -- Tránh lỗi nếu đã có sẵn
      RETURNING *
    `;
        const result = await executor.query(query, [bookId, categoryId]);
        return result.rows[0];
    }

    // 3. Lấy danh sách sách (Có phân trang và tìm kiếm cơ bản, lọc danh mục, sắp xếp)
    // adminMode = true: lấy tất cả trạng thái; adminMode = false: chỉ lấy PUBLISHED
    static async getAll({ limit = 10, offset = 0, search = '', categoryId, sortBy = 'newest', maxPrice, adminMode = false, isFeatured }) {
        let query = `
      SELECT ${bookColumns('b')},
             (COALESCE(i.available_qty, 0) - COALESCE(i.reserved_qty, 0)) as available_qty,
             COALESCE(i.reserved_qty, 0) as reserved_qty,
             -- Gom các danh mục của sách này thành một mảng JSON dùng subquery để tránh lỗi GROUP BY của PostgreSQL
             (
                 SELECT COALESCE(json_agg(json_build_object('id', cat.id, 'name', cat.name)), '[]')
                 FROM book_categories bcat
                 JOIN categories cat ON bcat.category_id = cat.id
                 WHERE bcat.book_id = b.id
             ) as categories,
             (
                 SELECT COALESCE(json_agg(json_build_object('id', bi.id, 'image_url', bi.image_url, 'display_order', bi.display_order) ORDER BY bi.display_order ASC), '[]')
                 FROM book_images bi
                 WHERE bi.book_id = b.id
             ) as images
      FROM books b
      LEFT JOIN inventory i ON b.id = i.book_id
    `;

        const params = [];
        const whereConditions = [];
        let tsQuery = null;

        // Nếu có từ khóa tìm kiếm
        if (search) {
            const cleanSearch = search.trim();
            // Tách các từ, giữ lại ký tự chữ tiếng Việt và số
            const terms = cleanSearch
                .split(/\s+/)
                .map(t => t.replace(/[^a-zA-Z0-9À-ỹ]/g, ''))
                .filter(t => t.length > 0);

            if (terms.length > 0) {
                // Biến đổi thành prefix match tsquery: 'term1:* & term2:*'
                tsQuery = terms.map(t => `${t}:*`).join(' & ');
                params.push(tsQuery);
                whereConditions.push(`to_tsvector('simple', immutable_unaccent(b.title) || ' ' || immutable_unaccent(b.author) || ' ' || immutable_unaccent(COALESCE(b.description, ''))) @@ to_tsquery('simple', immutable_unaccent($${params.length}))`);
            }
        }

        // Lọc theo danh mục
        if (categoryId) {
            params.push(categoryId);
            // Dùng IN query để lọc các sách có chứa categoryId này
            whereConditions.push(`b.id IN (SELECT book_id FROM book_categories WHERE category_id = $${params.length})`);
        }

        // Lọc theo giá tối đa
        if (maxPrice) {
            params.push(maxPrice);
            whereConditions.push(`b.price <= $${params.length}`);
        }

        // Lọc theo nổi bật (Editor's Pick)
        if (isFeatured !== undefined && isFeatured !== '') {
            params.push(isFeatured === 'true' || isFeatured === true);
            whereConditions.push(`b.is_featured = $${params.length}`);
        }

        // Lọc trạng thái: Storefront chỉ lấy PUBLISHED, Admin lấy tất cả
        if (!adminMode) {
            whereConditions.push(`b.status = 'PUBLISHED'`);
        }

        if (whereConditions.length > 0) {
            query += ` WHERE ${whereConditions.join(' AND ')}`;
        }

        // Sắp xếp
        if (sortBy === 'oldest') {
            query += ` ORDER BY b.created_at ASC`;
        } else if (sortBy === 'price_asc') {
            query += ` ORDER BY b.price ASC`;
        } else if (sortBy === 'price_desc') {
            query += ` ORDER BY b.price DESC`;
        } else if (tsQuery) {
            // Ưu tiên độ tương đồng (ranking) khi tìm kiếm, sau đó mới tới thứ tự hiển thị và thời gian tạo
            query += ` ORDER BY ts_rank(to_tsvector('simple', immutable_unaccent(b.title) || ' ' || immutable_unaccent(b.author) || ' ' || immutable_unaccent(COALESCE(b.description, ''))), to_tsquery('simple', immutable_unaccent($${params.indexOf(tsQuery) + 1}))) DESC, b.display_order DESC, b.created_at DESC`;
        } else {
            // newest is default: prioritize display_order first, then newest created_at
            query += ` ORDER BY b.display_order DESC, b.created_at DESC`;
        }

        params.push(limit, offset);
        query += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

        const result = await pool.query(query, params);
        return result.rows;
    }
}

module.exports = Book