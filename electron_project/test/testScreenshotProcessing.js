require('dotenv').config();
const ScreenshotProcessingService = require('../services/screenshotProcessingService');
const path = require('path');
const fs = require('fs').promises;

async function testScreenshotProcessing() {
  console.log('🧪 Testing Screenshot Processing Service...\n');
  
  const processor = new ScreenshotProcessingService();
  const testSessionId = 'test_session_' + Date.now();
  
  try {
    // Initialize the service
    console.log('1. Initializing screenshot processing service...');
    await processor.initialize();
    console.log('✅ Service initialized successfully\n');
    
    // Check service status
    console.log('2. Checking service status...');
    const status = processor.getStatus();
    console.log('Service Status:', JSON.stringify(status, null, 2));
    console.log('');
    
    // Create a test image (we'll use a placeholder since we don't have a real screenshot)
    console.log('3. Creating test screenshot...');
    const testImagePath = path.join(__dirname, '..', 'temp', 'test_screenshot.png');
    await fs.mkdir(path.dirname(testImagePath), { recursive: true });
    
    // Create a simple test image (base64 encoded 1x1 PNG)
    const testImageData = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    await fs.writeFile(testImagePath, testImageData, 'base64');
    console.log(`✅ Test image created: ${testImagePath}\n`);
    
    // Process the test screenshot
    console.log('4. Processing test screenshot...');
    const result = await processor.processScreenshot(testImagePath, testSessionId);
    
    if (result.success) {
      console.log('✅ Screenshot processed successfully!');
      console.log('Processing Result Summary:');
      console.log(`- Screenshot ID: ${result.data.id}`);
      console.log(`- Session ID: ${result.data.sessionId}`);
      console.log(`- Processing Time: ${result.data.processingTime}ms`);
      console.log(`- AI Description Success: ${result.data.visualDescription.success}`);
      console.log(`- OCR Success: ${result.data.ocrText.success}`);
      console.log(`- URLs Found: ${result.data.urls.found.length}`);
      console.log(`- Context File: ${result.contextFile ? 'Generated' : 'Not generated'}`);
      
      if (result.data.visualDescription.success) {
        console.log(`- AI Description: ${result.data.visualDescription.description.substring(0, 100)}...`);
      }
      
      if (result.data.ocrText.success && result.data.ocrText.extractedText) {
        console.log(`- OCR Text: ${result.data.ocrText.extractedText.substring(0, 100)}...`);
      }
      
      console.log('');
    } else {
      console.log('❌ Screenshot processing failed:', result.error);
    }
    
    // Test session context generation
    console.log('5. Generating session context...');
    try {
      const sessionContextPath = await processor.generateSessionContext(testSessionId);
      console.log(`✅ Session context generated: ${sessionContextPath}\n`);
      
      // Read a sample of the context file
      const contextContent = await fs.readFile(sessionContextPath, 'utf8');
      console.log('Context File Preview (first 500 characters):');
      console.log('-'.repeat(50));
      console.log(contextContent.substring(0, 500));
      console.log('-'.repeat(50));
      console.log('');
    } catch (error) {
      console.log('❌ Session context generation failed:', error.message);
    }
    
    // Test session data retrieval
    console.log('6. Testing session data retrieval...');
    const sessionData = processor.getSessionData(testSessionId);
    if (sessionData) {
      console.log('✅ Session data retrieved successfully');
      console.log(`- Screenshots: ${sessionData.screenshots.length}`);
      console.log(`- Context Files: ${sessionData.contextFiles.length}`);
      console.log(`- Temp Files: ${sessionData.tempFiles.size}`);
      console.log('');
    } else {
      console.log('❌ Session data not found');
    }
    
    // Test cleanup
    console.log('7. Testing session cleanup...');
    await processor.cleanupSession(testSessionId);
    console.log('✅ Session cleanup completed\n');
    
    // Final cleanup
    console.log('8. Final cleanup...');
    await processor.cleanupAll();
    console.log('✅ All cleanup completed\n');
    
    console.log('🎉 Screenshot Processing Service test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error('Stack:', error.stack);
    
    // Cleanup on error
    try {
      await processor.cleanupAll();
    } catch (cleanupError) {
      console.error('❌ Cleanup error:', cleanupError.message);
    }
  }
}

// Run the test
if (require.main === module) {
  testScreenshotProcessing();
}

module.exports = testScreenshotProcessing;
