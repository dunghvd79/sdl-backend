const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

async function uploadPDF() {
  const bookId = '2'; // Mắt Biếc
  const pdfPath = path.join(__dirname, '..', '..', 'tailieuPDF', 'tai_lieu_vector_hoa_mat_biec.pdf');
  
  if (!fs.existsSync(pdfPath)) {
    console.error('PDF file does not exist at:', pdfPath);
    return;
  }
  
  console.log(`Reading PDF from ${pdfPath}...`);
  const fileStream = fs.createReadStream(pdfPath);
  
  const formData = new FormData();
  formData.append('file', fileStream);
  formData.append('book_id', bookId);
  
  try {
    console.log('Uploading to FastAPI AI Service http://127.0.0.1:8000/api/documents/upload ...');
    const response = await axios.post('http://127.0.0.1:8000/api/documents/upload', formData, {
      headers: {
        ...formData.getHeaders()
      }
    });
    console.log('Success response:', response.data);
  } catch (error) {
    console.error('Error uploading:', error.response ? error.response.data : error.message);
  }
}

uploadPDF();
