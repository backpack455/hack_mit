require('dotenv').config();
const ContextService = require('../services/contextService');

async function testAlternativeProfileSources() {
  console.log('🔍 Testing Alternative Profile Data Sources\n');
  
  const contextService = new ContextService();
  const testUrl = 'https://www.linkedin.com/in/omkj/';
  
  try {
    console.log(`🔗 Testing LinkedIn Profile: ${testUrl}`);
    console.log('────────────────────────────────────────────────────────────');
    console.log('🌐 Using alternative data sources and search engines...');
    
    // Test with enhanced alternative sources
    const result = await contextService.getRawContent(testUrl, true);
    
    if (result.success) {
      console.log('   ✅ SUCCESS! Alternative sources found data');
      console.log(`   📝 Title: ${result.title}`);
      console.log(`   📄 Description: ${result.description}`);
      console.log(`   ⚙️  Method: ${result.method}`);
      console.log(`   🌐 Domain: ${result.domain}`);
      
      if (result.sources) {
        console.log(`   📊 Sources found: ${result.sources.length}`);
        result.sources.forEach((source, i) => {
          console.log(`      ${i + 1}. ${source.source} - ${source.success ? '✅' : '❌'}`);
        });
      }
      
      console.log('\n   📄 Aggregated Profile Data:');
      try {
        const profileData = JSON.parse(result.content);
        Object.keys(profileData).forEach(key => {
          if (profileData[key] && profileData[key] !== null) {
            if (Array.isArray(profileData[key]) && profileData[key].length > 0) {
              console.log(`      ${key}: ${profileData[key].length} items`);
            } else if (typeof profileData[key] === 'string') {
              console.log(`      ${key}: ${profileData[key]}`);
            }
          }
        });
      } catch (parseError) {
        console.log(`   Content preview: ${result.content?.substring(0, 300)}...`);
      }
      
    } else {
      console.log('   ❌ FAILED: Could not retrieve data from alternative sources');
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
  
  console.log('\n🎯 Alternative profile sources test completed!');
}

// Run the test
testAlternativeProfileSources().catch(console.error);
