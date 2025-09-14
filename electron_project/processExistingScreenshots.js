const ScreenshotProcessingService = require('./services/screenshotProcessingService');
const fs = require('fs').promises;
const path = require('path');

async function processExistingScreenshots() {
  console.log('🔄 Processing existing screenshots to create context.txt...\n');
  
  try {
    // Initialize the service
    const processor = new ScreenshotProcessingService();
    await processor.initialize();
    
    // Create session ID
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log(`📱 Created session: ${sessionId}\n`);
    
    // Get all screenshots from the screenshots folder
    const screenshotDir = path.join(__dirname, 'screenshots');
    const files = await fs.readdir(screenshotDir);
    const screenshots = files.filter(file => file.endsWith('.png') && file.startsWith('screenshot-'));
    
    console.log(`📸 Found ${screenshots.length} screenshots to process:\n`);
    
    // Process each screenshot
    for (let i = 0; i < screenshots.length; i++) {
      const filename = screenshots[i];
      const screenshotPath = path.join(screenshotDir, filename);
      
      console.log(`[${i + 1}/${screenshots.length}] Processing: ${filename}`);
      
      const result = await processor.processScreenshot(screenshotPath, sessionId);
      
      if (result.success) {
        console.log(`✅ Processed successfully`);
        console.log(`   Context file: ${result.contextFile}`);
      } else {
        console.log(`❌ Failed: ${result.error}`);
      }
      
      console.log('');
    }
    
    console.log('🎉 All screenshots processed! Check temp/contexts/context.txt for the aggregated context.');
    
  } catch (error) {
    console.error('❌ Error processing screenshots:', error);
  }
}

// Run the processing
processExistingScreenshots();
