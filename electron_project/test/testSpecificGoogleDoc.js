require('dotenv').config();
const ContextService = require('../services/contextService');

async function testSpecificGoogleDoc() {
  console.log('📄 Testing Specific Google Doc Extraction\n');
  
  const contextService = new ContextService();
  const testUrl = 'https://docs.google.com/document/d/13VXHDOWkk8FIa6teGfscrmX6KzpHGN-xG4gsKynTafI/edit?usp=sharing';
  
  try {
    console.log(`🔗 Testing Google Doc: ${testUrl}`);
    console.log('════════════════════════════════════════════════════════════');
    console.log('🌐 Using Google Drive service integration...');
    
    // Test Google Drive detection
    const isGoogleDrive = contextService.isGoogleDriveUrl(testUrl);
    console.log(`   Google Drive URL detected: ${isGoogleDrive ? '✅' : '❌'}`);
    
    // Test URL parsing
    const urlInfo = contextService.googleDriveService.parseGoogleDriveUrl(testUrl);
    console.log(`   URL parsing: ${urlInfo.success ? '✅' : '❌'}`);
    if (urlInfo.success) {
      console.log(`   File ID: ${urlInfo.fileId}`);
      console.log(`   Type: ${urlInfo.type}`);
    }
    
    // Test content extraction through context service
    console.log('\n🔍 Attempting content extraction...');
    const result = await contextService.retrieveUrlContext(testUrl, 'Extract and summarize the document content');
    
    if (result.success) {
      console.log('   ✅ SUCCESS! Google Doc content extracted');
      console.log(`   📝 Title: ${result.title || 'N/A'}`);
      console.log(`   📄 Service: ${result.service}`);
      console.log(`   📊 File Type: ${result.fileType}`);
      console.log(`   📈 Word Count: ${result.wordCount || 'N/A'}`);
      
      if (result.content) {
        console.log('\n   📄 Content Preview (first 500 chars):');
        console.log(`   "${result.content.substring(0, 500)}..."`);
      }
      
      if (result.analysis) {
        console.log('\n   🤖 AI Analysis:');
        console.log(`   ${result.analysis.substring(0, 300)}...`);
      }
      
      if (result.metadata) {
        console.log('\n   📋 Metadata:');
        console.log(`   Document ID: ${result.metadata.documentId || 'N/A'}`);
        console.log(`   Title: ${result.metadata.title || 'N/A'}`);
      }
      
    } else {
      console.log('   ❌ FAILED: Could not extract Google Doc content');
      console.log(`   Error: ${result.error}`);
      
      // If Google Drive service failed, check if it's due to authentication
      if (result.error && result.error.includes('credentials')) {
        console.log('\n   💡 This is likely due to missing Google API credentials');
        console.log('   The document may be private or require authentication');
      }
    }
    
  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
  }
  
  console.log('\n🎯 Specific Google Doc test completed!');
}

// Run the test
testSpecificGoogleDoc().catch(console.error);
