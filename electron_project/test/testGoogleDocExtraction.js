const GoogleDriveService = require('../services/googleDriveService');

// Test with a public Google Doc URL
const TEST_GOOGLE_DOC_URL = 'https://docs.google.com/document/d/1RbqWXGCVyQ8ZjGcUIV6mTS7Sq3qMaelwTFERSw_gsvs/edit?usp=sharing';

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
    
    // Try to extract content with fallback to web scraping
    console.log('\n📄 Attempting to extract document content...');
    try {
      // First try with API
      console.log('  1. Trying API access...');
      const content = await driveService.extractContent(TEST_GOOGLE_DOC_URL);
      
      if (!content.success) {
        throw new Error(content.error);
      }
      
      console.log('  ✅ API access successful');
      
      // Display results
      console.log('\n📋 Document Information:');
      console.log('----------------------');
      console.log(`Title: ${content.title || 'Untitled'}`);
      console.log(`Type: ${content.type}`);
      console.log(`Source: ${content.source || 'Google Drive API'}`);
      
      if (content.warning) {
        console.log(`⚠️  ${content.warning}`);
      }
      
      console.log(`\n📝 Content (${content.wordCount || 0} words, first 500 chars):`);
      console.log('----------------------------------------');
      console.log(content.content?.substring(0, 500) || 'No content extracted');
      console.log('----------------------------------------');
      
      if (content.structure) {
        console.log('\n📊 Document Structure (simplified):');
        console.log('----------------------------------------');
        const structurePreview = content.structure
          .slice(0, 10) // Show first 10 elements
          .map((item, i) => `[${i}] ${item.type.toUpperCase()}: ${item.text.substring(0, 80)}${item.text.length > 80 ? '...' : ''}`)
          .join('\n');
        console.log(structurePreview);
        if (content.structure.length > 10) {
          console.log(`... and ${content.structure.length - 10} more elements`);
        }
      }
      
      if (content.metadata) {
        console.log('\n📊 Metadata:');
        console.log('----------------------------------------');
        console.log(JSON.stringify(content.metadata, null, 2));
      }
      
    } catch (apiError) {
      console.log('  ❌ API access failed, falling back to web scraping...');
      
      try {
        // Try web scraping as fallback
        console.log('  2. Trying web scraping...');
        const scrapedContent = await driveService.scrapeGoogleDocContent(urlInfo.fileId);
        
        console.log('  ✅ Web scraping successful');
        
        console.log('\n📋 Document Information (Web Scraped):');
        console.log('----------------------------------------');
        console.log(`Title: ${scrapedContent.title || 'Untitled'}`);
        console.log(`Type: ${scrapedContent.type}`);
        console.log(`Source: ${scrapedContent.source || 'web_scraping'}`);
        
        if (scrapedContent.warning) {
          console.log(`⚠️  ${scrapedContent.warning}`);
        }
        
        console.log(`\n📝 Content (${scrapedContent.wordCount || 0} words, first 500 chars):`);
        console.log('----------------------------------------');
        console.log(scrapedContent.content?.substring(0, 500) || 'No content extracted');
        console.log('----------------------------------------');
        
        if (scrapedContent.structure) {
          console.log('\n📊 Document Structure (first 10 elements):');
          console.log('----------------------------------------');
          const structurePreview = scrapedContent.structure
            .slice(0, 10)
            .map((item, i) => `[${i}] ${item.type.toUpperCase()}: ${item.text.substring(0, 80)}${item.text.length > 80 ? '...' : ''}`)
            .join('\n');
          console.log(structurePreview);
          if (scrapedContent.structure.length > 10) {
            console.log(`... and ${scrapedContent.structure.length - 10} more elements`);
          }
        }
        
      } catch (scrapeError) {
        console.error('  ❌ Web scraping failed');
        
        // Try to parse the error as JSON for detailed error information
        try {
          const errorDetails = JSON.parse(scrapeError.message);
          console.error('\n❌ Detailed Error Information:');
          console.error('----------------------------------------');
          console.error(`Error: ${errorDetails.error}`);
          console.error(`Status: ${errorDetails.status} ${errorDetails.statusText || ''}`);
          console.error(`Document URL: ${errorDetails.url}`);
          console.error(`\nSuggested Solution: ${errorDetails.solution || 'Please check the document sharing settings.'}`);
        } catch (e) {
          // If error is not JSON, just show the raw error
          console.error('\n❌ Error:', scrapeError.message);
        }
        
        throw new Error('All extraction methods failed');
      }
    }
    
    console.log('\n🎉 Google Doc extraction test completed!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack.split('\n').slice(0, 3).join('\n'));
    }
    process.exit(1);
  }
}

// Run the test
testGoogleDocExtraction().catch(console.error);
