const ImageLinkExtractorService = require('../services/imageLinkExtractorService');
const GoogleDriveService = require('../services/googleDriveService');
const path = require('path');
const fs = require('fs');

// Load service account key
const SERVICE_ACCOUNT_KEY_PATH = path.join(__dirname, '../service-account-key.json');
let serviceAccountKey = null;

try {
  serviceAccountKey = require(SERVICE_ACCOUNT_KEY_PATH);
} catch (error) {
  console.warn('⚠️  Service account key not found. Google Drive integration will not work.');
  console.warn(`   Expected key file at: ${SERVICE_ACCOUNT_KEY_PATH}`);
  console.warn('   See GOOGLE_DRIVE_SETUP.md for setup instructions');
}

/**
 * Test the ImageLinkExtractorService with MCP-style interface
 * @param {string} imagePath - Path to the image file to process
 */
async function testImageLinkExtractor(imagePath) {
  console.log('🔍 Testing Image Link Extractor (MCP-Style)');
  console.log('══════════════════════════════════════════');
  
  // Validate input
  if (!fs.existsSync(imagePath)) {
    console.error(`❌ Error: File not found: ${imagePath}`);
    process.exit(1);
  }
  
  // Display test info
  const fileStats = fs.statSync(imagePath);
  console.log(`📂 Image: ${path.resolve(imagePath)}`);
  console.log(`📏 Size: ${(fileStats.size / 1024).toFixed(2)} KB`);
  
  // Initialize services
  const googleDriveService = new GoogleDriveService();
  const service = new ImageLinkExtractorService();
  
  // Set up Google Drive service if key is available
  if (serviceAccountKey) {
    console.log('🔑 Initializing Google Drive service...');
    await googleDriveService.initialize(serviceAccountKey);
    service.googleDriveService = googleDriveService;
  } else {
    console.warn('⚠️  Google Drive service not initialized - missing service account key');
  }
  
  try {
    // 1. Initialize the main service
    console.log('\n🔄 Initializing Image Link Extractor service...');
    const initResult = await service.initialize();
    console.log('✅ Service initialized:', JSON.stringify(initResult, null, 2));
    
    // 2. Get service info
    const serviceInfo = service.getServiceInfo();
    console.log('\nℹ️  Service Info:', JSON.stringify(serviceInfo, null, 2));
    
    // 3. Process the image
    console.log(`\n🔍 Processing image: ${path.basename(imagePath)}`);
    const startTime = Date.now();
    const result = await service.processImageForLinks(imagePath);
    const processTime = Date.now() - startTime;
    
    // 4. Display results
    console.log(`\n✅ Processing completed in ${processTime}ms`);
    
    // Show basic metadata
    console.log('\n📊 Results Summary:');
    console.log('---------------------');
    console.log(`- Text Length: ${result.metadata.textLength} characters`);
    console.log(`- URLs Found: ${result.metadata.urlCount}`);
    console.log(`- Drive Contents: ${result.metadata.driveContentCount}`);
    
    // Show extracted text preview
    if (result.extractedText) {
      const previewLength = Math.min(300, result.extractedText.length);
      console.log('\n📝 Extracted Text (Preview):');
      console.log('---------------------');
      console.log(result.extractedText.substring(0, previewLength) + 
                (result.extractedText.length > previewLength ? '...' : ''));
    }
    
    // Show URLs if found
    if (result.urls && result.urls.length > 0) {
      console.log('\n🔗 Extracted URLs:');
      console.log('---------------------');
      result.urls.forEach((urlInfo, index) => {
        console.log(`\n${index + 1}. ${urlInfo.url}`);
        console.log(`   Type: ${urlInfo.type}`);
        console.log(`   Source: ${urlInfo.source}`);
      });
    }
    
    // Show Google Drive contents if any
    if (result.driveContents && result.driveContents.length > 0) {
      console.log('\n📂 Google Drive Contents:');
      console.log('---------------------');
      result.driveContents.forEach((content, index) => {
        console.log(`\n${index + 1}. ${content.url}`);
        console.log(`   Type: ${content.type}`);
        if (content.content && content.content.title) {
          console.log(`   Title: ${content.content.title}`);
        }
        if (content.content && content.content.text) {
          const preview = content.content.text.substring(0, 150);
          console.log(`   Preview: ${preview}${content.content.text.length > 150 ? '...' : ''}`);
        }
      });
    }
    
    return result;
    
  } catch (error) {
    console.error('\n❌ Test failed with error:');
    console.error(error);
    
    // Log detailed error if available
    if (error.response) {
      console.error('\nError Details:');
      console.error('- Status:', error.response.status);
      console.error('- Data:', error.response.data);
    }
    
    throw error;
    
  } finally {
    // Always clean up resources
    console.log('\n🧹 Cleaning up resources...');
    try {
      await service.cleanup();
      console.log('✅ Resources cleaned up successfully');
    } catch (cleanupError) {
      console.error('❌ Error during cleanup:', cleanupError);
    }
  }
}

// Get image path from command line arguments or use a default test image
const imagePath = process.argv[2] || path.join(__dirname, 'screenshots/testWithLink.png');

// Run the test
console.log('🚀 Starting image processing test...');
testImageLinkExtractor(imagePath)
  .then(() => {
    console.log('\n✅ Test completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  });
