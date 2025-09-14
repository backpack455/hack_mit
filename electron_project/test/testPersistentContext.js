require('dotenv').config();
const ScreenshotProcessingService = require('../services/screenshotProcessingService');
const path = require('path');
const fs = require('fs').promises;

async function testPersistentContext() {
  console.log('🧪 Testing Persistent Context Files...\n');
  
  const processor = new ScreenshotProcessingService();
  const testSessionId = 'persistent_session_' + Date.now();
  
  try {
    // Initialize the service
    console.log('1. Initializing screenshot processing service...');
    await processor.initialize();
    console.log('✅ Service initialized\n');
    
    // Create test images directory
    const testImageDir = path.join(__dirname, '..', 'temp', 'test_images');
    await fs.mkdir(testImageDir, { recursive: true });
    
    // Create multiple test screenshots to simulate a session
    console.log('2. Processing multiple screenshots in session...');
    
    for (let i = 1; i <= 3; i++) {
      console.log(`\n--- Processing Screenshot ${i} ---`);
      
      // Create test image
      const testImagePath = path.join(testImageDir, `test_screenshot_${i}.png`);
      const testImageData = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
      await fs.writeFile(testImagePath, testImageData, 'base64');
      
      // Process screenshot
      const result = await processor.processScreenshot(testImagePath, testSessionId);
      
      if (result.success) {
        console.log(`✅ Screenshot ${i} processed successfully`);
        console.log(`   - Context file: ${result.contextFile ? 'Created' : 'Failed'}`);
      } else {
        console.log(`❌ Screenshot ${i} processing failed:`, result.error);
      }
      
      // Check if files exist in contexts directory
      const contextDir = path.join(__dirname, '..', 'temp', 'contexts');
      try {
        const files = await fs.readdir(contextDir);
        console.log(`   - Context directory contains ${files.length} files`);
        files.forEach(file => console.log(`     * ${file}`));
      } catch (error) {
        console.log(`   - Context directory not accessible: ${error.message}`);
      }
    }
    
    // Check final state without cleanup
    console.log('\n3. Checking persistent files (without cleanup)...');
    const contextDir = path.join(__dirname, '..', 'temp', 'contexts');
    
    try {
      const files = await fs.readdir(contextDir);
      console.log(`\n📁 Context directory contains ${files.length} files:`);
      
      for (const file of files) {
        const filePath = path.join(contextDir, file);
        const stats = await fs.stat(filePath);
        console.log(`   📄 ${file} (${stats.size} bytes, modified: ${stats.mtime.toLocaleString()})`);
        
        // Show first few lines of each file
        const content = await fs.readFile(filePath, 'utf8');
        const firstLines = content.split('\n').slice(0, 5).join('\n');
        console.log(`      Preview: ${firstLines.substring(0, 100)}...`);
      }
      
      // Show session data
      const sessionData = processor.getSessionData(testSessionId);
      if (sessionData) {
        console.log(`\n📊 Session Data:`);
        console.log(`   - Screenshots: ${sessionData.screenshots.length}`);
        console.log(`   - Context Files: ${sessionData.contextFiles.length}`);
        console.log(`   - Session Context File: ${sessionData.sessionContextFile ? 'Yes' : 'No'}`);
      }
      
    } catch (error) {
      console.log(`❌ Error reading context directory: ${error.message}`);
    }
    
    console.log('\n✅ Test completed - files should persist until manual cleanup or app termination');
    console.log(`📍 Files are located in: ${contextDir}`);
    console.log('\n💡 To clean up manually, run: await processor.cleanupSession("' + testSessionId + '")');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error('Stack:', error.stack);
  }
  
  // Note: NOT calling cleanup to demonstrate persistence
}

// Run the test
if (require.main === module) {
  testPersistentContext();
}

module.exports = testPersistentContext;
