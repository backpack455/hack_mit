const fs = require('fs').promises;
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const ImageLinkExtractorService = require('./imageLinkExtractorService');
const GoogleDriveService = require('./googleDriveService');

/**
 * Comprehensive screenshot processing service that handles:
 * 1. AI-generated visual descriptions
 * 2. OCR text extraction
 * 3. URL detection and content retrieval
 * 4. Context file aggregation
 * 5. Session cleanup for temporary files
 */
class ScreenshotProcessingService {
  constructor() {
    this.anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    this.ai = null;
    this.imageLinkExtractor = new ImageLinkExtractorService();
    this.googleDriveService = new GoogleDriveService();
    this.sessionData = new Map(); // Store session-specific data
    this.tempFiles = new Set(); // Track temporary files for cleanup
    
    // Initialize Anthropic AI service if API key is available
    if (this.anthropicApiKey) {
      try {
        this.ai = new Anthropic({
          apiKey: this.anthropicApiKey,
        });
        console.log('Anthropic Claude AI initialized successfully');
      } catch (error) {
        console.error('Failed to initialize Anthropic AI:', error);
        this.ai = null;
      }
    } else {
      console.warn('ANTHROPIC_API_KEY not found in environment variables');
    }
  }

  /**
   * Initialize the service and its dependencies
   */
  async initialize() {
    try {
      // Initialize OCR service
      await this.imageLinkExtractor.initialize();
      
      // Initialize Google Drive service if credentials are available
      const googleCredentials = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
      if (googleCredentials) {
        try {
          const credentials = JSON.parse(googleCredentials);
          await this.googleDriveService.initialize(credentials);
          console.log('Google Drive service initialized');
        } catch (error) {
          console.warn('Google Drive service initialization failed:', error.message);
        }
      }
      
      console.log('Screenshot processing service initialized');
      return true;
    } catch (error) {
      console.error('Failed to initialize screenshot processing service:', error);
      throw error;
    }
  }

  /**
   * Generate AI-powered visual description of a screenshot
   * @param {string} imagePath - Path to the screenshot
   * @param {string} sessionId - Session identifier
   * @returns {Promise<Object>} AI description result
   */
  async generateVisualDescription(imagePath, sessionId) {
    try {
      if (!this.ai) {
        return {
          success: false,
          error: 'Anthropic AI service not available (missing API key)',
          description: 'AI description unavailable'
        };
      }

      // Check if file exists and is readable
      try {
        await fs.access(imagePath);
      } catch (error) {
        console.error('Screenshot file does not exist or is not accessible:', imagePath);
        throw new Error(`Screenshot file not found: ${imagePath}`);
      }

      // Read image file as base64
      const imageBuffer = await fs.readFile(imagePath);
      
      // Validate that we actually got data
      if (!imageBuffer || imageBuffer.length === 0) {
        console.error('Screenshot file is empty or corrupted:', imagePath);
        throw new Error('Screenshot file is empty or corrupted');
      }
      
      const base64Image = imageBuffer.toString('base64');
      
      // Validate base64 conversion
      if (!base64Image || base64Image.length === 0) {
        console.error('Failed to convert screenshot to base64:', imagePath);
        throw new Error('Failed to convert screenshot to base64');
      }
      
      const mimeType = this.getMimeType(imagePath);
      console.log(`📸 Processing screenshot: ${imagePath}, size: ${imageBuffer.length} bytes, base64 length: ${base64Image.length}`);

      const prompt = `Analyze this screenshot and provide a concise, informative description. Focus on:
1. What type of application or interface is shown
2. Key visible elements (buttons, text, menus, content)
3. The apparent purpose or context of what's displayed
4. Any notable information or data visible

Keep the description under 150 words and make it useful for context understanding.`;

      const message = await this.ai.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 300,
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

      const description = message.content[0].text;

      return {
        success: true,
        description: description.trim(),
        timestamp: new Date().toISOString(),
        sessionId: sessionId
      };
    } catch (error) {
      console.error('Error generating visual description:', error);
      return {
        success: false,
        error: error.message,
        description: 'Failed to generate AI description'
      };
    }
  }

  /**
   * Process a screenshot comprehensively
   * @param {string} imagePath - Path to the screenshot
   * @param {string} sessionId - Session identifier
   * @returns {Promise<Object>} Complete processing result
   */
  async processScreenshot(imagePath, sessionId) {
    try {
      const startTime = Date.now();
      const timestamp = new Date().toISOString();
      
      console.log(`Processing screenshot: ${imagePath} for session: ${sessionId}`);

      // Initialize session data if not exists
      if (!this.sessionData.has(sessionId)) {
        this.sessionData.set(sessionId, {
          screenshots: [],
          contextFiles: [],
          startTime: timestamp,
          tempFiles: new Set()
        });
      }

      const sessionInfo = this.sessionData.get(sessionId);

      // 1. Generate AI visual description
      console.log('Generating AI visual description...');
      const visualDescription = await this.generateVisualDescription(imagePath, sessionId);

      // 2. Extract text using OCR and find URLs
      console.log('Extracting text and URLs...');
      const ocrResult = await this.imageLinkExtractor.processImageForLinks(imagePath);

      // 3. Process found URLs and extract content
      const urlContents = [];
      if (ocrResult.success && ocrResult.urls.length > 0) {
        console.log(`Processing ${ocrResult.urls.length} found URLs...`);
        
        for (const urlResult of ocrResult.urls) {
          if (urlResult.content && urlResult.content.success) {
            urlContents.push({
              url: urlResult.url,
              type: urlResult.type,
              title: urlResult.content.title || 'Untitled',
              content: urlResult.content.content || urlResult.content.text || '',
              metadata: urlResult.content.metadata || {},
              extractedAt: timestamp
            });
          }
        }
      }

      // 4. Create comprehensive screenshot data
      const screenshotData = {
        id: `screenshot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        sessionId: sessionId,
        imagePath: imagePath,
        timestamp: timestamp,
        processingTime: Date.now() - startTime,
        
        // AI Visual Description
        visualDescription: {
          success: visualDescription.success,
          description: visualDescription.description,
          error: visualDescription.error
        },
        
        // OCR Results
        ocrText: {
          success: ocrResult.success,
          extractedText: ocrResult.extractedText || '',
          error: ocrResult.error
        },
        
        // URL Detection and Content
        urls: {
          found: ocrResult.urls?.map(u => u.url) || [],
          processed: urlContents,
          count: urlContents.length
        },
        
        // Processing metadata
        metadata: {
          fileSize: (await fs.stat(imagePath)).size,
          fileName: path.basename(imagePath),
          processingVersion: '1.0.0'
        }
      };

      // 5. Add to session data
      sessionInfo.screenshots.push(screenshotData);

      // 6. Append new screenshot context to single session file
      const sessionContextPath = await this.appendToSessionContextFile(sessionId, screenshotData);
      if (sessionContextPath) {
        sessionInfo.sessionContextFile = sessionContextPath;
        // Only mark session context file for cleanup on app termination
        if (!sessionInfo.tempFiles.has(sessionContextPath)) {
          sessionInfo.tempFiles.add(sessionContextPath);
          this.tempFiles.add(sessionContextPath);
        }
      }

      console.log(`Screenshot processing completed in ${Date.now() - startTime}ms`);

      return {
        success: true,
        data: screenshotData,
        contextFile: sessionContextPath,
        sessionId: sessionId
      };

    } catch (error) {
      console.error('Error processing screenshot:', error);
      return {
        success: false,
        error: error.message,
        sessionId: sessionId
      };
    }
  }

  /**
   * Generate context file for a screenshot
   * @param {string} sessionId - Session identifier
   * @param {Object} screenshotData - Processed screenshot data
   * @returns {Promise<string>} Path to generated context file
   */
  async generateContextFile(sessionId, screenshotData) {
    try {
      const contextDir = path.join(__dirname, '..', 'temp', 'contexts');
      await fs.mkdir(contextDir, { recursive: true });

      const contextFileName = `context_${screenshotData.id}.txt`;
      const contextFilePath = path.join(contextDir, contextFileName);

      // Build comprehensive context content
      const contextContent = this.buildContextContent(screenshotData);

      // Write context file
      await fs.writeFile(contextFilePath, contextContent, 'utf8');

      console.log(`Context file generated: ${contextFilePath}`);
      return contextFilePath;

    } catch (error) {
      console.error('Error generating context file:', error);
      return null;
    }
  }

  /**
   * Build formatted context content for a screenshot
   * @param {Object} screenshotData - Processed screenshot data
   * @returns {string} Formatted context content
   */
  buildContextContent(screenshotData) {
    const lines = [];
    
    // Header
    lines.push('='.repeat(80));
    lines.push(`SCREENSHOT CONTEXT - ${screenshotData.timestamp}`);
    lines.push('='.repeat(80));
    lines.push('');
    
    // Basic Information
    lines.push('BASIC INFORMATION:');
    lines.push(`Screenshot ID: ${screenshotData.id}`);
    lines.push(`Session ID: ${screenshotData.sessionId}`);
    lines.push(`File: ${screenshotData.metadata.fileName}`);
    lines.push(`Size: ${(screenshotData.metadata.fileSize / 1024).toFixed(2)} KB`);
    lines.push(`Processing Time: ${screenshotData.processingTime}ms`);
    lines.push('');

    // AI Visual Description
    lines.push('AI VISUAL DESCRIPTION:');
    if (screenshotData.visualDescription.success) {
      lines.push(screenshotData.visualDescription.description);
    } else {
      lines.push(`Error: ${screenshotData.visualDescription.error}`);
    }
    lines.push('');

    // OCR Extracted Text
    lines.push('EXTRACTED TEXT (OCR):');
    if (screenshotData.ocrText.success && screenshotData.ocrText.extractedText.trim()) {
      lines.push(screenshotData.ocrText.extractedText.trim());
    } else {
      lines.push('No text extracted or OCR failed');
      if (screenshotData.ocrText.error) {
        lines.push(`Error: ${screenshotData.ocrText.error}`);
      }
    }
    lines.push('');

    // URLs and Content
    if (screenshotData.urls.found.length > 0) {
      lines.push('DETECTED URLS:');
      screenshotData.urls.found.forEach((url, index) => {
        lines.push(`${index + 1}. ${url}`);
      });
      lines.push('');

      if (screenshotData.urls.processed.length > 0) {
        lines.push('EXTRACTED URL CONTENT:');
        lines.push('-'.repeat(40));
        
        screenshotData.urls.processed.forEach((urlContent, index) => {
          lines.push(`\n[${index + 1}] ${urlContent.title}`);
          lines.push(`URL: ${urlContent.url}`);
          lines.push(`Type: ${urlContent.type}`);
          lines.push(`Extracted: ${urlContent.extractedAt}`);
          lines.push('');
          
          if (urlContent.content) {
            // Limit content length for readability
            const content = urlContent.content.length > 2000 
              ? urlContent.content.substring(0, 2000) + '\n\n[Content truncated...]'
              : urlContent.content;
            lines.push('Content:');
            lines.push(content);
          }
          
          if (index < screenshotData.urls.processed.length - 1) {
            lines.push('\n' + '-'.repeat(40));
          }
        });
      }
    } else {
      lines.push('DETECTED URLS: None');
    }
    
    lines.push('');
    lines.push('='.repeat(80));
    lines.push('END OF CONTEXT');
    lines.push('='.repeat(80));

    return lines.join('\n');
  }

  /**
   * Append new screenshot context to single session file
   * @param {string} sessionId - Session identifier
   * @param {Object} screenshotData - New screenshot data to append
   * @returns {Promise<string>} Path to session context file
   */
  async appendToSessionContextFile(sessionId, screenshotData) {
    try {
      const sessionInfo = this.sessionData.get(sessionId);
      if (!sessionInfo) {
        throw new Error(`Session ${sessionId} not found`);
      }

      const contextDir = path.join(__dirname, '..', 'temp', 'contexts');
      await fs.mkdir(contextDir, { recursive: true });

      // Create session-specific context file name with session start timestamp
      const sessionStartTime = sessionInfo.startTime.replace(/:/g, '-').replace(/\./g, '-');
      const sessionContextPath = path.join(contextDir, `context_${sessionId}_${sessionStartTime}.txt`);
      
      let isNewFile = false;
      try {
        await fs.access(sessionContextPath);
      } catch {
        isNewFile = true;
      }
      
      let content = '';
      
      if (isNewFile) {
        // Create new file with header
        content += '='.repeat(100) + '\n';
        content += `SESSION CONTEXT - ${sessionId}\n`;
        content += '='.repeat(100) + '\n';
        content += `Session Start: ${sessionInfo.startTime}\n`;
        content += `Last Updated: ${new Date().toISOString()}\n\n`;
      } else {
        // Update the "Last Updated" line in existing file
        const existingContent = await fs.readFile(sessionContextPath, 'utf8');
        content = existingContent.replace(
          /Last Updated: .*/,
          `Last Updated: ${new Date().toISOString()}`
        );
      }
      
      // Append new screenshot context
      const screenshotIndex = sessionInfo.screenshots.length;
      content += '\n' + '#'.repeat(80) + '\n';
      content += `SCREENSHOT ${screenshotIndex} - ${screenshotData.timestamp}\n`;
      content += '#'.repeat(80) + '\n\n';
      
      // Add AI Description
      content += 'AI VISUAL DESCRIPTION:\n';
      if (screenshotData.visualDescription.success) {
        content += screenshotData.visualDescription.description + '\n';
      } else {
        content += `Error: ${screenshotData.visualDescription.error}\n`;
      }
      content += '\n';
      
      // Add OCR Text
      content += 'EXTRACTED TEXT (OCR):\n';
      if (screenshotData.ocrText.success && screenshotData.ocrText.extractedText.trim()) {
        content += screenshotData.ocrText.extractedText.trim() + '\n';
      } else {
        content += 'No text extracted or OCR failed\n';
        if (screenshotData.ocrText.error) {
          content += `Error: ${screenshotData.ocrText.error}\n`;
        }
      }
      content += '\n';
      
      // Add URLs and Content
      if (screenshotData.urls.found.length > 0) {
        content += 'DETECTED URLS:\n';
        screenshotData.urls.found.forEach((url, index) => {
          content += `${index + 1}. ${url}\n`;
        });
        content += '\n';
        
        if (screenshotData.urls.processed.length > 0) {
          content += 'EXTRACTED URL CONTENT:\n';
          content += '-'.repeat(40) + '\n';
          
          screenshotData.urls.processed.forEach((urlContent, index) => {
            content += `\n[${index + 1}] ${urlContent.title}\n`;
            content += `URL: ${urlContent.url}\n`;
            content += `Type: ${urlContent.type}\n`;
            content += `Extracted: ${urlContent.extractedAt}\n\n`;
            
            if (urlContent.content) {
              const contentText = urlContent.content.length > 2000 
                ? urlContent.content.substring(0, 2000) + '\n\n[Content truncated...]'
                : urlContent.content;
              content += 'Content:\n' + contentText + '\n';
            }
            
            if (index < screenshotData.urls.processed.length - 1) {
              content += '\n' + '-'.repeat(40) + '\n';
            }
          });
        }
      } else {
        content += 'DETECTED URLS: None\n';
      }
      
      content += '\n' + '='.repeat(80) + '\n\n';
      
      // Write the updated content
      await fs.writeFile(sessionContextPath, content, 'utf8');
      
      console.log(`Session context file updated: ${sessionContextPath}`);
      return sessionContextPath;
      
    } catch (error) {
      console.error('Error appending to session context:', error);
      return null;
    }
  }

  /**
   * Update session context file with latest screenshot data (legacy method)
   * @param {string} sessionId - Session identifier
   * @returns {Promise<string>} Path to updated session context file
   */
  async updateSessionContextFile(sessionId) {
    try {
      const sessionInfo = this.sessionData.get(sessionId);
      if (!sessionInfo) {
        throw new Error(`Session ${sessionId} not found`);
      }

      const contextDir = path.join(__dirname, '..', 'temp', 'contexts');
      await fs.mkdir(contextDir, { recursive: true });

      // Create session-specific context file name with session start timestamp
      const sessionStartTime = sessionInfo.startTime.replace(/:/g, '-').replace(/\./g, '-');
      const sessionContextPath = path.join(contextDir, `context_${sessionId}_${sessionStartTime}.txt`);
      
      const lines = [];
      
      // Session header
      lines.push('='.repeat(100));
      lines.push(`SESSION CONTEXT AGGREGATION - ${sessionId}`);
      lines.push('='.repeat(100));
      lines.push(`Session Start: ${sessionInfo.startTime}`);
      lines.push(`Screenshots Processed: ${sessionInfo.screenshots.length}`);
      lines.push(`Last Updated: ${new Date().toISOString()}`);
      lines.push('');

      // Process each screenshot
      sessionInfo.screenshots.forEach((screenshot, index) => {
        lines.push(`\n${'#'.repeat(60)}`);
        lines.push(`SCREENSHOT ${index + 1} - ${screenshot.timestamp}`);
        lines.push(`${'#'.repeat(60)}`);
        lines.push('');
        
        // Add the context content for this screenshot
        lines.push(this.buildContextContent(screenshot));
        lines.push('');
      });

      // Session summary
      lines.push('\n' + '='.repeat(100));
      lines.push('SESSION SUMMARY');
      lines.push('='.repeat(100));
      
      const totalUrls = sessionInfo.screenshots.reduce((sum, s) => sum + s.urls.found.length, 0);
      const totalProcessedUrls = sessionInfo.screenshots.reduce((sum, s) => sum + s.urls.processed.length, 0);
      const totalOcrText = sessionInfo.screenshots.reduce((sum, s) => sum + (s.ocrText.extractedText?.length || 0), 0);
      
      lines.push(`Total Screenshots: ${sessionInfo.screenshots.length}`);
      lines.push(`Total URLs Found: ${totalUrls}`);
      lines.push(`Total URLs Processed: ${totalProcessedUrls}`);
      lines.push(`Total OCR Text Length: ${totalOcrText} characters`);
      lines.push(`Session Duration: ${new Date() - new Date(sessionInfo.startTime)} ms`);
      
      const content = lines.join('\n');
      await fs.writeFile(sessionContextPath, content, 'utf8');

      console.log(`Session context file updated: ${sessionContextPath}`);
      return sessionContextPath;

    } catch (error) {
      console.error('Error updating session context:', error);
      return null;
    }
  }

  /**
   * Generate aggregated session context file (legacy method)
   * @param {string} sessionId - Session identifier
   * @returns {Promise<string>} Path to aggregated context file
   */
  async generateSessionContext(sessionId) {
    try {
      const sessionInfo = this.sessionData.get(sessionId);
      if (!sessionInfo) {
        throw new Error(`Session ${sessionId} not found`);
      }

      const contextDir = path.join(__dirname, '..', 'temp', 'contexts');
      await fs.mkdir(contextDir, { recursive: true });

      // Create session-specific context file name with session start timestamp
      const sessionStartTime = sessionInfo.startTime.replace(/:/g, '-').replace(/\./g, '-');
      const sessionContextPath = path.join(contextDir, `context_${sessionId}_${sessionStartTime}.txt`);
      
      const lines = [];
      
      // Session header
      lines.push('='.repeat(100));
      lines.push(`SESSION CONTEXT AGGREGATION - ${sessionId}`);
      lines.push('='.repeat(100));
      lines.push(`Session Start: ${sessionInfo.startTime}`);
      lines.push(`Screenshots Processed: ${sessionInfo.screenshots.length}`);
      lines.push(`Generated: ${new Date().toISOString()}`);
      lines.push('');

      // Process each screenshot
      sessionInfo.screenshots.forEach((screenshot, index) => {
        lines.push(`\n${'#'.repeat(60)}`);
        lines.push(`SCREENSHOT ${index + 1} - ${screenshot.timestamp}`);
        lines.push(`${'#'.repeat(60)}`);
        lines.push('');
        
        // Add the context content for this screenshot
        lines.push(this.buildContextContent(screenshot));
        lines.push('');
      });

      // Session summary
      lines.push('\n' + '='.repeat(100));
      lines.push('SESSION SUMMARY');
      lines.push('='.repeat(100));
      
      const totalUrls = sessionInfo.screenshots.reduce((sum, s) => sum + s.urls.found.length, 0);
      const totalProcessedUrls = sessionInfo.screenshots.reduce((sum, s) => sum + s.urls.processed.length, 0);
      const totalOcrText = sessionInfo.screenshots.reduce((sum, s) => sum + (s.ocrText.extractedText?.length || 0), 0);
      
      lines.push(`Total Screenshots: ${sessionInfo.screenshots.length}`);
      lines.push(`Total URLs Found: ${totalUrls}`);
      lines.push(`Total URLs Processed: ${totalProcessedUrls}`);
      lines.push(`Total OCR Text Length: ${totalOcrText} characters`);
      lines.push(`Session Duration: ${new Date() - new Date(sessionInfo.startTime)} ms`);
      
      const content = lines.join('\n');
      await fs.writeFile(sessionContextPath, content, 'utf8');

      // Don't track for immediate cleanup - keep persistent during session

      console.log(`Session context file generated: ${sessionContextPath}`);
      return sessionContextPath;

    } catch (error) {
      console.error('Error generating session context:', error);
      throw error;
    }
  }

  /**
   * Get session data
   * @param {string} sessionId - Session identifier
   * @returns {Object} Session data
   */
  getSessionData(sessionId) {
    return this.sessionData.get(sessionId) || null;
  }

  /**
   * Clean up session data and temporary files (only on app termination)
   * @param {string} sessionId - Session identifier to clean up
   */
  async cleanupSession(sessionId) {
    try {
      const sessionInfo = this.sessionData.get(sessionId);
      if (!sessionInfo) {
        console.log(`Session ${sessionId} not found for cleanup`);
        return;
      }

      console.log(`Cleaning up session ${sessionId}...`);

      // No individual context files to delete anymore - only session context file

      // Delete session context file
      if (sessionInfo.sessionContextFile) {
        try {
          await fs.unlink(sessionInfo.sessionContextFile);
          console.log(`Deleted session context file: ${sessionInfo.sessionContextFile}`);
        } catch (error) {
          console.warn(`Failed to delete session context file:`, error.message);
        }
      }

      // Delete any remaining temp files
      for (const filePath of sessionInfo.tempFiles) {
        try {
          await fs.unlink(filePath);
          this.tempFiles.delete(filePath);
          console.log(`Deleted temp file: ${filePath}`);
        } catch (error) {
          console.warn(`Failed to delete temp file ${filePath}:`, error.message);
        }
      }

      // Remove session data
      this.sessionData.delete(sessionId);
      console.log(`Session ${sessionId} cleaned up successfully`);

    } catch (error) {
      console.error(`Error cleaning up session ${sessionId}:`, error);
    }
  }

  /**
   * Clean up all temporary files and sessions
   */
  async cleanupAll() {
    try {
      console.log('Cleaning up all sessions and temporary files...');

      // Clean up all sessions
      for (const sessionId of this.sessionData.keys()) {
        await this.cleanupSession(sessionId);
      }

      // Clean up any remaining temp files
      for (const filePath of this.tempFiles) {
        try {
          await fs.unlink(filePath);
          console.log(`Deleted remaining temp file: ${filePath}`);
        } catch (error) {
          console.warn(`Failed to delete temp file ${filePath}:`, error.message);
        }
      }

      this.tempFiles.clear();
      
      // Cleanup OCR worker
      await this.imageLinkExtractor.cleanup();

      console.log('All cleanup completed');

    } catch (error) {
      console.error('Error during cleanup:', error);
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
   * Get service status and statistics
   * @returns {Object} Service status
   */
  getStatus() {
    return {
      initialized: true,
      aiAvailable: !!this.ai && !!this.anthropicApiKey,
      ocrAvailable: !!this.imageLinkExtractor.worker,
      googleDriveAvailable: this.googleDriveService.isInitialized(),
      activeSessions: this.sessionData.size,
      tempFiles: this.tempFiles.size,
      totalScreenshots: Array.from(this.sessionData.values()).reduce((sum, session) => sum + session.screenshots.length, 0)
    };
  }
}

module.exports = ScreenshotProcessingService;
