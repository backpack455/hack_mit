const { GoogleGenAI } = require('@google/genai');

class GeminiService {
  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY;
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY is not set in environment variables');
    }
    
    this.ai = new GoogleGenAI({ apiKey: this.apiKey });
  }

  /**
   * Analyze URL directly using Gemini's URL context capabilities
   * @param {string} url - The URL to analyze
   * @param {string} query - Optional specific query about the content
   * @returns {Promise<Object>} Analysis results
   */
  async analyzeUrlDirect(url, query = null) {
    try {
      const prompt = query || `Analyze the content at the following URL and provide:
1. A summary of the main topic and purpose
2. Key insights or takeaways
3. The target audience
4. Any notable features or highlights

URL: ${url}`;

      console.log('Analyzing URL directly with Gemini:', url);
      const response = await this.ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{
          role: "user",
          parts: [{ text: prompt }]
        }],
        tools: [{ urlContext: {} }],
      });
      
      return {
        success: true,
        analysis: response.text,
        url: url,
        urlMetadata: response.candidates?.[0]?.urlContextMetadata,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Gemini direct URL analysis error:', error);
      return {
        success: false,
        error: error.message,
        url: url
      };
    }
  }

  /**
   * Analyze URL content and extract context (fallback method)
   * @param {string} url - The URL to analyze
   * @param {string} content - The scraped content from the URL
   * @param {string} query - Optional specific query about the content
   * @returns {Promise<Object>} Analysis results
   */
  async analyzeUrlContent(url, content, query = null) {
    try {
      const prompt = `
Analyze the following web page content from ${url}:

${content.substring(0, 8000)}

${query ? `Specific question: ${query}` : 'Provide a comprehensive analysis of this content.'}

Please provide:
1. A summary of the main topic and purpose
2. Key insights or takeaways
3. The target audience
4. Any notable features or highlights
`;

      console.log('Analyzing content with Gemini for:', url);
      const response = await this.ai.models.generateContent({
        model: "gemini-2.0-flash-exp",
        contents: [prompt]
      });
      
      return {
        success: true,
        analysis: response.text,
        url: url,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Gemini URL analysis error:', error);
      return {
        success: false,
        error: error.message,
        url: url
      };
    }
  }

  /**
   * Extract key information from URL content
   * @param {string} url - The URL
   * @param {string} content - The content to analyze
   * @returns {Promise<Object>} Extracted information
   */
  async extractKeyInformation(url, content) {
    try {
      const prompt = `
        Analyze the following web content and extract key information in a structured format:
        
        URL: ${url}
        Content: ${content.substring(0, 8000)} // Limit content length
        
        Please provide:
        1. Title/Main Topic
        2. Key Points (bullet format)
        3. Important URLs/Links mentioned
        4. Main categories/tags
        5. Summary (2-3 sentences)
        
        Format as JSON with keys: title, keyPoints, links, categories, summary
      `;
      
      const response = await this.ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [prompt]
      });
      const text = response.text;
      
      // Try to parse as JSON, fallback to text if parsing fails
      let parsedResult;
      try {
        parsedResult = JSON.parse(text);
      } catch (parseError) {
        parsedResult = { rawText: text };
      }
      
      return {
        success: true,
        data: parsedResult,
        url: url,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Gemini key information extraction error:', error);
      return {
        success: false,
        error: error.message,
        url: url,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Build prompt for URL content analysis
   * @private
   */
  buildUrlAnalysisPrompt(url, content, query) {
    let prompt = `
      Please analyze the following web content from: ${url}
      
      Content:
      ${content.substring(0, 10000)} // Limit to avoid token limits
      
      Provide a comprehensive analysis including:
      - Main purpose and topic of the page
      - Key information and insights
      - Important details that users should know
      - Relevance and credibility assessment
    `;
    
    if (query) {
      prompt += `\n\nSpecific question: ${query}`;
    }
    
    return prompt;
  }

  /**
   * Generate contextual questions about the URL content
   * @param {string} url - The URL
   * @param {string} content - The content
   * @returns {Promise<Object>} Generated questions
   */
  async generateContextualQuestions(url, content) {
    try {
      const prompt = `
        Based on the following web content, generate 5 relevant questions that would help users understand the context and key information:
        
        URL: ${url}
        Content: ${content.substring(0, 6000)}
        
        Format as a JSON array of strings.
      `;
      
      const response = await this.ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [prompt]
      });
      const text = response.text;
      
      let questions;
      try {
        questions = JSON.parse(text);
      } catch (parseError) {
        // Fallback to extracting questions from text
        questions = text.split('\n').filter(line => line.trim().endsWith('?'));
      }
      
      return {
        success: true,
        questions: questions,
        url: url,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Gemini question generation error:', error);
      return {
        success: false,
        error: error.message,
        url: url,
        timestamp: new Date().toISOString()
      };
    }
  }
}

module.exports = GeminiService;
