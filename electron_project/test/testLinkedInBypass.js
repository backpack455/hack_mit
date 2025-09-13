require('dotenv').config();
const ContextService = require('../services/contextService');

async function testLinkedInBypass() {
  console.log('🔓 Testing LinkedIn Bypass Strategies\n');
  
  const contextService = new ContextService();
  const testUrl = 'https://www.linkedin.com/in/aryanshah1/';
  
  try {
    console.log(`🔗 Testing LinkedIn Profile: ${testUrl}`);
    console.log('────────────────────────────────────────────────────────────');
    console.log('🚀 Using enhanced bypass strategies...');
    
    // Test with bypass enabled
    const result = await contextService.getRawContent(testUrl, true);
    
    if (result.success) {
      console.log('   ✅ SUCCESS! LinkedIn bypass strategies worked');
      console.log(`   📝 Title: ${result.title}`);
      console.log(`   📄 Description: ${result.description}`);
      console.log(`   📊 Word count: ${result.wordCount}`);
      console.log(`   🌐 Domain: ${result.domain}`);
      console.log(`   🔗 Links found: ${result.links?.length || 0}`);
      console.log(`   📑 Headings: ${result.headings?.length || 0}`);
      console.log(`   ⚙️  Method: ${result.method}`);
      
      console.log('\n   📄 Content Preview (first 500 chars):');
      console.log(`   "${result.content?.substring(0, 500)}..."`);
      
      if (result.links && result.links.length > 0) {
        console.log('\n   🔗 Sample Links:');
        result.links.slice(0, 3).forEach((link, i) => {
          console.log(`      ${i + 1}. ${link.text} -> ${link.url.substring(0, 50)}...`);
        });
      }
      
      if (result.headings && result.headings.length > 0) {
        console.log('\n   📑 Sample Headings:');
        result.headings.slice(0, 3).forEach((heading, i) => {
          console.log(`      ${i + 1}. ${heading.level}: ${heading.text}`);
        });
      }
      
      // Check if we actually got profile content vs login page
      const isLoginPage = result.content?.includes('Join LinkedIn') || 
                         result.content?.includes('Sign in') ||
                         result.title?.includes('Sign Up');
      
      if (isLoginPage) {
        console.log('\n   ⚠️  WARNING: Still getting login page - bypass strategies need refinement');
      } else {
        console.log('\n   🎉 SUCCESS: Actual profile content retrieved!');
      }
      
    } else {
      console.log('   ❌ FAILED: Could not bypass LinkedIn protection');
      console.log(`   Error: ${result.error}`);
    }
    
  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
  } finally {
    // Clean up browser resources
    if (contextService.browserService) {
      await contextService.browserService.closeBrowser();
      console.log('\n🧹 Browser cleaned up');
    }
  }
  
  console.log('\n🎯 LinkedIn bypass test completed!');
}

// Run the test
testLinkedInBypass().catch(console.error);
