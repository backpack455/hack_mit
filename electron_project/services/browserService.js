const puppeteer = require('puppeteer');

class BrowserService {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  /**
   * Initialize browser instance
   * @private
   */
  async initBrowser() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      });
    }
    return this.browser;
  }

  /**
   * Fetch URL content using browser automation to bypass anti-scraping
   * @param {string} url - The URL to fetch
   * @param {boolean} bypassLogin - Whether to attempt login bypass for LinkedIn
   * @returns {Promise<Object>} Page content and metadata
   */
  async fetchUrlWithBrowser(url, bypassLogin = false) {
    let page = null;
    try {
      console.log('Fetching with browser automation:', url);
      
      const browser = await this.initBrowser();
      page = await browser.newPage();

      // Set realistic viewport and user agent
      await page.setViewport({ width: 1366, height: 768 });
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

      // Set additional headers to appear more human-like
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1'
      });

      // LinkedIn-specific bypass strategies
      if (url.includes('linkedin.com') && bypassLogin) {
        try {
          return await this.linkedinBypass(page, url);
        } catch (bypassError) {
          console.log('LinkedIn bypass failed, trying standard method:', bypassError.message);
          // Continue with standard method as fallback
        }
      }

      // Navigate to the page with timeout
      await page.goto(url, { 
        waitUntil: 'networkidle2', 
        timeout: 30000 
      });

      // Wait a bit for dynamic content to load
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Extract content
      const content = await page.evaluate(() => {
        // Remove script and style elements
        const scripts = document.querySelectorAll('script, style, nav, header, footer, aside');
        scripts.forEach(el => el.remove());

        // Get title
        const title = document.title || document.querySelector('h1')?.textContent || 'No title';

        // Get meta description
        const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute('content') || 
                        document.querySelector('meta[property="og:description"]')?.getAttribute('content') || '';

        // Get main content
        let mainContent = '';
        const contentSelectors = [
          'main', 'article', '.content', '.main-content', '.post-content', 
          '.entry-content', '#content', '.container', 'body'
        ];

        for (const selector of contentSelectors) {
          const element = document.querySelector(selector);
          if (element && element.textContent.trim().length > 100) {
            mainContent = element.textContent.trim();
            break;
          }
        }

        // Clean up content
        mainContent = mainContent.replace(/\s+/g, ' ').trim();

        // Get links
        const links = Array.from(document.querySelectorAll('a[href]'))
          .map(a => ({
            url: a.href,
            text: a.textContent.trim()
          }))
          .filter(link => link.url.startsWith('http') && link.text)
          .slice(0, 20);

        // Get headings
        const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'))
          .map(h => ({
            level: h.tagName.toLowerCase(),
            text: h.textContent.trim()
          }))
          .filter(h => h.text)
          .slice(0, 10);

        return {
          title,
          description: metaDesc,
          content: mainContent.substring(0, 50000), // Limit content size
          links,
          headings,
          wordCount: mainContent.split(/\s+/).length,
          url: window.location.href
        };
      });

      return {
        success: true,
        method: 'browser',
        ...content,
        domain: new URL(url).hostname,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('Browser fetch error:', error.message);
      return {
        success: false,
        error: `Browser automation failed: ${error.message}`,
        url: url,
        method: 'browser'
      };
    } finally {
      if (page) {
        await page.close();
      }
    }
  }

  /**
   * LinkedIn-specific bypass strategies
   * @private
   */
  async linkedinBypass(page, url) {
    try {
      console.log('Attempting LinkedIn bypass strategies...');
      
      // Strategy 1: Try with stealth mode and realistic browsing
      await this.enableStealthMode(page);
      
      // Simulate realistic browsing behavior
      await page.goto('https://www.google.com', { waitUntil: 'networkidle2' });
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Search for the profile on Google first
      await page.type('input[name="q"]', `site:linkedin.com/in/ "${url.split('/').pop()}"`);  
      await page.keyboard.press('Enter');
      await page.waitForNavigation({ waitUntil: 'networkidle2' });
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Try to click on the LinkedIn result
      try {
        const linkedinLink = await page.$('a[href*="linkedin.com/in/"]');
        if (linkedinLink) {
          console.log('Found LinkedIn link in search results, clicking...');
          await linkedinLink.click();
          await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          const pageTitle = await page.title();
          if (!pageTitle.includes('Sign Up') && !pageTitle.includes('Join LinkedIn')) {
            console.log('Google search redirect successful!');
            return await this.extractContent(page, url);
          }
        }
      } catch (searchError) {
        console.log('Google search approach failed, trying direct methods...');
      }
      
      // Strategy 2: Try direct access with mobile user agent and realistic headers
      console.log('Trying mobile user agent approach...');
      await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1');
      await page.setExtraHTTPHeaders({
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      });
      
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const mobileContent = await page.content();
      if (!mobileContent.includes('Join LinkedIn') && !mobileContent.includes('Sign Up')) {
        console.log('Mobile access successful!');
        return await this.extractContent(page, url);
      }
      
      // Strategy 3: Try archive.org wayback machine
      console.log('Trying Wayback Machine...');
      const archiveUrl = `https://web.archive.org/web/newest/${url}`;
      await page.goto(archiveUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const archiveContent = await page.content();
      if (!archiveContent.includes('Wayback Machine has not archived that URL')) {
        console.log('Archive.org access successful!');
        return await this.extractContent(page, url);
      }
      
      // Strategy 4: Try with different referrer and session simulation
      console.log('Trying with LinkedIn referrer simulation...');
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setExtraHTTPHeaders({
        'Referer': 'https://www.linkedin.com/feed/',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      });
      
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      return await this.extractContent(page, url);
      
    } catch (error) {
      console.error('LinkedIn bypass failed:', error.message);
      throw error;
    }
  }
  
  /**
   * Enable stealth mode to avoid detection
   * @private
   */
  async enableStealthMode(page) {
    // Remove webdriver property
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
    });
    
    // Mock plugins and languages
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
    });
    
    // Set realistic viewport
    await page.setViewport({ 
      width: 1366 + Math.floor(Math.random() * 100), 
      height: 768 + Math.floor(Math.random() * 100) 
    });
  }
  
  /**
   * Extract content from page
   * @private
   */
  async extractContent(page, url) {
    const content = await page.evaluate(() => {
      // Remove script and style elements
      const scripts = document.querySelectorAll('script, style, nav, header, footer, aside');
      scripts.forEach(el => el.remove());

      // Get title
      const title = document.title || document.querySelector('h1')?.textContent || 'No title';

      // Get meta description
      const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute('content') || 
                      document.querySelector('meta[property="og:description"]')?.getAttribute('content') || '';

      // Get main content
      let mainContent = '';
      const contentSelectors = [
        'main', 'article', '.content', '.main-content', '.post-content', 
        '.entry-content', '#content', '.container', 'body'
      ];

      for (const selector of contentSelectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent.trim().length > 100) {
          mainContent = element.textContent.trim();
          break;
        }
      }

      // Clean up content
      mainContent = mainContent.replace(/\s+/g, ' ').trim();

      // Get links
      const links = Array.from(document.querySelectorAll('a[href]'))
        .map(a => ({
          url: a.href,
          text: a.textContent.trim()
        }))
        .filter(link => link.url.startsWith('http') && link.text)
        .slice(0, 20);

      // Get headings
      const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'))
        .map(h => ({
          level: h.tagName.toLowerCase(),
          text: h.textContent.trim()
        }))
        .filter(h => h.text)
        .slice(0, 10);

      return {
        title,
        description: metaDesc,
        content: mainContent.substring(0, 50000), // Limit content size
        links,
        headings,
        wordCount: mainContent.split(/\s+/).length,
        url: window.location.href
      };
    });

    return {
      success: true,
      method: 'browser',
      ...content,
      domain: new URL(url).hostname,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Close browser instance
   */
  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

module.exports = BrowserService;
