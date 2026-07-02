const axios = require('axios');

async function testAsk() {
  const bookId = '2';
  const question = 'Tác phẩm Mắt Biếc kể về câu chuyện gì?';
  
  try {
    console.log(`Sending question to FastAPI: "${question}" ...`);
    const response = await axios.post('http://127.0.0.1:8000/api/chat/search', {
      book_id: bookId,
      question: question
    });
    
    console.log('\n--- AI SERVICE RESPONSE ---');
    console.log('Answer:', response.data.answer);
    console.log('\nReferences:', JSON.stringify(response.data.references, null, 2));
  } catch (error) {
    console.error('Error asking:', error.response ? error.response.data : error.message);
  }
}

testAsk();
