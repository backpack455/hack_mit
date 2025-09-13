const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Alternative profile data sources when direct LinkedIn access is blocked
 */
class AlternativeProfileService {
  constructor() {
    this.userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];
  }

  /**
   * Try multiple alternative sources for profile information
   * @param {string} linkedinUrl - Original LinkedIn URL
   * @returns {Promise<Object>} Profile data from alternative sources
   */
  async getProfileFromAlternatives(linkedinUrl) {
    const profileUsername = this.extractUsername(linkedinUrl);
    const results = {
      sources: [],
      aggregatedData: {
        name: null,
        title: null,
        company: null,
        location: null,
        summary: null,
        skills: [],
        experience: [],
        education: []
      }
    };

    // Try multiple sources in parallel
    const sources = [
      this.tryGoogleSearch(profileUsername),
      this.tryBingSearch(profileUsername),
      this.tryDuckDuckGo(profileUsername),
      this.tryArchiveToday(linkedinUrl),
      this.tryWaybackMachine(linkedinUrl),
      this.trySocialSearchEngines(profileUsername)
    ];

    const sourceResults = await Promise.allSettled(sources);
    
    sourceResults.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value.success) {
        results.sources.push(result.value);
        this.mergeProfileData(results.aggregatedData, result.value.data);
      }
    });

    return results;
  }

  /**
   * Extract username from LinkedIn URL
   * @private
   */
  extractUsername(linkedinUrl) {
    const match = linkedinUrl.match(/linkedin\.com\/in\/([^\/\?]+)/);
    return match ? match[1] : null;
  }

  /**
   * Search Google for cached or alternative profile information
   * @private
   */
  async tryGoogleSearch(username) {
    try {
      const searchQuery = `"${username}" site:linkedin.com OR site:about.me OR site:github.com OR site:twitter.com`;
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;
      
      const response = await axios.get(searchUrl, {
        headers: {
          'User-Agent': this.userAgents[Math.floor(Math.random() * this.userAgents.length)],
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'DNT': '1',
          'Connection': 'keep-alive'
        },
        timeout: 10000
      });

      const $ = cheerio.load(response.data);
      const results = [];

      // Extract search results
      $('div.g').each((i, elem) => {
        const title = $(elem).find('h3').text();
        const link = $(elem).find('a').attr('href');
        const snippet = $(elem).find('.VwiC3b').text();
        
        if (title && link && snippet) {
          results.push({ title, link, snippet });
        }
      });

      return {
        success: true,
        source: 'google_search',
        data: { searchResults: results },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return { success: false, source: 'google_search', error: error.message };
    }
  }

  /**
   * Search Bing for profile information
   * @private
   */
  async tryBingSearch(username) {
    try {
      const searchQuery = `"${username}" (site:linkedin.com OR site:about.me OR site:github.com)`;
      const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(searchQuery)}`;
      
      const response = await axios.get(searchUrl, {
        headers: {
          'User-Agent': this.userAgents[Math.floor(Math.random() * this.userAgents.length)],
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        timeout: 10000
      });

      const $ = cheerio.load(response.data);
      const results = [];

      // Extract Bing search results
      $('.b_algo').each((i, elem) => {
        const title = $(elem).find('h2 a').text();
        const link = $(elem).find('h2 a').attr('href');
        const snippet = $(elem).find('.b_caption p').text();
        
        if (title && link && snippet) {
          results.push({ title, link, snippet });
        }
      });

      return {
        success: true,
        source: 'bing_search',
        data: { searchResults: results },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return { success: false, source: 'bing_search', error: error.message };
    }
  }

  /**
   * Try DuckDuckGo search
   * @private
   */
  async tryDuckDuckGo(username) {
    try {
      const searchQuery = `"${username}" linkedin profile`;
      const searchUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(searchQuery)}`;
      
      const response = await axios.get(searchUrl, {
        headers: {
          'User-Agent': this.userAgents[Math.floor(Math.random() * this.userAgents.length)]
        },
        timeout: 10000
      });

      const $ = cheerio.load(response.data);
      const results = [];

      // Extract DuckDuckGo results
      $('.result').each((i, elem) => {
        const title = $(elem).find('.result__title a').text();
        const link = $(elem).find('.result__title a').attr('href');
        const snippet = $(elem).find('.result__snippet').text();
        
        if (title && link && snippet) {
          results.push({ title, link, snippet });
        }
      });

      return {
        success: true,
        source: 'duckduckgo_search',
        data: { searchResults: results },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return { success: false, source: 'duckduckgo_search', error: error.message };
    }
  }

  /**
   * Try Archive.today for cached content
   * @private
   */
  async tryArchiveToday(linkedinUrl) {
    try {
      const archiveUrl = `https://archive.today/newest/${linkedinUrl}`;
      
      const response = await axios.get(archiveUrl, {
        headers: {
          'User-Agent': this.userAgents[Math.floor(Math.random() * this.userAgents.length)]
        },
        timeout: 15000,
        maxRedirects: 5
      });

      if (response.data && !response.data.includes('No archives found')) {
        const $ = cheerio.load(response.data);
        
        // Extract profile information from archived page
        const profileData = this.extractLinkedInProfileData($);
        
        return {
          success: true,
          source: 'archive_today',
          data: profileData,
          timestamp: new Date().toISOString()
        };
      }
      
      return { success: false, source: 'archive_today', error: 'No archives found' };
    } catch (error) {
      return { success: false, source: 'archive_today', error: error.message };
    }
  }

  /**
   * Try Wayback Machine for historical content
   * @private
   */
  async tryWaybackMachine(linkedinUrl) {
    try {
      // First check if URL is archived
      const availabilityUrl = `https://archive.org/wayback/available?url=${encodeURIComponent(linkedinUrl)}`;
      const availabilityResponse = await axios.get(availabilityUrl, { timeout: 10000 });
      
      if (availabilityResponse.data.archived_snapshots?.closest?.available) {
        const archiveUrl = availabilityResponse.data.archived_snapshots.closest.url;
        
        const response = await axios.get(archiveUrl, {
          headers: {
            'User-Agent': this.userAgents[Math.floor(Math.random() * this.userAgents.length)]
          },
          timeout: 15000
        });

        const $ = cheerio.load(response.data);
        const profileData = this.extractLinkedInProfileData($);
        
        return {
          success: true,
          source: 'wayback_machine',
          data: profileData,
          archiveDate: availabilityResponse.data.archived_snapshots.closest.timestamp,
          timestamp: new Date().toISOString()
        };
      }
      
      return { success: false, source: 'wayback_machine', error: 'No archived versions found' };
    } catch (error) {
      return { success: false, source: 'wayback_machine', error: error.message };
    }
  }

  /**
   * Try social search engines and aggregators
   * @private
   */
  async trySocialSearchEngines(username) {
    try {
      // Try Pipl or similar people search engines
      const searchResults = [];
      
      // This is a placeholder for social search engines
      // In practice, you'd integrate with APIs like Pipl, Spokeo, etc.
      
      return {
        success: false,
        source: 'social_search',
        error: 'Social search engines require API keys'
      };
    } catch (error) {
      return { success: false, source: 'social_search', error: error.message };
    }
  }

  /**
   * Extract LinkedIn profile data from HTML
   * @private
   */
  extractLinkedInProfileData($) {
    const data = {
      name: null,
      title: null,
      company: null,
      location: null,
      summary: null,
      skills: [],
      experience: [],
      education: []
    };

    // Try different selectors for LinkedIn profile data
    data.name = $('h1.text-heading-xlarge').text().trim() || 
                $('h1[data-test-id="profile-name"]').text().trim() ||
                $('.pv-text-details__left-panel h1').text().trim();

    data.title = $('.text-body-medium.break-words').first().text().trim() ||
                 $('.pv-text-details__left-panel .text-body-medium').text().trim();

    data.location = $('[data-test-id="profile-location"]').text().trim() ||
                    $('.pv-text-details__left-panel .text-body-small').text().trim();

    // Extract experience
    $('.pv-entity__summary-info').each((i, elem) => {
      const title = $(elem).find('h3').text().trim();
      const company = $(elem).find('.pv-entity__secondary-title').text().trim();
      const duration = $(elem).find('.pv-entity__bullet-item').text().trim();
      
      if (title && company) {
        data.experience.push({ title, company, duration });
      }
    });

    return data;
  }

  /**
   * Merge profile data from multiple sources
   * @private
   */
  mergeProfileData(aggregated, newData) {
    // Simple merge logic - prefer non-null values
    Object.keys(newData).forEach(key => {
      if (newData[key] && !aggregated[key]) {
        aggregated[key] = newData[key];
      } else if (Array.isArray(newData[key]) && Array.isArray(aggregated[key])) {
        // Merge arrays, avoiding duplicates
        aggregated[key] = [...new Set([...aggregated[key], ...newData[key]])];
      }
    });
  }
}

module.exports = AlternativeProfileService;
