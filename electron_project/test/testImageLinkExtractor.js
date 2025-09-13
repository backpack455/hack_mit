const ImageLinkExtractorService = require('../services/imageLinkExtractorService');
const path = require('path');
const fs = require('fs');

// Check if running in Electron renderer process
const isElectron = typeof window !== 'undefined' && window.process && window.process.type;

async function testImageLinkExtractor(imagePath) {
  console.log('🔍 Testing Image Link Extractor');
  console.log('═══════════════════════════════════');
  
  if (!fs.existsSync(imagePath)) {
    console.error(`❌ Error: File not found: ${imagePath}`);
    process.exit(1);
  }
  
  console.log(`📂 Image: ${path.resolve(imagePath)}`);
  console.log(`📏 Size: ${(fs.statSync(imagePath).size / 1024).toFixed(2)} KB`);
  
  const extractor = new ImageLinkExtractorService();
  
  try {
    console.log('\n🔄 Initializing OCR engine...');
    await extractor.initialize();
    
    console.log('\n🔍 Processing image...');
    const startTime = Date.now();
    const result = await extractor.processImageForLinks(imagePath);
    const processTime = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log(`\n✅ Processing completed in ${processTime}s`);
    
    if (result.extractedText) {
      console.log('\n📄 Extracted Text:');
      console.log('---------------------');
      console.log(result.extractedText.substring(0, 500) + (result.extractedText.length > 500 ? '...' : ''));
      console.log(`\n📝 Total characters: ${result.extractedText.length}`);
    } else {
      console.log('\n❌ No text was extracted from the image');
    }
    
    if (result.urls && result.urls.length > 0) {
      console.log('\n🔗 Found URLs:');
      console.log('---------------------');
      result.urls.forEach((urlInfo, index) => {
        console.log(`\n${index + 1}. ${urlInfo.url}`);
        console.log('   Type:', urlInfo.type);
        
        if (urlInfo.error) {
          console.error('   ❌ Error:', urlInfo.error);
        } else if (urlInfo.content) {
          console.log('   ✅ Content extracted successfully');
          if (urlInfo.content.title) {
            console.log('   📝 Title:', urlInfo.content.title);
          }
          if (urlInfo.content.text) {
            const preview = urlInfo.content.text.substring(0, 150);
            console.log('   📄 Preview:', preview + (urlInfo.content.text.length > 150 ? '...' : ''));
          }
        }
      });
    } else {
      console.log('\nℹ️ No URLs found in the image');
    }
    
    return result;
  } catch (error) {
    console.error('\n❌ Test failed:');
    console.error(error);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    throw error;
  } finally {
    console.log('\n🧹 Cleaning up resources...');
    await extractor.cleanup();
  }
}

// Get image path from command line arguments or use a default test image
const imagePath = process.argv[2] || path.join(__dirname, 'test-screenshot.png');

// Run the test
console.log('🚀 Starting image processing test...');
testImageLinkExtractor(imagePath)
  .then(() => {
    console.log('\n✅ Test completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed with error');
    process.exit(1);
  });
