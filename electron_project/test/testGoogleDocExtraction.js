const GoogleDriveService = require('../services/googleDriveService');

// Test with a public Google Doc URL
const TEST_GOOGLE_DOC_URL = 'https://docs.google.com/document/d/13VXHDOWkk8FIa6teGfscrmX6KzpHGN-xG4gsKynTafI/edit?usp=sharing';

async function testGoogleDocExtraction() {
  console.log('🔍 Testing Google Doc Extraction');
  console.log('================================');
  
  const driveService = new GoogleDriveService();
  
  try {
    // Initialize the service
    console.log('🔄 Initializing Google Drive service...');
    const initialized = await driveService.initialize();
    if (!initialized) {
      throw new Error('Failed to initialize Google Drive service');
    }
    console.log('✅ Service initialized successfully');
    
    // Parse the URL to get file ID and type
    console.log(`\n🔗 Parsing URL: ${TEST_GOOGLE_DOC_URL}`);
    const urlInfo = driveService.parseGoogleDriveUrl(TEST_GOOGLE_DOC_URL);
    
    if (!urlInfo.success) {
      throw new Error(`Failed to parse URL: ${urlInfo.error}`);
    }
    
    console.log(`✅ URL parsed successfully`);
    console.log(`   File ID: ${urlInfo.fileId}`);
    console.log(`   Type: ${urlInfo.type}`);
    
    // Get file metadata
    console.log('\n📋 Fetching document metadata...');
    const metadata = await driveService.getFileMetadata(urlInfo.fileId);
    
    if (!metadata.success) {
      throw new Error(`Failed to get metadata: ${metadata.error}`);
    }
    
    console.log('✅ Metadata retrieved successfully');
    console.log('   Title:', metadata.metadata.name);
    console.log('   MIME Type:', metadata.metadata.mimeType);
    console.log('   Created:', metadata.metadata.createdTime);
    console.log('   Modified:', metadata.metadata.modifiedTime);
    
    // Extract content
    console.log('\n📄 Extracting document content...');
    const content = await driveService.extractContent(TEST_GOOGLE_DOC_URL);
    
    if (!content.success) {
      throw new Error(`Failed to extract content: ${content.error}`);
    }
    
    console.log('✅ Content extracted successfully');
    console.log(`\n📝 Content Preview (first 500 characters):`);
    console.log('----------------------------------------');
    console.log(content.text?.substring(0, 500) || 'No content extracted');
    console.log('----------------------------------------');
    
    if (content.structure) {
      console.log('\n📊 Document Structure:');
      console.log('----------------------');
      console.log(JSON.stringify(content.structure, null, 2));
    }
    
    console.log('\n🎉 Google Doc extraction test completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run the test
testGoogleDocExtraction().catch(console.error);
