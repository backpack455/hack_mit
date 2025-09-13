// Test LinkedIn scraping with browser automation
require('dotenv').config();
const ContextService = require('../services/contextService');

async function testLinkedInBrowser() {
  console.log('🌐 Testing LinkedIn with Browser Automation\n');
  
  const contextService = new ContextService();
  const linkedinUrl = 'https://www.linkedin.com/in/aryanshah1/';
  
  console.log(`🔗 Testing LinkedIn Profile: ${linkedinUrl}`);
  console.log('─'.repeat(60));
  
  try {
    console.log('🤖 Using browser automation to bypass anti-scraping...');
    const result = await contextService.getRawContent(linkedinUrl, true); // Force browser mode
    
    if (result.success) {
      console.log(`   ✅ SUCCESS! Browser automation bypassed LinkedIn's protection`);
      console.log(`   📝 Title: ${result.title}`);
      console.log(`   📄 Description: ${result.description || 'No description'}`);
      console.log(`   📊 Word count: ${result.wordCount}`);
      console.log(`   🌐 Domain: ${result.domain}`);
      console.log(`   🔗 Links found: ${result.links?.length || 0}`);
      console.log(`   📑 Headings: ${result.headings?.length || 0}`);
      console.log(`   ⚙️  Method: ${result.method}`);
      
      // Show first 500 characters of content
      if (result.content) {
        console.log(`\n   📄 Content Preview (first 500 chars):`);
        console.log(`   "${result.content.substring(0, 500)}..."`);
      }
      
      // Show some links
      if (result.links && result.links.length > 0) {
        console.log(`\n   🔗 Sample Links:`);
        result.links.slice(0, 3).forEach((link, i) => {
          console.log(`      ${i + 1}. ${link.text} -> ${link.url.substring(0, 50)}...`);
        });
      }
      
      // Show headings
      if (result.headings && result.headings.length > 0) {
        console.log(`\n   📑 Sample Headings:`);
        result.headings.slice(0, 3).forEach((heading, i) => {
          console.log(`      ${i + 1}. ${heading.level}: ${heading.text}`);
        });
      }
      
    } else {
      console.log(`   ❌ Browser automation failed: ${result.error}`);
    }
    
  } catch (error) {
    console.log(`   💥 Error: ${error.message}`);
  } finally {
    // Clean up browser
    try {
      await contextService.browserService.closeBrowser();
      console.log('\n🧹 Browser cleaned up');
    } catch (cleanupError) {
      console.log('⚠️  Browser cleanup warning:', cleanupError.message);
    }
  }
  
  console.log('\n🎉 LinkedIn browser automation test completed!');
}

// Run the test
if (require.main === module) {
  testLinkedInBrowser().catch(console.error);
}

module.exports = testLinkedInBrowser;
