const crypto = require('crypto');

function buildUrlWithAlgorithm(orderId, amount, createDate, ipAddr, algorithm) {
    const tmnCode = 'K4SAIFWJ';
    const hashSecret = 'NCQ4W6WIU0FTQMT4RXOM7WTLLG8LHJ4O';
    const returnUrl = 'http://localhost:3000/api/payments/vnpay_return';

    let vnp_Params = {};
    vnp_Params['vnp_Version'] = '2.1.0';
    vnp_Params['vnp_Command'] = 'pay';
    vnp_Params['vnp_TmnCode'] = tmnCode;
    vnp_Params['vnp_Locale'] = 'vn';
    vnp_Params['vnp_CurrCode'] = 'VND';
    vnp_Params['vnp_TxnRef'] = String(orderId);
    vnp_Params['vnp_OrderInfo'] = 'Thanh toan don hang ' + orderId;
    vnp_Params['vnp_OrderType'] = 'other';
    vnp_Params['vnp_Amount'] = Math.round(amount * 100);
    vnp_Params['vnp_ReturnUrl'] = returnUrl;
    vnp_Params['vnp_IpAddr'] = ipAddr;
    vnp_Params['vnp_CreateDate'] = createDate;

    // Sort parameters
    const sortedKeys = Object.keys(vnp_Params).sort();
    
    // Build signData
    const signData = sortedKeys
        .map(key => `${key}=${encodeURIComponent(vnp_Params[key]).replace(/%20/g, "+")}`)
        .join('&');

    let secureHash;
    if (algorithm === 'md5') {
        // MD5 uses standard md5 hash of hashSecret + signData
        secureHash = crypto.createHash('md5').update(hashSecret + signData).digest('hex');
    } else {
        // HMAC SHA256 or SHA512
        const hmac = crypto.createHmac(algorithm, hashSecret);
        secureHash = hmac.update(Buffer.from(signData, 'utf-8')).digest("hex");
    }

    // Build final redirect URL
    let queryParams = {};
    for (const key of sortedKeys) {
        queryParams[key] = encodeURIComponent(vnp_Params[key]).replace(/%20/g, "+");
    }
    queryParams['vnp_SecureHash'] = secureHash;

    const redirectUrl = 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?' + 
        Object.keys(queryParams).map(key => `${key}=${queryParams[key]}`).join('&');

    return { secureHash, redirectUrl };
}

const createDate = '20260525160042';

console.log('=== TESTING SHA256 ===');
const sha256Res = buildUrlWithAlgorithm(39, 150000, createDate, '127.0.0.1', 'sha256');
console.log('SHA256 Hash:', sha256Res.secureHash);
console.log('SHA256 URL:', sha256Res.redirectUrl);

console.log('\n=== TESTING MD5 ===');
const md5Res = buildUrlWithAlgorithm(39, 150000, createDate, '127.0.0.1', 'md5');
console.log('MD5 Hash:', md5Res.secureHash);
console.log('MD5 URL:', md5Res.redirectUrl);
