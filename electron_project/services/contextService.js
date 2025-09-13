const UrlContentService = require('./urlContentService');
const GeminiService = require('./geminiService');
const BrowserService = require('./browserService');
const AlternativeProfileService = require('./alternativeProfileService');
const GoogleDriveService = require('./googleDriveService');

class ContextService {
  constructor() {
    this.urlContentService = new UrlContentService();
    this.geminiService = new GeminiService();
    this.browserService = new BrowserService();
    this.alternativeProfileService = new AlternativeProfileService();
    this.googleDriveService = new GoogleDriveService();
    this.cache = new Map();
    this.cacheTimeout = 30 * 60 * 1000; // 30 minutes
  }

  /**
   * Retrieve and analyze URL context
   * @param {string} url - The URL to analyze
   * @param {string} query - Optional specific query
   * @returns {Promise<Object>} Complete context analysis
   */
  async retrieveUrlContext(url, query = null) {
    try {
      console.log('Retrieving context for URL:', url);
      
      // Check if this is a Google Drive URL
      if (this.isGoogleDriveUrl(url)) {
        console.log('Detected Google Drive URL, using Google Drive service');
        return await this.handleGoogleDriveUrl(url, query);
      }
      
      // Check cache first
      const cacheKey = `${url}_${query || 'default'}`;
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        console.log('Returning cached result');
        return cached;
      }
      
      // Try direct URL analysis first (new Gemini capability)
      console.log('Attempting direct URL analysis with Gemini:', url);
      const directAnalysis = await this.geminiService.analyzeUrlDirect(url, query);
      
      if (directAnalysis.success && directAnalysis.analysis && 
          !directAnalysis.analysis.includes('Please provide') && 
          !directAnalysis.analysis.includes('provide me with')) {
        const result = {
          success: true,
          url: url,
          analysis: directAnalysis.analysis,
          urlMetadata: directAnalysis.urlMetadata,
          method: 'direct',
          timestamp: new Date().toISOString(),
          cached: false
        };
        
        // Cache the result
        this.cache.set(cacheKey, { ...result, cached: true });
        return result;
      }
      
      // Fallback to traditional scraping method
      console.log('Direct analysis failed, falling back to scraping for:', url);
      const urlContent = await this.urlContentService.fetchUrlContent(url);
      
      if (!urlContent.success) {
        return urlContent; // Return error from URL fetching
      }

      // Analyze content with Gemini
      const analysis = await this.geminiService.analyzeUrlContent(
        url, 
        urlContent.content, 
        query
      );
      
      // Extract key information
      const keyInfo = await this.geminiService.extractKeyInformation(
        url, 
        urlContent.content
      );
      
      // Generate contextual questions
      const questions = await this.geminiService.generateContextualQuestions(
        url, 
        urlContent.content
      );
      
      const result = {
        success: true,
        url: url,
        content: urlContent,
        analysis: analysis.success ? analysis.analysis : null,
        keyInformation: keyInfo.success ? keyInfo.data : null,
        contextualQuestions: questions.success ? questions.questions : [],
        method: 'scraping',
        timestamp: new Date().toISOString(),
        cached: false
      };
      
      // Cache the result
      this.cache.set(cacheKey, { ...result, cached: true });
      
      return result;

    } catch (error) {
      console.error('Context retrieval error:', error);
      return {
        success: false,
        error: error.message,
        url: url,
        query: query,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get raw scraped content without AI analysis
   * @param {string} url - The URL to scrape
   * @param {boolean} useBrowser - Whether to use browser automation for anti-scraping bypass
   * @returns {Promise<Object>} Raw content data
   */
  async getRawContent(url, useBrowser = false) {
    try {
      console.log('Fetching raw content from:', url);
      
      // Try browser automation first for LinkedIn and other protected sites
      if (useBrowser || url.includes('linkedin.com')) {
        console.log('Using browser automation for:', url);
        const browserResult = await this.browserService.fetchUrlWithBrowser(url, true); // Enable bypass
        if (browserResult.success) {
          // Check if we got actual content or just login page
          const isLoginPage = browserResult.content?.includes('Join LinkedIn') || 
                             browserResult.content?.includes('Sign Up') ||
                             browserResult.title?.includes('Sign Up');
          
          if (!isLoginPage) {
            return browserResult;
          } else {
            console.log('Browser returned login page, trying alternative sources...');
            // Try alternative profile sources for LinkedIn
            if (url.includes('linkedin.com')) {
              const altResult = await this.alternativeProfileService.getProfileFromAlternatives(url);
              if (altResult.sources.length > 0) {
                return {
                  success: true,
                  method: 'alternative_sources',
                  content: JSON.stringify(altResult.aggregatedData, null, 2),
                  title: `Profile data from ${altResult.sources.length} alternative sources`,
                  description: 'Aggregated profile information from multiple sources',
                  sources: altResult.sources,
                  domain: new URL(url).hostname,
                  timestamp: new Date().toISOString()
                };
              }
            }
          }
        }
        console.log('Browser method failed, falling back to HTTP scraping');
      }
      
      // Fallback to HTTP scraping
      const contentResult = await this.urlContentService.fetchUrlContent(url);
      
      if (contentResult.success) {
        return {
          success: true,
          url: url,
          title: contentResult.title,
          description: contentResult.description,
          content: contentResult.content,
          links: contentResult.links,
          headings: contentResult.headings,
          wordCount: contentResult.wordCount,
          domain: contentResult.domain,
          timestamp: contentResult.timestamp,
          method: 'scraping'
        };
      } else {
        return contentResult;
      }
    } catch (error) {
      console.error('Raw content retrieval error:', error);
      return {
        success: false,
        error: error.message,
        url: url,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get quick summary of URL without full analysis
   * @param {string} url - The URL to summarize
   * @returns {Promise<Object>} Quick summary
   */
  async getUrlSummary(url) {
    try {
      // Check accessibility first
      const accessibility = await this.urlContentService.checkUrlAccessibility(url);
      if (!accessibility.accessible) {
        return {
          success: false,
          error: `URL not accessible: ${accessibility.error}`,
          url: url
        };
      }

      // Fetch basic content
      const contentResult = await this.urlContentService.fetchUrlContent(url);
      if (!contentResult.success) {
        return {
          success: false,
          error: contentResult.error,
          url: url
        };
      }

      return {
        success: true,
        url: url,
        title: contentResult.title,
        description: contentResult.description,
        domain: contentResult.domain,
        wordCount: contentResult.wordCount,
        accessible: true,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        url: url,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Batch process multiple URLs
   * @param {Array<string>} urls - Array of URLs to process
   * @param {string} query - Optional query for all URLs
   * @returns {Promise<Array>} Array of context results
   */
  async batchRetrieveUrlContext(urls, query = null) {
    const results = [];
    const maxConcurrent = 3; // Limit concurrent requests

    for (let i = 0; i < urls.length; i += maxConcurrent) {
      const batch = urls.slice(i, i + maxConcurrent);
      const batchPromises = batch.map(url => 
        this.retrieveUrlContext(url, query).catch(error => ({
          success: false,
          error: error.message,
          url: url
        }))
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Small delay between batches to be respectful
      if (i + maxConcurrent < urls.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return results;
  }

  /**
   * Simple cache management
   * @private
   */
  addToCache(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Get from cache if not expired
   * @private
   */
  getFromCache(key) {
    const cached = this.cache.get(key);
    if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
      return cached.data;
    }
    if (cached) {
      this.cache.delete(key); // Remove expired cache
    }
    return null;
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Collect errors from multiple service results
   * @private
   */
  collectErrors(results) {
    return results
      .filter(result => !result.success)
      .map(result => ({
        service: result.constructor?.name || 'unknown',
        error: result.error
      }));
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }

  /**
   * Check if URL is a Google Drive URL
   * @param {string} url - URL to check
   * @returns {boolean} True if Google Drive URL
   */
  isGoogleDriveUrl(url) {
    return url.includes('docs.google.com') || 
           url.includes('drive.google.com') ||
           url.includes('sheets.google.com') ||
           url.includes('slides.google.com');
  }

  /**
   * Handle Google Drive URL extraction and analysis
   * @param {string} url - Google Drive URL
   * @param {string} query - Optional query
   * @returns {Promise<Object>} Google Drive content analysis
   */
  async handleGoogleDriveUrl(url, query = null) {
    try {
      // Check cache first
      const cacheKey = `gdrive_${url}_${query || 'default'}`;
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        console.log('Returning cached Google Drive result');
        return cached;
      }

      // Extract content using Google Drive service
      const driveResult = await this.googleDriveService.extractContent(url);
      
      if (!driveResult.success) {
        return {
          success: false,
          error: `Google Drive extraction failed: ${driveResult.error}`,
          url: url,
          service: 'google_drive'
        };
      }

      // Analyze content with AI if query is provided
      let analysis = null;
      if (query && driveResult.content) {
        const analysisResult = await this.geminiService.analyzeContent(
          driveResult.content, 
          query
        );
        if (analysisResult.success) {
          analysis = analysisResult.analysis;
        }
      }

      const result = {
        success: true,
        url: url,
        service: 'google_drive',
        fileType: driveResult.type,
        title: driveResult.title,
        content: driveResult.content,
        metadata: driveResult.metadata,
        analysis: analysis,
        wordCount: driveResult.wordCount || 0,
        timestamp: new Date().toISOString()
      };

      // Cache the result
      this.addToCache(cacheKey, result);
      return result;

    } catch (error) {
      return {
        success: false,
        error: error.message,
        url: url,
        service: 'google_drive',
        timestamp: new Date().toISOString()
      };
    }
  }
}

module.exports = ContextService;
