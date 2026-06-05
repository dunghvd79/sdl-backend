const ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

// Tạo alphabet xáo trộn độc lập bằng Fisher-Yates + LCG dựa trên muối (salt) tương ứng
function getShuffledAlphabet(salt) {
  let alphabetArr = ALPHABET.split('');
  
  // Hash chuỗi salt thành số seed 32-bit
  let seed = 0;
  for (let i = 0; i < salt.length; i++) {
    seed = (seed << 5) - seed + salt.charCodeAt(i);
    seed |= 0; // Convert to 32bit integer
  }
  
  // Hàm sinh số ngẫu nhiên LCG (Linear Congruential Generator)
  function random() {
    seed = (seed * 1664525 + 1013904223) | 0;
    return (seed >>> 0) / 4294967296;
  }
  
  // Fisher-Yates Shuffle
  for (let i = alphabetArr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const temp = alphabetArr[i];
    alphabetArr[i] = alphabetArr[j];
    alphabetArr[j] = temp;
  }
  
  return alphabetArr.join('');
}

const alphabets = {
  books: getShuffledAlphabet('smart_digital_library_books_salt_2026'),
  orders: getShuffledAlphabet('smart_digital_library_orders_salt_2026'),
  articles: getShuffledAlphabet('smart_digital_library_articles_salt_2026')
};

// Sử dụng các offset lớn để đảm bảo độ dài tối thiểu của chuỗi mã hóa (Books/Articles: 5 ký tự, Orders: 6 ký tự)
const OFFSETS = {
  books: 1000000,      // Đảm bảo tối thiểu 5 ký tự
  articles: 1000000,   // Đảm bảo tối thiểu 5 ký tự
  orders: 400000000    // Đảm bảo tối thiểu 6 ký tự
};

// Hàm mã hóa chung sang cơ số 52 (chỉ gồm chữ cái để tránh trùng lặp với số nguyên gốc)
function encode(num, type) {
  if (num === undefined || num === null) return '';
  const parsed = parseInt(num);
  if (isNaN(parsed) || parsed < 0) return '';
  
  const offset = OFFSETS[type] || 0;
  const nToEncode = parsed + offset;
  
  const shuffled = alphabets[type] || ALPHABET;
  let n = nToEncode;
  let result = '';
  const base = shuffled.length;
  
  do {
    result = shuffled[n % base] + result;
    n = Math.floor(n / base);
  } while (n > 0);
  
  return result;
}

// Hàm giải mã chung
function decode(str, type) {
  if (typeof str !== 'string' || !str) return NaN;
  
  // Tương thích ngược: Nếu là chuỗi số nguyên thuần túy (VD: '10'), trả về số đó luôn
  if (/^\d+$/.test(str)) {
    return parseInt(str);
  }
  
  // Đối với đơn hàng, nếu chuỗi chứa dấu gạch ngang (VD: '260605-aBcDeF'), tách lấy phần Hashid phía sau
  let cleanStr = str;
  if (type === 'orders' && str.includes('-')) {
    const parts = str.split('-');
    cleanStr = parts[parts.length - 1];
  }
  
  const shuffled = alphabets[type] || ALPHABET;
  const base = shuffled.length;
  let num = 0;
  
  for (let i = 0; i < cleanStr.length; i++) {
    const char = cleanStr[i];
    const index = shuffled.indexOf(char);
    if (index === -1) return NaN; // Ký tự lạ không có trong bảng chữ cái
    num = num * base + index;
  }
  
  const offset = OFFSETS[type] || 0;
  const decodedVal = num - offset;
  if (decodedVal < 0) {
    // Nếu kết quả nhỏ hơn 0, có thể đây là chuỗi hash kiểu cũ không sử dụng offset
    return num;
  }
  return decodedVal;
}

// Hàm mã hóa riêng cho Đơn hàng, thêm tiền tố ngày đặt hàng (YYMMDD-)
function encodeOrderIdWithDate(id, createdAt) {
  const hash = encode(id, 'orders');
  const date = createdAt ? new Date(createdAt) : new Date();
  
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  
  return `${yy}${mm}${dd}-${hash}`;
}

module.exports = {
  // Sách (Books)
  encodeBookId: (id) => encode(id, 'books'),
  decodeBookId: (hash) => decode(hash, 'books'),
  
  // Đơn hàng (Orders)
  encodeOrderId: (id, createdAt) => encodeOrderIdWithDate(id, createdAt),
  decodeOrderId: (hash) => decode(hash, 'orders'),
  
  // Bài viết (Articles)
  encodeArticleId: (id) => encode(id, 'articles'),
  decodeArticleId: (hash) => decode(hash, 'articles')
};
