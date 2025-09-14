require('dotenv').config();
const ScreenshotProcessingService = require('../services/screenshotProcessingService');
const fs = require('fs').promises;
const path = require('path');

async function testSessionContextFile() {
  console.log('🧪 Testing Session Context File Creation and Updates...\n');
  
  try {
    // Set the working API key
    process.env.GEMINI_API_KEY = 'AIzaSyBfvnikwbtV-MrIZVpercLtvIfHhCaBMso';
    console.log('🔑 Using provided API key for testing...\n');
    
    // Initialize the service
    const processor = new ScreenshotProcessingService();
    await processor.initialize();
    
    // Create a unique session ID (simulating app start)
    const sessionId = 'app_session_' + Date.now();
    console.log(`📱 Starting app session: ${sessionId}\n`);
    
    // Create test image data (1x1 pixel PNG)
    const testImageData = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    
    // Expected context file path
    const expectedContextPath = path.join(__dirname, '..', 'temp', 'contexts', 'context.txt');
    
    // Process multiple screenshots to simulate real usage
    const numScreenshots = 3;
    let contextFilePath = null;
    
    for (let i = 1; i <= numScreenshots; i++) {
      console.log(`📸 Processing Screenshot ${i}...`);
      
      // Create temporary test image
      const imagePath = path.join(__dirname, '..', 'temp', `test_screenshot_${i}.png`);
      await fs.mkdir(path.dirname(imagePath), { recursive: true });
      await fs.writeFile(imagePath, testImageData, 'base64');
      
      // Process the screenshot
      const result = await processor.processScreenshot(imagePath, sessionId);
      
      if (result.success) {
        contextFilePath = result.contextFile;
        console.log(`✅ Screenshot ${i} processed successfully`);
        console.log(`   Context file: ${contextFilePath}`);
        
        // Verify the context file exists
        const fileExists = await fs.access(contextFilePath).then(() => true).catch(() => false);
        console.log(`   File exists: ${fileExists}`);
        
        if (fileExists) {
          // Check file size (should grow with each screenshot)
          const stats = await fs.stat(contextFilePath);
          console.log(`   File size: ${stats.size} bytes`);
          
          // Count screenshots in the file
          const content = await fs.readFile(contextFilePath, 'utf8');
          const screenshotCount = (content.match(/SCREENSHOT \d+/g) || []).length;
          console.log(`   Screenshots in file: ${screenshotCount}/${i}`);
          
          // Verify file structure
          const hasSessionHeader = content.includes('SESSION CONTEXT');
          const hasLastUpdated = content.includes('Last Updated:');
          console.log(`   Has session header: ${hasSessionHeader}`);
          console.log(`   Has last updated: ${hasLastUpdated}`);
        }
        
        // Clean up test image
        await fs.unlink(imagePath).catch(() => {});
        
      } else {
        console.log(`❌ Screenshot ${i} processing failed:`, result.error);
      }
      
      console.log('');
    }
    
    // Final verification
    console.log('🔍 Final Verification:');
    if (contextFilePath) {
      const finalContent = await fs.readFile(contextFilePath, 'utf8');
      const finalScreenshotCount = (finalContent.match(/SCREENSHOT \d+/g) || []).length;
      
      console.log(`✅ Context file created: ${contextFilePath}`);
      console.log(`✅ Total screenshots in context: ${finalScreenshotCount}`);
      console.log(`✅ Expected screenshots: ${numScreenshots}`);
      console.log(`✅ Context file format correct: ${finalContent.includes('SESSION CONTEXT')}`);
      
      if (finalScreenshotCount === numScreenshots) {
        console.log('\n🎉 SUCCESS: Context file properly updates with each screenshot!');
      } else {
        console.log('\n❌ FAILURE: Screenshot count mismatch');
      }
      
      // Show first few lines of the context file
      console.log('\n📄 Context File Preview:');
      const lines = finalContent.split('\n').slice(0, 15);
      lines.forEach((line, index) => {
        console.log(`${String(index + 1).padStart(2, ' ')}: ${line}`);
      });
      
    } else {
      console.log('❌ No context file was created');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testSessionContextFile();
