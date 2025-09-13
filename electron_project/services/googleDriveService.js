const { google } = require('googleapis');
const { GoogleAuth } = require('google-auth-library');
const axios = require('axios');

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
   * Get file metadata from Google Drive
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
        fields: 'id,name,mimeType,size,createdTime,modifiedTime,owners,permissions,description,webViewLink'
      });

      const file = response.data;
      return {
        success: true,
        metadata: {
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          size: file.size,
          createdTime: file.createdTime,
          modifiedTime: file.modifiedTime,
          owners: file.owners,
          description: file.description,
          webViewLink: file.webViewLink,
          fileType: this.getFileTypeFromMimeType(file.mimeType)
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        fileId: fileId
      };
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
      // Parse URL to get file ID and type
      const urlInfo = this.parseGoogleDriveUrl(url);
      if (!urlInfo.success) {
        return urlInfo;
      }

      // Get file metadata to determine exact type
      const metadata = await this.getFileMetadata(urlInfo.fileId);
      if (!metadata.success) {
        return metadata;
      }

      const fileType = metadata.metadata.fileType;
      const fileId = urlInfo.fileId;

      // Route to appropriate extraction method based on file type
      switch (fileType) {
        case 'document':
          return await this.extractGoogleDocsContent(fileId);
        
        case 'spreadsheet':
          return await this.extractGoogleSheetsContent(fileId);
        
        case 'presentation':
          return await this.extractGoogleSlidesContent(fileId);
        
        default:
          return {
            success: false,
            error: `Unsupported file type: ${fileType}`,
            fileId: fileId,
            metadata: metadata.metadata
          };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
        url: url
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
