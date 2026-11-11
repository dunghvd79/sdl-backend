# Quickstart: Kiểm chứng xử lý lỗi tập trung

## Điều kiện

```bash
docker start sdl_postgres sdl_redis_test
cd sdl-project
```

## Chạy kiểm thử

```bash
npm test                                   # toàn bộ bộ test phải xanh
npx jest tests/errors.handler.test.js      # middleware lỗi, JSON hỏng, 404
npx jest tests/errors.business.test.js     # lỗi nghiệp vụ giữ nguyên thông báo + mã
```

Kết quả mong đợi: các kịch bản trong [contracts/error-response.md](contracts/error-response.md) đều đạt.

## Kiểm tra không còn chỗ trả lỗi gốc (SC-001)

```bash
grep -rnE "json\(\{ *error: *(err|error|e)\.message" src/controllers src/routes src/config
```

Mong đợi: không còn kết quả nào.

## Kiểm tra thủ công trên server chạy thật

```bash
PORT=3999 node src/server.js
curl -s -X POST localhost:3999/api/auth/login -H "Content-Type: application/json" -d '{bad'
# → 400 {"error":"Dữ liệu gửi lên không đúng định dạng JSON."}
curl -s localhost:3999/api/khong-ton-tai
# → 404 {"error":"Không tìm thấy đường dẫn API."}
```
