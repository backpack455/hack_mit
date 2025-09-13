require('dotenv').config();
const AlternativeProfileService = require('../services/alternativeProfileService');

async function testDetailedProfileExtraction() {
  console.log('🔍 Detailed LinkedIn Profile Data Extraction\n');
  
  const altService = new AlternativeProfileService();
  const testUrl = 'https://www.linkedin.com/in/aryanshah1/';
  
  try {
    console.log(`🔗 Extracting data for: ${testUrl}`);
    console.log('════════════════════════════════════════════════════════════');
    
    const result = await altService.getProfileFromAlternatives(testUrl);
    
    console.log(`📊 Found ${result.sources.length} data sources\n`);
    
    // Display results from each source
    result.sources.forEach((source, index) => {
      console.log(`📋 Source ${index + 1}: ${source.source.toUpperCase()}`);
      console.log(`   Status: ${source.success ? '✅ Success' : '❌ Failed'}`);
      console.log(`   Timestamp: ${source.timestamp}`);
      
      if (source.success && source.data && source.data.searchResults) {
        console.log(`   Results found: ${source.data.searchResults.length}`);
        
        source.data.searchResults.forEach((result, i) => {
          if (i < 3) { // Show first 3 results
            console.log(`   ${i + 1}. ${result.title}`);
            console.log(`      URL: ${result.link}`);
            console.log(`      Snippet: ${result.snippet?.substring(0, 100)}...`);
          }
        });
      }
      console.log('');
    });
    
    // Display aggregated profile data
    console.log('👤 AGGREGATED PROFILE DATA:');
    console.log('═══════════════════════════════════════');
    
    const profile = result.aggregatedData;
    
    if (profile.name) console.log(`📛 Name: ${profile.name}`);
    if (profile.title) console.log(`💼 Title: ${profile.title}`);
    if (profile.company) console.log(`🏢 Company: ${profile.company}`);
    if (profile.location) console.log(`📍 Location: ${profile.location}`);
    if (profile.summary) console.log(`📝 Summary: ${profile.summary}`);
    
    if (profile.skills && profile.skills.length > 0) {
      console.log(`🎯 Skills: ${profile.skills.join(', ')}`);
    }
    
    if (profile.experience && profile.experience.length > 0) {
      console.log(`💼 Experience:`);
      profile.experience.forEach((exp, i) => {
        console.log(`   ${i + 1}. ${exp.title} at ${exp.company} (${exp.duration})`);
      });
    }
    
    if (profile.education && profile.education.length > 0) {
      console.log(`🎓 Education:`);
      profile.education.forEach((edu, i) => {
        console.log(`   ${i + 1}. ${edu.school} - ${edu.degree} (${edu.years})`);
      });
    }
    
    // Extract potential profile information from search results
    console.log('\n🔍 EXTRACTED INSIGHTS FROM SEARCH RESULTS:');
    console.log('═══════════════════════════════════════════════');
    
    const allResults = result.sources
      .filter(s => s.success && s.data && s.data.searchResults)
      .flatMap(s => s.data.searchResults);
    
    // Look for patterns in search results
    const insights = extractInsightsFromSearchResults(allResults);
    
    if (insights.length > 0) {
      insights.forEach((insight, i) => {
        console.log(`${i + 1}. ${insight}`);
      });
    } else {
      console.log('No specific insights extracted from search results.');
    }
    
    // Show raw search data for manual inspection
    console.log('\n📄 RAW SEARCH RESULTS FOR MANUAL REVIEW:');
    console.log('═══════════════════════════════════════════');
    
    allResults.slice(0, 5).forEach((result, i) => {
      console.log(`\n${i + 1}. ${result.title}`);
      console.log(`   🔗 ${result.link}`);
      console.log(`   📝 ${result.snippet}`);
    });
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  }
  
  console.log('\n🎯 Detailed profile extraction completed!');
}

function extractInsightsFromSearchResults(results) {
  const insights = [];
  
  results.forEach(result => {
    const text = `${result.title} ${result.snippet}`.toLowerCase();
    
    // Look for name patterns
    if (text.includes('aryan') && text.includes('shah')) {
      insights.push(`Found profile reference: "${result.title}"`);
    }
    
    // Look for company/role patterns
    const companyPatterns = ['ceo', 'founder', 'engineer', 'developer', 'manager', 'director'];
    companyPatterns.forEach(pattern => {
      if (text.includes(pattern)) {
        insights.push(`Potential role: ${pattern} (from "${result.title}")`);
      }
    });
    
    // Look for education patterns
    if (text.includes('university') || text.includes('college') || text.includes('school')) {
      insights.push(`Education reference found in: "${result.title}"`);
    }
    
    // Look for location patterns
    const locationPatterns = ['san francisco', 'new york', 'boston', 'seattle', 'austin', 'chicago'];
    locationPatterns.forEach(location => {
      if (text.includes(location)) {
        insights.push(`Potential location: ${location} (from "${result.title}")`);
      }
    });
  });
  
  // Remove duplicates
  return [...new Set(insights)];
}

// Run the test
testDetailedProfileExtraction().catch(console.error);
