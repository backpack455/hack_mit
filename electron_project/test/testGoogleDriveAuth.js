require('dotenv').config();
const { GoogleDriveService } = require('../services/googleDriveService');
const fs = require('fs');
const path = require('path');

// Path to service account key file
const SERVICE_ACCOUNT_PATH = path.join(__dirname, '..', 'service-account-key.json');

async function testWithAuth() {
  try {
    console.log('🔑 Testing Google Drive with Authentication');
    console.log('═══════════════════════════════════');

    // Check if service account key exists
    if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
      throw new Error('Service account key file not found. Please create service-account-key.json in the project root.');
    }

    // Load service account credentials
    const credentials = require(SERVICE_ACCOUNT_PATH);
    
    // Initialize service with credentials
    const driveService = new GoogleDriveService();
    await driveService.initialize(credentials);
    
    console.log('✅ Successfully authenticated with Google Drive API');

    // Test with a public Google Doc
    const testDocUrl = 'https://docs.google.com/document/d/13VXHDOWkk8FIa6teGfscrmX6KzpHGN-xG4gsKynTafI/edit';
    console.log(`\n📄 Testing with document: ${testDocUrl}`);
    
    const result = await driveService.extractContent(testDocUrl);
    
    console.log('\n📋 Document Information:');
    console.log('---------------------');
    console.log('Title:', result.title);
    console.log('Type:', result.type);
    console.log('MIME Type:', result.mimeType);
    console.log('Created Time:', result.createdTime);
    console.log('Modified Time:', result.modifiedTime);
    console.log('Size (bytes):', result.fileSize);
    
    console.log('\n📝 Content Preview:');
    console.log('---------------------');
    console.log(result.text?.substring(0, 500) + '...');
    
    console.log('\n✅ Test completed successfully!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

// Run the test
testWithAuth().catch(console.error);
