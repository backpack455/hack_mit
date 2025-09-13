const axios = require('axios');

// The Google Doc ID from the URL
const DOCUMENT_ID = '13VXHDOWkk8FIa6teGfscrmX6KzpHGN-xG4gsKynTafI';
const DOC_URL = `https://docs.google.com/document/d/${DOCUMENT_ID}/export?format=txt`;

async function testPublicDocument() {
  try {
    console.log('🔍 Testing access to Google Doc');
    console.log('═══════════════════════════════════');
    
    console.log('📄 Fetching document...');
    
    // Make a GET request to the document's export URL
    const response = await axios.get(DOC_URL, {
      maxRedirects: 5,
      // Add a user agent to prevent 403 Forbidden
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    const content = response.data;
    
    console.log('\n📜 Document Content:');
    console.log('---------------------');
    console.log(content.substring(0, 500) + '...');
    
    console.log('\n✅ Test completed successfully!');
    
  } catch (error) {
    console.error('❌ Error accessing document:');
    console.error(error.message);
    
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Headers:', error.response.headers);
      
      if (error.response.status === 403) {
        console.log('\n🔐 The document is not publicly accessible.');
        console.log('Please make sure the document is shared with "Anyone with the link" can view.');
      }
    }
  }
}

// Run the test
testPublicDocument().catch(console.error);
