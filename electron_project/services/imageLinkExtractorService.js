const { createWorker } = require('tesseract.js');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const { URL } = require('url');
const GoogleDriveService = require('./googleDriveService');

class ImageLinkExtractorService {
  constructor() {
    this.worker = null;
    this.googleDriveService = new GoogleDriveService();
  }

  /**
   * Initialize the OCR worker
   */
  async initialize() {
    try {
      // Simple initialization without custom paths
      this.worker = await createWorker('eng');
      console.log('OCR worker initialized successfully');
    } catch (error) {
      console.error('Failed to initialize OCR worker:', error);
      throw new Error(`OCR initialization failed: ${error.message}`);
    }
  }

  /**
   * Extract text from an image using OCR
   * @param {string} imagePath - Path to the image file
   * @returns {Promise<string>} Extracted text
   */
  async extractTextFromImage(imagePath) {
    try {
      if (!this.worker) {
        await this.initialize();
      }
      
      const { data: { text } } = await this.worker.recognize(imagePath);
      return text;
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
      // 1. Extract text from image using OCR
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
   * Clean up resources
   */
  async cleanup() {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
  }
}

module.exports = ImageLinkExtractorService;
