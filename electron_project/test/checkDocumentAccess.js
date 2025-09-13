const { google } = require('googleapis');
const { GoogleAuth } = require('google-auth-library');
const fs = require('fs');

async function checkDocumentAccess() {
  try {
    // Load service account credentials
    const credentials = JSON.parse(fs.readFileSync('./service-account-key.json'));
    
    // Initialize auth
    const auth = new GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive.readonly']
    });
    
    const drive = google.drive({ version: 'v3', auth });
    
    // Document IDs to test
    const testDocs = [
      {
        id: '1CecFA5Q2FbSHT7fWbXtclfHbbMihy0uQ149ZEOVgMew',
        name: 'Copy of Sponsor Challenges'
      },
      {
        id: '1RbqWXGCVyQ8ZjGcUIV6mTS7Sq3qMaelwTFERSw_gsvs',
        name: 'Sponsor Challenges (2)'
      },
      {
        id: '1GgR4ghNoAXB5xd2JnkTWFP0_RMRKnvdeTdmM7mIflVs',
        name: 'New Test Document'
      }
    ];

    for (const doc of testDocs) {
      console.log(`\n=== Testing Document: ${doc.name} (${doc.id}) ===`);
      
      try {
        // Try to get file metadata
        console.log('Getting file metadata...');
        const file = await drive.files.get({
          fileId: doc.id,
          fields: 'id,name,mimeType,shared,webViewLink',
          supportsAllDrives: true
        });
        
        console.log('✅ Successfully accessed metadata');
        console.log(`   Title: ${file.data.name}`);
        console.log(`   Type: ${file.data.mimeType}`);
        console.log(`   Shared: ${file.data.shared}`);
        
        // Try to export the document
        console.log('Attempting to export document...');
        const res = await drive.files.export({
          fileId: doc.id,
          mimeType: 'text/plain',
        }, { responseType: 'text' });
        
        console.log('✅ Successfully exported document');
        console.log('   First 100 chars:');
        console.log('   ' + res.data.substring(0, 100).replace(/\n/g, ' ') + '...');
        
      } catch (error) {
        console.error('❌ Error:', error.message);
        
        // Check if it's a permission error
        if (error.code === 403 || (error.response && error.response.status === 403)) {
          console.log('   This appears to be a permission issue.');
          console.log('   Make sure the document is shared with the service account:', credentials.client_email);
        }
      }
      
      console.log('----------------------------------------');
    }
    
  } catch (error) {
    console.error('Fatal error:', error.message);
  }
}

checkDocumentAccess().catch(console.error);
