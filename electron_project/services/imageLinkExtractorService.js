const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const { URL } = require('url');
const GoogleDriveService = require('./googleDriveService');

class ImageLinkExtractorService {
  constructor() {
    this.anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    this.ai = null;
    this.googleDriveService = new GoogleDriveService();
    
    // Initialize Anthropic AI service if API key is available
    if (this.anthropicApiKey) {
      try {
        this.ai = new Anthropic({
          apiKey: this.anthropicApiKey,
        });
        console.log('Anthropic Claude AI initialized for text extraction');
      } catch (error) {
        console.error('Failed to initialize Anthropic AI for text extraction:', error);
        this.ai = null;
      }
    } else {
      console.warn('ANTHROPIC_API_KEY not found - text extraction will be unavailable');
    }
  }

  /**
   * Initialize the service
   */
  async initialize() {
    try {
      console.log('Text extraction service initialized with Anthropic Claude');
      return true;
    } catch (error) {
      console.error('Failed to initialize text extraction service:', error);
      throw new Error(`Text extraction initialization failed: ${error.message}`);
    }
  }

  /**
   * Extract text from an image using Anthropic Claude
   * @param {string} imagePath - Path to the image file
   * @returns {Promise<string>} Extracted text
   */
  async extractTextFromImage(imagePath) {
    try {
      if (!this.ai) {
        throw new Error('Anthropic AI service not available (missing API key)');
      }
      
      // Read image file as base64
      const imageBuffer = await fs.promises.readFile(imagePath);
      const base64Image = imageBuffer.toString('base64');
      const mimeType = this.getMimeType(imagePath);

      const prompt = `Extract all text content from this image. Please provide:
1. All visible text exactly as it appears
2. Preserve formatting, line breaks, and structure as much as possible
3. Include URLs, email addresses, and any other text-based content
4. If there are multiple columns or sections, clearly separate them

Please return only the extracted text without any additional commentary or formatting.`;

      const message = await this.ai.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        messages: [{
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mimeType,
                data: base64Image,
              },
            },
            {
              type: "text",
              text: prompt,
            },
          ],
        }],
      });

      const extractedText = message.content[0].text;
      return extractedText.trim();
      
    } catch (error) {
      console.error('Error extracting text from image:', error);
      throw error;
    }
  }

  /**
   * Extract URLs from text using regex
   * @param {string} text - Text to search for URLs
   * @returns {Array<string>} Array of found URLs
   */
  extractUrlsFromText(text) {
    if (!text) return [];
    
    // Enhanced URL matching patterns
    const urlPatterns = [
      // Google Docs/Drive URLs (most specific first)
      /(?:https?:\/\/)?(?:drive|docs)\.google\.com\/[^\s\n<>"]+/gi,
      // Google Docs ID pattern (matches document IDs)
      /(?:^|\s)(docs\.google\.com\/document\/d\/[a-zA-Z0-9-_]+(?:\/[^\s\n<>"]*)?)/gi,
      // Google Drive file pattern
      /(?:^|\s)(drive\.google\.com\/file\/d\/[a-zA-Z0-9-_]+(?:\/[^\s\n<>"]*)?)/gi,
      // Standard URL pattern with https?:
      /(https?:\/\/[^\s\n<>"]+)/g,
      // Common domain patterns without protocol
      /(?:^|\s)((?:www|docs|drive)\.(?:google\.com|google\.com\.[a-z]{2,})\/[^\s\n<>"]+)/gi,
      // Google Docs ID pattern (matches document IDs without domain)
      /(?:^|\s)(\/document\/d\/[a-zA-Z0-9-_]+(?:\/[^\s\n<>"]*)?)/gi
    ];
    
    const urls = new Set();
    
    // Try all patterns and collect unique URLs
    for (const pattern of urlPatterns) {
      const matches = text.match(pattern) || [];
      matches.forEach(url => {
        // Clean up the URL (remove trailing punctuation, etc.)
        let cleanUrl = url.trim();
        
        // Clean up common OCR artifacts
        cleanUrl = cleanUrl
          .replace(/[.,;:!?)\]}>'"`]+$/, '')  // Remove trailing punctuation
          .replace(/\s+/g, '')                // Remove all whitespace
          .replace(/^\/+|\/+$/g, '')          // Remove leading/trailing slashes
          .replace(/([^:/])\/+/g, '$1/')      // Fix multiple slashes
          .replace(/\/\//g, '/')              // Fix double slashes
          .replace(':/', '://');               // Fix protocol
        
        // Add https:// if needed
        if (!cleanUrl.match(/^https?:\/\//)) {
          if (cleanUrl.startsWith('www.') || 
              cleanUrl.startsWith('docs.') || 
              cleanUrl.startsWith('drive.')) {
            cleanUrl = 'https://' + cleanUrl;
          } else if (cleanUrl.startsWith('/document/d/')) {
            cleanUrl = 'https://docs.google.com' + cleanUrl;
          } else if (cleanUrl.startsWith('/file/d/')) {
            cleanUrl = 'https://drive.google.com' + cleanUrl;
          }
        }
        
        // Special handling for Google Docs/Drive URLs
        if (cleanUrl.includes('google.com')) {
          // Ensure proper formatting for Google Docs/Drive URLs
          cleanUrl = cleanUrl
            .replace(/\/edit.*$/, '')  // Remove edit parameters
            .replace(/\/view.*$/, '')  // Remove view parameters
            .replace(/\/preview.*$/, '') // Remove preview parameters
            .replace(/\?.*$/, '');     // Remove query parameters
            
          // Add /edit at the end for Google Docs if not present
          if (cleanUrl.includes('/document/d/') && !cleanUrl.endsWith('/edit')) {
            cleanUrl += '/edit';
          }
        }
        
        // Validate URL
        try {
          // Skip empty or very short URLs
          if (cleanUrl.length < 10) return;
          
          // Skip common false positives
          if (cleanUrl.includes('javascript:') || 
              cleanUrl.includes('mailto:') ||
              cleanUrl.includes('data:')) {
            return;
          }
          
          // If we have a Google Docs ID, construct the proper URL
          const docIdMatch = cleanUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
          if (docIdMatch && docIdMatch[1]) {
            cleanUrl = `https://docs.google.com/document/d/${docIdMatch[1]}/edit`;
          }
          
          // Final validation
          new URL(cleanUrl);
          urls.add(cleanUrl);
          
        } catch (e) {
          // If URL is still invalid, log it for debugging
          console.log('Skipping invalid URL:', cleanUrl);
        }
      });
    }
    
    return Array.from(urls);
  }

  /**
   * Check if a URL is a Google Drive link
   * @param {string} url - URL to check
   * @returns {boolean}
   */
  isGoogleDriveUrl(url) {
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.hostname.includes('drive.google.com') || 
             parsedUrl.hostname.includes('docs.google.com');
    } catch (e) {
      return false;
    }
  }

  /**
   * Process an image to extract and handle links
   * @param {string} imagePath - Path to the image file
   * @returns {Promise<Object>} Result containing links and extracted content
   */
  async processImageForLinks(imagePath) {
    try {
      // 1. Extract text from image using Anthropic Claude
      const extractedText = await this.extractTextFromImage(imagePath);
      console.log('Extracted text from image:', extractedText);
      
      // 2. Find all URLs in the extracted text
      const urls = this.extractUrlsFromText(extractedText);
      console.log('Found URLs:', urls);
      
      // 3. Process each URL
      const results = [];
      
      for (const url of urls) {
        const result = {
          url,
          type: this.isGoogleDriveUrl(url) ? 'google_drive' : 'web',
          content: null,
          error: null
        };

        try {
          if (result.type === 'google_drive') {
            // Use our Google Drive service to process the document
            result.content = await this.googleDriveService.extractContent(url);
          } else {
            // For regular web pages, we can use a simple fetch
            const response = await axios.get(url);
            result.content = response.data;
          }
        } catch (error) {
          result.error = error.message;
          console.error(`Error processing URL ${url}:`, error);
        }
        
        results.push(result);
      }

      return {
        success: true,
        extractedText,
        urls: results
      };
    } catch (error) {
      console.error('Error processing image:', error);
      return {
        success: false,
        error: error.message,
        extractedText: '',
        urls: []
      };
    }
  }

  /**
   * Get MIME type from file extension
   * @private
   */
  getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp'
    };
    return mimeTypes[ext] || 'image/png';
  }

  /**
   * Clean up resources
   */
  async cleanup() {
    // No cleanup needed for Anthropic API
    console.log('Text extraction service cleanup completed');
  }
}

module.exports = ImageLinkExtractorService;
