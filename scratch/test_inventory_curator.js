const inventoryController = require('../src/controllers/inventoryController');

// Mock response object
const mockRes = () => {
    const res = {};
    res.status = (code) => {
        res.statusCode = code;
        return res;
    };
    res.json = (data) => {
        res.jsonData = data;
        return res;
    };
    return res;
};

async function test() {
    console.log('Testing InventoryController.getAll...');
    const req1 = { user: { id: 2, role: 'CURATOR' } };
    const res1 = mockRes();
    try {
        await inventoryController.getAll(req1, res1);
        console.log('getAll Response Status:', res1.statusCode);
        console.log('getAll Response JSON:', res1.jsonData);
    } catch (err) {
        console.error('getAll Error:', err);
    }

    console.log('\nTesting InventoryController.getTransactionHistory...');
    const req2 = { user: { id: 2, role: 'CURATOR' } };
    const res2 = mockRes();
    try {
        await inventoryController.getTransactionHistory(req2, res2);
        console.log('getTransactionHistory Response Status:', res2.statusCode);
        console.log('getTransactionHistory Response JSON:', res2.jsonData);
    } catch (err) {
        console.error('getTransactionHistory Error:', err);
    }
}

test();
