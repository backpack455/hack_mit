const { Anthropic } = require('@anthropic-ai/sdk');
const fs = require('fs').promises;
const path = require('path');

class ContextAnalysisService {
    constructor() {
        this.anthropic = null;
        this.isInitialized = false;
        this.init();
    }

    async init() {
        try {
            const apiKey = process.env.ANTHROPIC_API_KEY;
            if (!apiKey) {
                console.error('❌ ANTHROPIC_API_KEY not found in environment variables');
                return;
            }

            this.anthropic = new Anthropic({
                apiKey: apiKey
            });

            this.isInitialized = true;
            console.log('✅ Context Analysis Service initialized with Claude');
        } catch (error) {
            console.error('❌ Failed to initialize Context Analysis Service:', error);
        }
    }

    async findLatestContextFile() {
        try {
            const contextDir = path.join(__dirname, '..', 'temp', 'contexts');
            const files = await fs.readdir(contextDir);
            
            // Filter for context session files and sort by modification time
            const contextFiles = files.filter(file => file.startsWith('context_session_'));
            if (contextFiles.length === 0) {
                throw new Error('No context files found in temp/contexts/');
            }
            
            // Get file stats and find the most recent
            const fileStats = await Promise.all(
                contextFiles.map(async file => {
                    const filePath = path.join(contextDir, file);
                    const stats = await fs.stat(filePath);
                    return { file, path: filePath, mtime: stats.mtime };
                })
            );
            
            // Sort by modification time (newest first)
            fileStats.sort((a, b) => b.mtime - a.mtime);
            return fileStats[0].path;
        } catch (error) {
            console.error('❌ Error finding latest context file:', error);
            throw error;
        }
    }

    async analyzeContextForTasks(contextFilePath = null) {
        if (!this.isInitialized) {
            throw new Error('Context Analysis Service not initialized');
        }

        try {
            // If no specific file provided, find the latest context file
            const targetFile = contextFilePath || await this.findLatestContextFile();
            
            // Read the context file
            const contextContent = await fs.readFile(targetFile, 'utf8');
            console.log(`📖 Analyzing context from: ${path.basename(targetFile)}`);
            
            // Prepare the prompt for Claude
            const prompt = `Based on this context from a user's screenshot session, provide the best 3 automation tasks that would help the user. Focus on actionable, specific tasks that can be automated using AI agents.

Context:
${contextContent}

Please respond with exactly 3 task recommendations in the following JSON format:
{
    "tasks": [
        {
            "title": "Brief task title",
            "description": "Detailed description of what this task would accomplish",
            "category": "research|productivity|development|communication|analysis",
            "priority": "high|medium|low",
            "keywords": ["keyword1", "keyword2", "keyword3"],
            "estimated_time": "1-5 minutes"
        }
    ]
}

Focus on tasks that would be most valuable given the user's current context and activities shown in the screenshots.`;

            const response = await this.anthropic.messages.create({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 1000,
                messages: [{
                    role: 'user',
                    content: prompt
                }]
            });

            const responseText = response.content[0].text;
            
            // Extract JSON from markdown code blocks if present
            let jsonText = responseText;
            if (responseText.includes('```json')) {
                const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
                if (jsonMatch) {
                    jsonText = jsonMatch[1];
                }
            } else if (responseText.includes('```')) {
                // Handle generic code blocks
                const codeMatch = responseText.match(/```\s*([\s\S]*?)\s*```/);
                if (codeMatch) {
                    jsonText = codeMatch[1];
                }
            }
            
            // Parse the JSON response
            const taskRecommendations = JSON.parse(jsonText.trim());
            
            console.log('✅ Generated task recommendations:', taskRecommendations.tasks.length);
            
            // Print detailed task information
            console.log('\nGenerated Tasks:');
            taskRecommendations.tasks.forEach((task, index) => {
                console.log(`\nTask ${index + 1}: ${task.title}`);
                console.log(`Description: ${task.description}`);
                console.log(`Category: ${task.category}`);
                console.log(`Priority: ${task.priority}`);
                console.log(`Keywords: ${task.keywords.join(', ')}`);
                console.log('---');
            });
            
            return taskRecommendations.tasks;

        } catch (error) {
            console.error('❌ Error analyzing context for tasks:', error);
            throw error;
        }
    }

    async getLatestContextFile() {
        try {
            const contextsDir = path.join(__dirname, '..', 'temp', 'contexts');
            const files = await fs.readdir(contextsDir);
            
            // Filter for context files and sort by modification time
            const contextFiles = files.filter(file => file.startsWith('context_session_'));
            
            if (contextFiles.length === 0) {
                throw new Error('No context files found');
            }

            // Get file stats and sort by modification time (newest first)
            const fileStats = await Promise.all(
                contextFiles.map(async (file) => {
                    const filePath = path.join(contextsDir, file);
                    const stats = await fs.stat(filePath);
                    return { file, path: filePath, mtime: stats.mtime };
                })
            );

            fileStats.sort((a, b) => b.mtime - a.mtime);
            
            return fileStats[0].path;
        } catch (error) {
            console.error('❌ Error getting latest context file:', error);
            throw error;
        }
    }

    async generateTaskRecommendations() {
        try {
            const contextFile = await this.findLatestContextFile();
            const tasks = await this.analyzeContextForTasks(contextFile);
            
            // Read context content for similarity analysis
            const contextContent = await fs.readFile(contextFile, 'utf8');
            
            return {
                tasks,
                contextFile,
                contextContent,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('❌ Error generating task recommendations:', error);
            throw error;
        }
    }
}

module.exports = ContextAnalysisService;
