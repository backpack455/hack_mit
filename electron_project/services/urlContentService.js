const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');

class UrlContentService {
  constructor() {
    this.timeout = 15000; // 15 second timeout
    this.maxContentLength = 500000; // 500KB limit for larger pages
    this.userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];
  }

  /**
   * Fetch and parse content from a URL
   * @param {string} url - The URL to fetch
   * @returns {Promise<Object>} Parsed content and metadata
   */
  async fetchUrlContent(url) {
    try {
      // Validate URL
      const validatedUrl = this.validateUrl(url);
      if (!validatedUrl.isValid) {
        return {
          success: false,
          error: validatedUrl.error,
          url: url
        };
      }

      // Try multiple strategies to bypass anti-scraping
      const response = await this.fetchWithRetry(url);

      // Parse the HTML content
      const parsedContent = this.parseHtmlContent(response.data, url);
      
      return {
        success: true,
        url: url,
        statusCode: response.status,
        contentType: response.headers['content-type'],
        ...parsedContent,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('URL fetch error:', error.message);
      return {
        success: false,
        error: this.getErrorMessage(error),
        url: url,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Parse HTML content and extract meaningful text
   * @private
   */
  parseHtmlContent(html, url) {
    const $ = cheerio.load(html);
    
    // Remove unwanted elements
    $('script, style, nav, header, footer, aside, .advertisement, .ads, .sidebar').remove();
    
    // Extract metadata
    const title = $('title').text().trim() || $('h1').first().text().trim() || 'No title found';
    const description = $('meta[name="description"]').attr('content') || 
                       $('meta[property="og:description"]').attr('content') || '';
    
    // Extract main content
    let mainContent = '';
    
    // Try to find main content areas
    const contentSelectors = [
      'main',
      'article',
      '.content',
      '.main-content',
      '.post-content',
      '.entry-content',
      '#content',
      '.container'
    ];
    
    let contentFound = false;
    for (const selector of contentSelectors) {
      const element = $(selector);
      if (element.length > 0 && element.text().trim().length > 100) {
        mainContent = element.text().trim();
        contentFound = true;
        break;
      }
    }
    
    // Fallback to body content if no main content found
    if (!contentFound) {
      mainContent = $('body').text().trim();
    }
    
    // Clean up the content
    mainContent = this.cleanTextContent(mainContent);
    
    // Extract links
    const links = [];
    $('a[href]').each((i, elem) => {
      const href = $(elem).attr('href');
      const text = $(elem).text().trim();
      if (href && text && href.startsWith('http')) {
        links.push({ url: href, text: text });
      }
    });
    
    // Extract headings for structure
    const headings = [];
    $('h1, h2, h3, h4, h5, h6').each((i, elem) => {
      const level = elem.tagName.toLowerCase();
      const text = $(elem).text().trim();
      if (text) {
        headings.push({ level, text });
      }
    });
    
    return {
      title,
      description,
      content: mainContent.substring(0, this.maxContentLength),
      links: links.slice(0, 20), // Limit to first 20 links
      headings: headings.slice(0, 10), // Limit to first 10 headings
      wordCount: mainContent.split(/\s+/).length,
      domain: this.extractDomain(url)
    };
  }

  /**
   * Clean and normalize text content
   * @private
   */
  cleanTextContent(text) {
    return text
      .replace(/\s+/g, ' ') // Replace multiple whitespace with single space
      .replace(/\n\s*\n/g, '\n') // Remove empty lines
      .trim();
  }

  /**
   * Validate URL format and accessibility
   * @private
   */
  validateUrl(url) {
    try {
      const urlObj = new URL(url);
      
      // Check protocol
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        return {
          isValid: false,
          error: 'Only HTTP and HTTPS URLs are supported'
        };
      }
      
      // Check for localhost or private IPs (basic security)
      if (urlObj.hostname === 'localhost' || 
          urlObj.hostname.startsWith('127.') ||
          urlObj.hostname.startsWith('192.168.') ||
          urlObj.hostname.startsWith('10.')) {
        return {
          isValid: false,
          error: 'Local and private network URLs are not allowed'
        };
      }
      
      return { isValid: true };
    } catch (error) {
      return {
        isValid: false,
        error: 'Invalid URL format'
      };
    }
  }

  /**
   * Fetch URL with retry logic and anti-detection measures
   * @private
   */
  async fetchWithRetry(url, maxRetries = 3) {
    const strategies = [
      // Strategy 1: Standard request with rotating user agents
      () => this.standardFetch(url),
      // Strategy 2: LinkedIn-specific headers
      () => this.linkedinFetch(url),
      // Strategy 3: Mobile user agent
      () => this.mobileFetch(url),
      // Strategy 4: Delayed request with different headers
      () => this.delayedFetch(url)
    ];

    for (let i = 0; i < strategies.length; i++) {
      try {
        console.log(`Trying fetch strategy ${i + 1} for:`, url);
        const response = await strategies[i]();
        if (response.status < 400) {
          console.log(`Strategy ${i + 1} succeeded`);
          return response;
        }
      } catch (error) {
        console.log(`Strategy ${i + 1} failed:`, error.message);
        if (i === strategies.length - 1) {
          throw error;
        }
        // Wait between retries
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
  }

  /**
   * Standard fetch with rotating user agents
   * @private
   */
  async standardFetch(url) {
    const userAgent = this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
    return await axios.get(url, {
      timeout: this.timeout,
      maxContentLength: this.maxContentLength,
      maxRedirects: 5,
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      validateStatus: (status) => status < 500
    });
  }

  /**
   * LinkedIn-specific fetch with appropriate headers
   * @private
   */
  async linkedinFetch(url) {
    return await axios.get(url, {
      timeout: this.timeout,
      maxContentLength: this.maxContentLength,
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0',
        'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"'
      },
      validateStatus: (status) => status < 500
    });
  }

  /**
   * Mobile user agent fetch
   * @private
   */
  async mobileFetch(url) {
    return await axios.get(url, {
      timeout: this.timeout,
      maxContentLength: this.maxContentLength,
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br'
      },
      validateStatus: (status) => status < 500
    });
  }

  /**
   * Delayed fetch with different approach
   * @private
   */
  async delayedFetch(url) {
    // Add a small delay to seem more human-like
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    return await axios.get(url, {
      timeout: this.timeout,
      maxContentLength: this.maxContentLength,
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': 'https://www.google.com/',
        'DNT': '1'
      },
      validateStatus: (status) => status < 500
    });
  }

  /**
   * Extract domain from URL
   * @private
   */
  extractDomain(url) {
    try {
      return new URL(url).hostname;
    } catch (error) {
      return 'unknown';
    }
  }

  /**
   * Get user-friendly error message
   * @private
   */
  getErrorMessage(error) {
    if (error.code === 'ENOTFOUND') {
      return 'Website not found or unreachable';
    } else if (error.code === 'ETIMEDOUT') {
      return 'Request timed out - website took too long to respond';
    } else if (error.response) {
      return `HTTP ${error.response.status}: ${error.response.statusText}`;
    } else {
      return error.message || 'Unknown error occurred';
    }
  }

  /**
   * Check if URL is accessible (HEAD request)
   * @param {string} url - The URL to check
   * @returns {Promise<Object>} Accessibility status
   */
  async checkUrlAccessibility(url) {
    try {
      const response = await axios.head(url, {
        timeout: 5000,
        validateStatus: (status) => status < 400
      });
      
      return {
        accessible: true,
        statusCode: response.status,
        contentType: response.headers['content-type'],
        contentLength: response.headers['content-length']
      };
    } catch (error) {
      return {
        accessible: false,
        error: this.getErrorMessage(error)
      };
    }
  }
}

module.exports = UrlContentService;
