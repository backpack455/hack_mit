const { google } = require('googleapis');
const { GoogleAuth } = require('google-auth-library');
const fs = require('fs');

async function checkDocumentSharing() {
  try {
    // Load service account credentials
    const credentials = JSON.parse(fs.readFileSync('./service-account-key.json'));
    
    // Initialize auth
    const auth = new GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive']
    });
    
    const drive = google.drive({ version: 'v3', auth });
    
    // Document ID from the URL
    const fileId = '1CecFA5Q2FbSHT7fWbXtclfHbbMihy0uQ149ZEOVgMew';
    
    // Get file metadata
    console.log('Getting file metadata...');
    const file = await drive.files.get({
      fileId,
      fields: 'id,name,mimeType,shared,permissions,webViewLink,webContentLink',
      supportsAllDrives: true
    });
    
    console.log('\nFile Metadata:');
    console.log('--------------');
    console.log(`Title: ${file.data.name}`);
    console.log(`Type: ${file.data.mimeType}`);
    console.log(`Shared: ${file.data.shared}`);
    console.log(`Web View Link: ${file.data.webViewLink}`);
    
    // Get permissions
    console.log('\nPermissions:');
    console.log('------------');
    const permissions = await drive.permissions.list({
      fileId,
      fields: 'permissions(id,type,role,emailAddress,domain,allowFileDiscovery)',
      supportsAllDrives: true
    });
    
    console.log(JSON.stringify(permissions.data, null, 2));
    
    // Try to export as text
    console.log('\nTrying to export as text...');
    try {
      const res = await drive.files.export({
        fileId,
        mimeType: 'text/plain',
      }, { responseType: 'text' });
      
      console.log('\nDocument content (first 500 chars):');
      console.log('----------------------------------------');
      console.log(res.data.substring(0, 500));
      console.log('----------------------------------------');
    } catch (exportError) {
      console.error('Export failed:', exportError.message);
    }
    
  } catch (error) {
    console.error('Error checking document sharing:');
    console.error(error.message);
    
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Status:', error.response.status);
      console.error('Headers:', error.response.headers);
    }
  }
}

checkDocumentSharing().catch(console.error);
