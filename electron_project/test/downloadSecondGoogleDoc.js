const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { Readable } = require('stream');
const { finished } = require('stream/promises');

// The new Google Doc ID from the URL
const DOCUMENT_ID = '1xs45yHyY49pxTeo2rD7xn3xlu94LplCpKe3991vrixw';
const OUTPUT_DIR = path.join(__dirname, '..', 'downloads');

// Create downloads directory if it doesn't exist
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function downloadFile(url, outputPath) {
  const writer = fs.createWriteStream(outputPath);
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
  });
  
  response.data.pipe(writer);
  return finished(writer);
}

async function downloadGoogleDoc() {
  try {
    console.log('📥 Downloading Google Doc...');
    console.log('═══════════════════════════════════');
    console.log('Document ID:', DOCUMENT_ID);

    // Download as TXT
    const txtUrl = `https://docs.google.com/document/d/${DOCUMENT_ID}/export?format=txt`;
    const txtPath = path.join(OUTPUT_DIR, 'document2.txt');
    await downloadFile(txtUrl, txtPath);
    console.log(`✅ Text version saved to: ${txtPath}`);

    // Download as PDF
    const pdfUrl = `https://docs.google.com/document/d/${DOCUMENT_ID}/export?format=pdf`;
    const pdfPath = path.join(OUTPUT_DIR, 'document2.pdf');
    await downloadFile(pdfUrl, pdfPath);
    console.log(`✅ PDF version saved to: ${pdfPath}`);

    // Download as DOCX
    const docxUrl = `https://docs.google.com/document/d/${DOCUMENT_ID}/export?format=docx`;
    const docxPath = path.join(OUTPUT_DIR, 'document2.docx');
    await downloadFile(docxUrl, docxPath);
    console.log(`✅ DOCX version saved to: ${docxPath}`);

    // Read and display the first 1000 characters of the text file
    const content = fs.readFileSync(txtPath, 'utf-8');
    console.log('\n📜 Document Preview:');
    console.log('---------------------');
    console.log(content.substring(0, 1000) + '...');
    console.log('\n✅ All downloads completed successfully!');
    console.log(`📁 Files saved in: ${path.resolve(OUTPUT_DIR)}`);

  } catch (error) {
    console.error('❌ Error downloading document:');
    console.error(error.message);
    
    if (error.response) {
      console.error('Status:', error.response.status);
      if (error.response.status === 403) {
        console.log('\n🔐 The document is not publicly accessible.');
        console.log('Please make sure the document is shared with "Anyone with the link" can view.');
      }
    }
  }
}

// Run the download
downloadGoogleDoc().catch(console.error);
