const { google } = require('googleapis');
const { GoogleAuth } = require('google-auth-library');
const fs = require('fs');
const path = require('path');

// The Google Doc ID from the URL
const DOCUMENT_ID = '13VXHDOWkk8FIa6teGfscrmX6KzpHGN-xG4gsKynTafI';

async function testPublicDocument() {
  try {
    console.log('🔍 Testing access to public Google Doc');
    console.log('═══════════════════════════════════');
    
    // Create a client that doesn't require authentication for public docs
    const docs = google.docs({
      version: 'v1',
      auth: new GoogleAuth()
    });

    console.log('📄 Fetching document...');
    const doc = await docs.documents.get({
      documentId: DOCUMENT_ID,
    });

    // Extract document data
    const { title, body } = doc.data;
    
    // Extract text content
    let textContent = '';
    if (body.content) {
      textContent = body.content
        .filter(item => item.paragraph)
        .map(item => {
          return item.paragraph.elements
            .filter(el => el.textRun)
            .map(el => el.textRun.content)
            .join('');
        })
        .join('\n');
    }

    console.log('\n📋 Document Information:');
    console.log('---------------------');
    console.log('Title:', title);
    console.log('Character count:', textContent.length);
    
    console.log('\n📜 Content Preview (first 500 chars):');
    console.log('---------------------');
    console.log(textContent.substring(0, 500) + '...');
    
    console.log('\n✅ Test completed successfully!');
    
  } catch (error) {
    console.error('❌ Error accessing document:');
    console.error(error.message);
    
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
    
    console.log('\nℹ️  Note: The document might not be publicly accessible.');
    console.log('Please make sure the document is shared with "Anyone with the link" can view.');
  }
}

// Run the test
testPublicDocument().catch(console.error);
