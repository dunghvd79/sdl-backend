const pool = require('../config/database');

class Book {
    // 1. Thêm sách mới
    static async create(bookData) {
        const { title, author, isbn, description, price, cover_url, status = 'PUBLISHED', is_featured = false, is_bestseller = false, display_order = 0 } = bookData;

        const query = `
      INSERT INTO books (title, author, isbn, description, price, cover_url, status, is_featured, is_bestseller, display_order)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;
        const result = await pool.query(query, [title, author, isbn, description, price, cover_url || null, status, is_featured, is_bestseller, display_order]);
        return result.rows[0];
    }

    // Lấy chi tiết 1 cuốn sách theo ID
    static async findById(id) {
        const query = `
            SELECT b.*, 
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

    // 2. Thêm danh mục cho sách (Lưu vào bảng trung gian N:M)
    static async addCategory(bookId, categoryId) {
        const query = `
      INSERT INTO book_categories (book_id, category_id)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING -- Tránh lỗi nếu đã có sẵn
      RETURNING *
    `;
        const result = await pool.query(query, [bookId, categoryId]);
        return result.rows[0];
    }

    // 3. Lấy danh sách sách (Có phân trang và tìm kiếm cơ bản, lọc danh mục, sắp xếp)
    // adminMode = true: lấy tất cả trạng thái; adminMode = false: chỉ lấy PUBLISHED
    static async getAll({ limit = 10, offset = 0, search = '', categoryId, sortBy = 'newest', maxPrice, adminMode = false, isFeatured }) {
        let query = `
      SELECT b.*, 
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

        // Nếu có từ khóa tìm kiếm
        if (search) {
            params.push(`%${search}%`);
            whereConditions.push(`(b.title ILIKE $${params.length} OR b.author ILIKE $${params.length})`);
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
        if (isFeatured !== undefined) {
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