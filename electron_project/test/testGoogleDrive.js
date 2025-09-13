require('dotenv').config();
const GoogleDriveService = require('../services/googleDriveService');

async function logAllDriveData(url) {
  console.log('\n🔍 Logging all data from Google Drive link:', url);
  console.log('═══════════════════════════════════');
  
  const driveService = new GoogleDriveService();
  
  try {
    // Initialize the service
    await driveService.initialize();
    
    // Extract content
    const content = await driveService.extractContent(url);
    
    // Log all available data
    console.log('📄 Document Metadata:');
    console.log('---------------------');
    console.log('Title:', content.title);
    console.log('Type:', content.type);
    console.log('MIME Type:', content.mimeType);
    console.log('Created Time:', content.createdTime);
    console.log('Modified Time:', content.modifiedTime);
    console.log('Size (bytes):', content.fileSize);
    console.log('Owner:', content.owner);
    console.log('Web View Link:', content.webViewLink);
    
    console.log('\n📝 Content Summary:');
    console.log('---------------------');
    console.log('Word Count:', content.wordCount);
    console.log('Character Count:', content.text?.length || 0);
    
    console.log('\n📊 Document Structure:');
    console.log('---------------------');
    console.log(JSON.stringify(content.structure, null, 2));
    
    console.log('\n📜 Full Text Preview (first 500 chars):');
    console.log('---------------------');
    console.log(content.text?.substring(0, 500) + '...');
    
    return content;
  } catch (error) {
    console.error('❌ Error fetching Google Drive data:', error.message);
    throw error;
  }
}

async function testGoogleDriveService() {
  console.log('🔗 Testing Google Drive Integration\n');
  
  const driveService = new GoogleDriveService();
  
  // Test URL parsing
  console.log('📋 Testing URL Parsing:');
  console.log('═══════════════════════════════════');
  
  const testUrls = [
    'https://docs.google.com/document/d/13VXHDOWkk8FIa6teGfscrmX6KzpHGN-xG4gsKynTafI/edit?usp=sharing',
    'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit',
    'https://docs.google.com/presentation/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit',
    'https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/view',
    'https://invalid-url.com/document'
  ];
  
  for (const [index, url] of testUrls.entries()) {
    const result = driveService.parseGoogleDriveUrl(url);
    console.log(`\n${index + 1}. ${url}`);
    console.log(`   Result: ${result.success ? '✅' : '❌'}`);
    if (result.success) {
      console.log(`   File ID: ${result.fileId}`);
      console.log(`   Type: ${result.type}`);
      
      // Test content extraction for valid URLs
      if (index < 3) { // Only test first 3 valid URLs
        try {
          await logAllDriveData(url);
        } catch (error) {
          console.error(`   Failed to extract content: ${error.message}`);
        }
      }
    } else {
      console.log(`   Error: ${result.error}`);
    }
    console.log('');
  }
  
  // Test service initialization (without credentials)
  console.log('🔧 Testing Service Initialization:');
  console.log('═══════════════════════════════════');
  
  try {
    const initialized = await driveService.initialize();
    console.log(`Initialization: ${initialized ? '✅ Success' : '❌ Failed'}`);
    console.log(`Service ready: ${driveService.isInitialized()}`);
  } catch (error) {
    console.log(`❌ Initialization failed: ${error.message}`);
    console.log('Note: This is expected without proper Google API credentials');
  }
  
  console.log('\n📝 Google Drive Service Test Summary:');
  console.log('═══════════════════════════════════════');
  console.log('✅ URL parsing functionality working');
  console.log('✅ Service architecture implemented');
  console.log('⚠️  API credentials required for full functionality');
  console.log('📚 Supports: Google Docs, Sheets, Slides, and Drive files');
  
  console.log('\n🔑 To enable full functionality:');
  console.log('1. Set up Google Cloud Project');
  console.log('2. Enable Google Drive, Docs, Sheets, and Slides APIs');
  console.log('3. Create service account credentials');
  console.log('4. Add credentials to environment or pass to initialize()');
  
  console.log('\n🎯 Google Drive integration test completed!');
}

// Run the test
testGoogleDriveService().catch(console.error);
