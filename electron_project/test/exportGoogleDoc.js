const { google } = require('googleapis');
const { GoogleAuth } = require('google-auth-library');
const fs = require('fs');

async function exportGoogleDoc() {
  try {
    // Load service account credentials
    const credentials = JSON.parse(fs.readFileSync('./service-account-key.json'));
    
    // Initialize auth
    const auth = new GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive.readonly']
    });
    
    const drive = google.drive({ version: 'v3', auth });
    
    // Document ID from the URL
    const fileId = '1RbqWXGCVyQ8ZjGcUIV6mTS7Sq3qMaelwTFERSw_gsvs';
    
    console.log('Exporting document as text...');
    const res = await drive.files.export({
      fileId: fileId,
      mimeType: 'text/plain',
    }, { responseType: 'text' });
    
    console.log('\nDocument content:');
    console.log('----------------------------------------');
    console.log(res.data);
    console.log('----------------------------------------');
    
  } catch (error) {
    console.error('Error exporting document:');
    console.error(error.message);
    
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Status:', error.response.status);
      console.error('Headers:', error.response.headers);
    }
  }
}

exportGoogleDoc().catch(console.error);
