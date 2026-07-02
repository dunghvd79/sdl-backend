const axios = require('axios');

async function run() {
    try {
        console.log('Requesting health...');
        const health = await axios.get('https://sdl-backend.onrender.com/api/health');
        console.log('Health:', health.data);

        console.log('Requesting public books...');
        const books = await axios.get('https://sdl-backend.onrender.com/api/books?limit=1');
        console.log('Books count:', books.data?.data?.length);

        console.log('Requesting /api/inventory (expecting 401)...');
        await axios.get('https://sdl-backend.onrender.com/api/inventory');
    } catch (err) {
        if (err.response) {
            console.log('Inventory Response (expected 401 or 404):', err.response.status, err.response.data);
        } else {
            console.log('Error:', err.message);
        }
    }
}

run();
