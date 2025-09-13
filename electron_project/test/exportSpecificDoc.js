const { google } = require('googleapis');
const { GoogleAuth } = require('google-auth-library');
const fs = require('fs');

async function exportSpecificDoc() {
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
    const fileId = '1CecFA5Q2FbSHT7fWbXtclfHbbMihy0uQ149ZEOVgMew';
    
    // First, try to get file metadata to check permissions
    console.log('Getting file metadata...');
    const file = await drive.files.get({
      fileId,
      fields: 'id,name,mimeType,shared,webViewLink',
      supportsAllDrives: true
    });
    
    console.log('\nFile Metadata:');
    console.log('--------------');
    console.log(`Title: ${file.data.name}`);
    console.log(`Type: ${file.data.mimeType}`);
    console.log(`Shared: ${file.data.shared}`);
    console.log(`Web View Link: ${file.data.webViewLink}`);
    
    // Try to export the document
    console.log('\nExporting document as text...');
    const res = await drive.files.export({
      fileId,
      mimeType: 'text/plain',
    }, { responseType: 'text' });
    
    console.log('\nDocument content (first 500 chars):');
    console.log('----------------------------------------');
    console.log(res.data.substring(0, 500));
    console.log('----------------------------------------');
    
  } catch (error) {
    console.error('Error accessing document:');
    console.error(error.message);
    
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    
    // If export fails, try to get the sharing permissions
    try {
      console.log('\nChecking sharing permissions...');
      const authClient = await auth.getClient();
      const res = await authClient.request({
        url: `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`,
        method: 'GET',
        params: {
          fields: 'permissions(id,type,role,emailAddress,domain)'
        }
      });
      
      console.log('Current permissions:');
      console.log(JSON.stringify(res.data, null, 2));
    } catch (permError) {
      console.error('Error checking permissions:', permError.message);
    }
  }
}

exportSpecificDoc().catch(console.error);
