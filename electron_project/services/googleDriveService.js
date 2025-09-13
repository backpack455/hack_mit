const { google } = require('googleapis');
const { GoogleAuth } = require('google-auth-library');
const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Google Drive integration service for extracting content from Google Docs and Drive files
 * Implements MCP-style interface for consistency with existing services
 */
class GoogleDriveService {
  constructor() {
    this.auth = null;
    this.drive = null;
    this.docs = null;
    this.sheets = null;
    this.slides = null;
    this.supportedFileTypes = {
      'document': ['application/vnd.google-apps.document'],
      'spreadsheet': ['application/vnd.google-apps.spreadsheet'],
      'presentation': ['application/vnd.google-apps.presentation'],
      'pdf': ['application/pdf'],
      'text': ['text/plain'],
      'docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      'xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
      'pptx': ['application/vnd.openxmlformats-officedocument.presentationml.presentation']
    };
  }

  /**
   * Initialize Google Drive API authentication
   * @param {Object} credentials - Google API credentials
   * @returns {Promise<boolean>} Success status
   */
  async initialize(credentials = null) {
    try {
      if (credentials) {
        // Use provided service account credentials
        this.auth = new GoogleAuth({
          credentials,
          scopes: [
            'https://www.googleapis.com/auth/drive.readonly',
            'https://www.googleapis.com/auth/documents.readonly',
            'https://www.googleapis.com/auth/spreadsheets.readonly',
            'https://www.googleapis.com/auth/presentations.readonly'
          ]
        });
      } else {
        // Use application default credentials or environment variables
        this.auth = new GoogleAuth({
          scopes: [
            'https://www.googleapis.com/auth/drive.readonly',
            'https://www.googleapis.com/auth/documents.readonly',
            'https://www.googleapis.com/auth/spreadsheets.readonly',
            'https://www.googleapis.com/auth/presentations.readonly'
          ]
        });
      }

      // Initialize API clients
      this.drive = google.drive({ version: 'v3', auth: this.auth });
      this.docs = google.docs({ version: 'v1', auth: this.auth });
      this.sheets = google.sheets({ version: 'v4', auth: this.auth });
      this.slides = google.slides({ version: 'v1', auth: this.auth });

      return true;
    } catch (error) {
      console.error('Failed to initialize Google Drive service:', error.message);
      return false;
    }
  }

  /**
   * Extract file ID and type from Google Drive URL
   * @param {string} url - Google Drive URL
   * @returns {Object} File ID, type, and metadata
   */
  parseGoogleDriveUrl(url) {
    const patterns = {
      docs: /docs\.google\.com\/document\/d\/([a-zA-Z0-9-_]+)/,
      sheets: /docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/,
      slides: /docs\.google\.com\/presentation\/d\/([a-zA-Z0-9-_]+)/,
      drive: /drive\.google\.com\/file\/d\/([a-zA-Z0-9-_]+)/,
      driveOpen: /drive\.google\.com\/open\?id=([a-zA-Z0-9-_]+)/
    };

    for (const [type, pattern] of Object.entries(patterns)) {
      const match = url.match(pattern);
      if (match) {
        return {
          fileId: match[1],
          type: type === 'drive' || type === 'driveOpen' ? 'unknown' : type,
          url: url,
          success: true
        };
      }
    }

    return {
      success: false,
      error: 'Invalid Google Drive URL format'
    };
  }

  /**
   * Get file metadata
   * @param {string} fileId - Google Drive file ID
   * @returns {Promise<Object>} File metadata
   */
  async getFileMetadata(fileId) {
    try {
      if (!this.drive) {
        throw new Error('Google Drive service not initialized');
      }
      
      const response = await this.drive.files.get({
        fileId: fileId,
        fields: 'id,name,mimeType,createdTime,modifiedTime,size,owners,webViewLink,webContentLink,capabilities',
        supportsAllDrives: true
      });
      
      return {
        success: true,
        metadata: response.data
      };
    } catch (error) {
      console.warn(`Failed to get metadata via API for file ${fileId}, will try public access:`, error.message);
      
      // Try to get basic metadata via public URL
      try {
        const publicUrl = `https://docs.google.com/document/d/${fileId}/edit`;
        const response = await axios.get(publicUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        });
        
        // Extract title from HTML
        const $ = cheerio.load(response.data);
        const title = $('title').text().replace(' - Google Docs', '').trim();
        
        return {
          success: true,
          metadata: {
            id: fileId,
            name: title || 'Untitled Document',
            mimeType: 'application/vnd.google-apps.document',
            webViewLink: `https://docs.google.com/document/d/${fileId}/edit`,
            isPublic: true
          }
        };
      } catch (publicError) {
        return {
          success: false,
          error: `API: ${error.message}, Public: ${publicError.message}`,
          fileId: fileId
        };
      }
    }
  }

  /**
   * Extract content from Google Docs
   * @param {string} fileId - Google Docs file ID
   * @returns {Promise<Object>} Document content and metadata
   */
  async extractGoogleDocsContent(fileId) {
    try {
      if (!this.docs) {
        throw new Error('Google Docs service not initialized');
      }

      const response = await this.docs.documents.get({
        documentId: fileId
      });

      const doc = response.data;
      const content = this.parseDocumentContent(doc);

      return {
        success: true,
        type: 'google_docs',
        fileId: fileId,
        title: doc.title,
        content: content.text,
        structure: content.structure,
        wordCount: content.wordCount,
        metadata: {
          documentId: doc.documentId,
          title: doc.title,
          revisionId: doc.revisionId,
          suggestionsViewMode: doc.suggestionsViewMode
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        fileId: fileId,
        type: 'google_docs'
      };
    }
  }

  /**
   * Scrape Google Doc content from public URL
   * @param {string} fileId - Google Doc file ID
   * @returns {Promise<Object>} Extracted content
   */
  async scrapeGoogleDocContent(fileId) {
    try {
      // Try both the edit and view URLs
      const urls = [
        `https://docs.google.com/document/d/${fileId}/edit`,
        `https://docs.google.com/document/d/${fileId}/view`,
        `https://docs.google.com/document/d/${fileId}/pub`
      ];
      
      let response, lastError;
      
      // Try each URL until one works
      for (const url of urls) {
        try {
          console.log(`Trying URL: ${url}`);
          response = await axios.get(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.5',
              'DNT': '1',
              'Connection': 'keep-alive',
              'Upgrade-Insecure-Requests': '1',
              'Referer': 'https://www.google.com/'
            },
            maxRedirects: 5,
            timeout: 10000,
            validateStatus: null // Accept all status codes
          });
          
          // If we get a redirect to a sign-in page, try the next URL
          if (response.data.includes('accounts.google.com') || 
              response.data.includes('Sign in - Google Accounts')) {
            console.log(`Redirected to sign-in page, trying next URL...`);
            continue;
          }
          
          // If we get here, we have a valid response
          break;
          
        } catch (error) {
          lastError = error;
          console.log(`Error with URL ${url}:`, error.message);
          continue;
        }
      }
      
      if (!response) {
        throw lastError || new Error('All URL attempts failed');
      }
      
      const $ = cheerio.load(response.data);
      
      // Check for sign-in prompts or access denied messages
      const pageText = $('body').text().toLowerCase();
      if (pageText.includes('sign in') && (pageText.includes('account') || pageText.includes('google'))) {
        throw new Error('Document requires Google account sign-in');
      }
      
      if (pageText.includes('access denied') || pageText.includes('permission denied')) {
        throw new Error('You do not have permission to access this document');
      }
      
      // Extract title
      let title = $('title').first().text().replace(' - Google Docs', '').trim();
      if (!title || title === 'Google Docs') {
        // Try alternative title selectors
        title = $('meta[property="og:title"]').attr('content') || 
                $('meta[name="title"]').attr('content') ||
                'Untitled Document';
      }
      
      // Extract content from the document body
      const content = [];
      
      // Try multiple selectors for document content
      const contentSelectors = [
        'div.kix-appview-editor',
        'div.contents',
        'div.doc-content',
        'div.doc-contents',
        'div[role="document"]',
        'div[role="main"]',
        'body'
      ];
      
      for (const selector of contentSelectors) {
        $(selector).find('p, h1, h2, h3, h4, h5, h6, div').each((i, el) => {
          const $el = $(el);
          const text = $el.text().trim();
          
          // Skip empty elements or elements that are likely navigation/UI
          if (text && 
              !$el.hasClass('docs-title') && 
              !$el.hasClass('docs-brand') &&
              !$el.hasClass('docs-title-inner') &&
              !$el.hasClass('docs-brand-name') &&
              !$el.hasClass('docs-title-outer')) {
            
            // Determine element type
            let type = el.tagName.toLowerCase();
            if (type === 'div' && $el.text().length > 100) {
              type = 'p'; // Treat long divs as paragraphs
            }
            
            content.push({
              type: type,
              text: text,
              index: content.length,
              source: selector
            });
          }
        });
        
        // If we found content, no need to try other selectors
        if (content.length > 0) break;
      }
      
      // If still no content, try to get any readable text from the page
      if (content.length === 0) {
        const textNodes = $('*').contents().filter(function() {
          return this.nodeType === 3 && $(this).text().trim().length > 0;
        });
        
        textNodes.each((i, node) => {
          const text = $(node).text().trim();
          if (text.split(/\s+/).length > 3) { // Only include meaningful text blocks
            content.push({
              type: 'p',
              text: text,
              index: i,
              source: 'text_node'
            });
          }
        });
      }
      
      // Combine all text content
      const fullText = content.map(item => item.text).join('\n\n');
      
      if (content.length === 0) {
        throw new Error('Could not extract any meaningful content from the document');
      }
      
      return {
        success: true,
        type: 'google_docs',
        fileId: fileId,
        title: title,
        content: fullText,
        structure: content,
        wordCount: fullText.split(/\s+/).length,
        isPublic: response.status < 400,
        source: 'web_scraping',
        warning: content.length < 3 ? 'Limited content was extracted - document may require authentication' : undefined,
        url: url
      };
    } catch (error) {
      // Provide more detailed error information
      const errorDetails = {
        error: error.message,
        fileId: fileId,
        type: 'google_docs',
        status: error.response?.status,
        statusText: error.response?.statusText,
        url: `https://docs.google.com/document/d/${fileId}/edit`,
        solution: 'The document may be private or require authentication. Try sharing it with the service account or making it public.'
      };
      
      throw new Error(JSON.stringify(errorDetails, null, 2));
    }
  }

  /**
   * Extract content from Google Sheets
   * @param {string} fileId - Google Sheets file ID
   * @returns {Promise<Object>} Spreadsheet content and metadata
   */
  async extractGoogleSheetsContent(fileId) {
    try {
      if (!this.sheets) {
        throw new Error('Google Sheets service not initialized');
      }

      // Get spreadsheet metadata
      const metadataResponse = await this.sheets.spreadsheets.get({
        spreadsheetId: fileId
      });

      const spreadsheet = metadataResponse.data;
      const sheets = [];

      // Extract data from each sheet
      for (const sheet of spreadsheet.sheets) {
        const sheetName = sheet.properties.title;
        const range = `${sheetName}!A1:Z1000`; // Adjust range as needed

        try {
          const valuesResponse = await this.sheets.spreadsheets.values.get({
            spreadsheetId: fileId,
            range: range
          });

          sheets.push({
            name: sheetName,
            data: valuesResponse.data.values || [],
            properties: sheet.properties
          });
        } catch (sheetError) {
          console.warn(`Failed to extract sheet ${sheetName}:`, sheetError.message);
        }
      }

      return {
        success: true,
        type: 'google_sheets',
        fileId: fileId,
        title: spreadsheet.properties.title,
        sheets: sheets,
        metadata: {
          spreadsheetId: spreadsheet.spreadsheetId,
          title: spreadsheet.properties.title,
          locale: spreadsheet.properties.locale,
          timeZone: spreadsheet.properties.timeZone
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        fileId: fileId,
        type: 'google_sheets'
      };
    }
  }

  /**
   * Extract content from Google Slides
   * @param {string} fileId - Google Slides file ID
   * @returns {Promise<Object>} Presentation content and metadata
   */
  async extractGoogleSlidesContent(fileId) {
    try {
      if (!this.slides) {
        throw new Error('Google Slides service not initialized');
      }

      const response = await this.slides.presentations.get({
        presentationId: fileId
      });

      const presentation = response.data;
      const slides = presentation.slides.map(slide => ({
        objectId: slide.objectId,
        content: this.extractSlideText(slide),
        layout: slide.slideProperties?.layoutObjectId
      }));

      return {
        success: true,
        type: 'google_slides',
        fileId: fileId,
        title: presentation.title,
        slides: slides,
        slideCount: slides.length,
        metadata: {
          presentationId: presentation.presentationId,
          title: presentation.title,
          locale: presentation.locale,
          revisionId: presentation.revisionId
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        fileId: fileId,
        type: 'google_slides'
      };
    }
  }

  /**
   * Main method to extract content from any Google Drive file
   * @param {string} url - Google Drive URL
   * @returns {Promise<Object>} Extracted content and metadata
   */
  async extractContent(url) {
    try {
      // Parse the URL to get file ID and type
      const urlInfo = this.parseGoogleDriveUrl(url);
      if (!urlInfo.success) {
        throw new Error(`Invalid Google Drive URL: ${urlInfo.error}`);
      }

      // Get file metadata
      const metadata = await this.getFileMetadata(urlInfo.fileId);
      if (!metadata.success) {
        throw new Error(`Failed to get file metadata: ${metadata.error}`);
      }

      const isPublic = metadata.metadata.isPublic === true;
      const fileType = this.getFileType(metadata.metadata.mimeType);
      
      // For public Google Docs, try scraping first if API access fails
      if (isPublic && fileType === 'document') {
        try {
          return await this.extractGoogleDocsContent(urlInfo.fileId);
        } catch (apiError) {
          console.warn('Falling back to web scraping for document:', apiError.message);
          return this.scrapeGoogleDocContent(urlInfo.fileId);
        }
      }

      // For other file types or private docs, use the standard API flow
      let content;
      
      switch (fileType) {
        case 'document':
          content = await this.extractGoogleDocsContent(urlInfo.fileId);
          break;
        case 'spreadsheet':
          content = await this.extractGoogleSheetsContent(urlInfo.fileId);
          break;
        case 'presentation':
          content = await this.extractGoogleSlidesContent(urlInfo.fileId);
          break;
        case 'pdf':
        case 'text':
        case 'docx':
        case 'xlsx':
        case 'pptx':
          // For binary files, return download URL and metadata
          content = {
            success: true,
            type: fileType,
            fileId: urlInfo.fileId,
            title: metadata.metadata.name,
            downloadUrl: `https://www.googleapis.com/drive/v3/files/${urlInfo.fileId}?alt=media`,
            webViewLink: metadata.metadata.webViewLink,
            mimeType: metadata.metadata.mimeType,
            metadata: {
              createdTime: metadata.metadata.createdTime,
              modifiedTime: metadata.metadata.modifiedTime,
              size: metadata.metadata.size,
              isPublic: isPublic
            }
          };
          break;
        default:
          throw new Error(`Unsupported file type: ${metadata.metadata.mimeType}`);
      }

      return {
        success: true,
        type: fileType,
        fileId: urlInfo.fileId,
        title: metadata.metadata.name,
        mimeType: metadata.metadata.mimeType,
        isPublic: isPublic,
        ...content
      };
    } catch (error) {
      // If we have a file ID but API access failed, try web scraping as last resort
      if (urlInfo && urlInfo.fileId && urlInfo.type === 'docs') {
        try {
          console.warn('Primary extraction failed, attempting web scraping fallback:', error.message);
          return this.scrapeGoogleDocContent(urlInfo.fileId);
        } catch (scrapeError) {
          console.error('Web scraping fallback also failed:', scrapeError.message);
          // Continue to return the original error
        }
      }
      
      return {
        success: false,
        error: error.message,
        url: url,
        fileId: urlInfo?.fileId,
        type: urlInfo?.type
      };
    }
  }

  /**
   * Parse Google Docs document content
   * @private
   */
  parseDocumentContent(doc) {
    let text = '';
    let wordCount = 0;
    const structure = [];

    if (doc.body && doc.body.content) {
      for (const element of doc.body.content) {
        if (element.paragraph) {
          const paragraphText = this.extractParagraphText(element.paragraph);
          text += paragraphText + '\n';
          wordCount += paragraphText.split(/\s+/).filter(word => word.length > 0).length;
          
          // Track structure (headings, etc.)
          if (element.paragraph.paragraphStyle?.namedStyleType) {
            structure.push({
              type: element.paragraph.paragraphStyle.namedStyleType,
              text: paragraphText.substring(0, 100)
            });
          }
        }
      }
    }

    return {
      text: text.trim(),
      wordCount,
      structure
    };
  }

  /**
   * Extract text from paragraph element
   * @private
   */
  extractParagraphText(paragraph) {
    let text = '';
    if (paragraph.elements) {
      for (const element of paragraph.elements) {
        if (element.textRun) {
          text += element.textRun.content;
        }
      }
    }
    return text;
  }

  /**
   * Extract text from slide
   * @private
   */
  extractSlideText(slide) {
    let text = '';
    if (slide.pageElements) {
      for (const element of slide.pageElements) {
        if (element.shape && element.shape.text) {
          for (const textElement of element.shape.text.textElements) {
            if (textElement.textRun) {
              text += textElement.textRun.content;
            }
          }
        }
      }
    }
    return text.trim();
  }

  /**
   * Get file type from MIME type
   * @private
   */
  getFileTypeFromMimeType(mimeType) {
    for (const [type, mimeTypes] of Object.entries(this.supportedFileTypes)) {
      if (mimeTypes.includes(mimeType)) {
        return type;
      }
    }
    return 'unknown';
  }

  /**
   * Check if service is properly initialized
   * @returns {boolean} Initialization status
   */
  isInitialized() {
    return this.auth !== null && this.drive !== null;
  }
}

module.exports = GoogleDriveService;
