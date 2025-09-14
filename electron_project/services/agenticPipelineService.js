const ContextAnalysisService = require('./contextAnalysisService');
const AgentMatchingService = require('./agentMatchingService');
const DedalusService = require('./dedalusService');
const fs = require('fs').promises;

class AgenticPipelineService {
    constructor() {
        this.contextAnalyzer = new ContextAnalysisService();
        this.agentMatcher = new AgentMatchingService();
        this.dedalusService = new DedalusService();
        this.currentRecommendations = null;
        this.executionResults = new Map();
        
        console.log('✅ Agentic Pipeline Service initialized');
    }

    async generateSmartRecommendations() {
        try {
            console.log('🧠 Generating smart agentic recommendations...');
            
            // Step 1: Analyze context to get task recommendations
            const taskAnalysis = await this.contextAnalyzer.generateTaskRecommendations();
            console.log('📋 Generated', taskAnalysis.tasks.length, 'task recommendations');
            
            // Debug task analysis
            console.log('\nTask Analysis Details:');
            console.log('Context File:', taskAnalysis.contextFile);
            console.log('Tasks:', JSON.stringify(taskAnalysis.tasks, null, 2));
            
            // Log task analysis for debugging
            console.log('Task Analysis:', {
                contextFile: taskAnalysis.contextFile,
                taskCount: taskAnalysis.tasks.length,
                contentLength: taskAnalysis.contextContent?.length || 0
            });
            
            // Step 2: Match tasks to best MCP agents with context similarity
            const contextContent = taskAnalysis.contextContent || '';
            const agentRecommendations = await this.agentMatcher.generateRecommendations(taskAnalysis.tasks, contextContent);
            console.log('🤖 Matched tasks to MCP agents');
            
            // Log agent recommendations for debugging
            console.log('Agent Recommendations:', {
                actionCount: agentRecommendations.actions.length,
                agents: agentRecommendations.actions.map(a => ({
                    id: a.id,
                    title: a.title,
                    description: a.description,
                    agent: a.mcpAgent,
                    score: a.similarityScore
                }))
            });

            // Print more detailed options for debugging
            console.log('\nRecommended Actions:');
            agentRecommendations.actions.forEach(action => {
                console.log(`\n${action.title}`);
                console.log(`Description: ${action.description}`);
                console.log(`Agent: ${action.mcpAgent}`);
                console.log(`Confidence: ${action.confidence}`);
                console.log('---');
            });
            
            // Step 3: Create overlay actions with similarity data
            const overlayActions = agentRecommendations.actions.map(action => ({
                id: action.id,
                title: action.title,
                description: action.description,
                icon: action.icon,
                confidence: action.confidence,
                mcpAgent: action.mcpAgent,
                similarityScore: action.similarityScore,
                agentSimilarities: action.agentSimilarities,
                taskData: action.taskData
            }));
            
            this.currentRecommendations = {
                contextFile: taskAnalysis.contextFile,
                taskAnalysis,
                agentRecommendations,
                overlayActions,
                timestamp: new Date().toISOString()
            };
            
            console.log('✅ Generated', overlayActions.length, 'smart recommendations for overlay');
            return overlayActions;
            
        } catch (error) {
            console.error('❌ Error generating smart recommendations:', error);
            
            // Fallback to default actions if analysis fails
            return this.getFallbackActions();
        }
    }

    getFallbackActions() {
        const fallbackActions = [
            {
                id: 'fallback_search',
                title: 'Search for Information',
                description: 'Search the web for relevant information based on your current context',
                icon: 'analyze',
                confidence: 0.7,
                mcpAgent: 'exa-mcp',
                taskData: {
                    title: 'Search for Information',
                    description: 'Perform a web search based on current context',
                    category: 'research',
                    priority: 'medium',
                    keywords: ['search', 'information', 'research']
                }
            },
            {
                id: 'fallback_analyze',
                title: 'Analyze Current Context',
                description: 'Use AI to analyze and provide insights on your current work',
                icon: 'analyze',
                confidence: 0.6,
                mcpAgent: 'sequential-thinking',
                taskData: {
                    title: 'Analyze Current Context',
                    description: 'Analyze current work context and provide insights',
                    category: 'analysis',
                    priority: 'medium',
                    keywords: ['analyze', 'context', 'insights']
                }
            },
            {
                id: 'fallback_documentation',
                title: 'Find Documentation',
                description: 'Search for relevant documentation and code examples',
                icon: 'document',
                confidence: 0.5,
                mcpAgent: 'context7',
                taskData: {
                    title: 'Find Documentation',
                    description: 'Find relevant documentation for current work',
                    category: 'development',
                    priority: 'low',
                    keywords: ['documentation', 'code', 'examples']
                }
            }
        ];

        // Store fallback actions as current recommendations
        this.currentRecommendations = {
            contextFile: null,
            overlayActions: fallbackActions,
            timestamp: new Date().toISOString(),
            isFallback: true
        };

        return fallbackActions;
    }

    async executeAgenticAction(actionId) {
        try {
            console.log(`🔍 DEBUG: Executing action ${actionId}`);
            console.log(`🔍 DEBUG: Current state:`, {
                hasRecommendations: !!this.currentRecommendations,
                actionCount: this.currentRecommendations?.overlayActions?.length || 0
            });
            
            // If no recommendations, try to generate them first
            if (!this.currentRecommendations || !this.currentRecommendations.overlayActions) {
                console.log('🔄 No current recommendations, generating new ones...');
                const actions = await this.generateSmartRecommendations();
                console.log('Generated actions:', actions);
                
                this.currentRecommendations = {
                    overlayActions: actions,
                    timestamp: new Date().toISOString()
                };
            }
            
            // Validate after potential generation
            if (!this.currentRecommendations || !this.currentRecommendations.overlayActions) {
                throw new Error('Failed to generate recommendations');
            }
            
            // Log available actions
            console.log('Available actions:', this.currentRecommendations.overlayActions.map(a => ({
                id: a.id,
                title: a.title
            })));

            console.log(`🔍 DEBUG: overlayActions count:`, this.currentRecommendations.overlayActions?.length || 0);
            console.log(`🔍 DEBUG: Available action IDs:`, this.currentRecommendations.overlayActions?.map(a => a.id) || []);

            // Find the action in current recommendations
            const action = this.currentRecommendations.overlayActions.find(a => a.id === actionId);
            console.log('🔍 Looking for action:', actionId);
            console.log('🔍 Available actions:', this.currentRecommendations.overlayActions);
            
            if (!action) {
                console.error('❌ Action not found. Available actions:', 
                    this.currentRecommendations.overlayActions.map(a => ({
                        id: a.id,
                        title: a.title
                    }))
                );
                throw new Error(`Action ${actionId} not found in current recommendations`);
            }
            
            console.log('✅ Found matching action:', action);

            console.log(`🚀 Executing agentic action: ${action.title}`);
            
            // Get context content (handle fallback case)
            let contextContent = '';
            if (this.currentRecommendations.contextFile) {
                contextContent = await fs.readFile(this.currentRecommendations.contextFile, 'utf8');
            } else {
                contextContent = 'No specific context file available - using current session context';
            }
            
            // Execute the task using Dedalus with similarity data
            const similarityData = {
                similarityScore: action.similarityScore,
                contextRelevance: action.contextRelevance,
                agentSimilarities: action.agentSimilarities
            };
            
            const result = await this.dedalusService.executeAgenticTask(
                action.taskData,
                action.mcpAgent,
                contextContent,
                similarityData
            );
            
            // Format the result for display
            const formattedResult = this.dedalusService.formatResult(result);
            
            // Store the result
            this.executionResults.set(actionId, {
                action,
                result: formattedResult,
                timestamp: new Date().toISOString()
            });
            
            console.log(`✅ Agentic action completed: ${action.title}`);
            return formattedResult;
            
        } catch (error) {
            console.error('❌ Error executing agentic action:', error);
            
            const errorResult = {
                type: 'error',
                content: `❌ Failed to execute action: ${error.message}`,
                timestamp: new Date().toISOString()
            };
            
            this.executionResults.set(actionId, {
                action: null,
                result: errorResult,
                timestamp: new Date().toISOString()
            });
            
            return errorResult;
        }
    }

    async streamAgenticExecution(actionId, onProgress) {
        try {
            if (!this.currentRecommendations) {
                throw new Error('No current recommendations available');
            }

            const action = this.currentRecommendations.overlayActions.find(a => a.id === actionId);
            if (!action) {
                throw new Error(`Action ${actionId} not found`);
            }

            const contextContent = await fs.readFile(this.currentRecommendations.contextFile, 'utf8');
            
            // Use streaming execution
            const result = await this.dedalusService.streamTaskExecution(
                action.taskData,
                action.mcpAgent,
                contextContent,
                onProgress
            );
            
            const formattedResult = this.dedalusService.formatResult(result);
            
            this.executionResults.set(actionId, {
                action,
                result: formattedResult,
                timestamp: new Date().toISOString()
            });
            
            return formattedResult;
            
        } catch (error) {
            console.error('❌ Error in streaming execution:', error);
            throw error;
        }
    }

    getExecutionResult(actionId) {
        return this.executionResults.get(actionId);
    }

    getAllExecutionResults() {
        return Array.from(this.executionResults.entries()).map(([id, data]) => ({
            actionId: id,
            ...data
        }));
    }

    clearExecutionResults() {
        this.executionResults.clear();
        console.log('🧹 Cleared execution results');
    }

    getCurrentRecommendations() {
        return this.currentRecommendations;
    }

    async refreshRecommendations() {
        console.log('🔄 Refreshing agentic recommendations...');
        return await this.generateSmartRecommendations();
    }

    // Method to get task progress for overlay display
    getTaskProgress(actionId) {
        const result = this.executionResults.get(actionId);
        if (!result) {
            return { status: 'not_started', progress: 0 };
        }

        if (result.result.type === 'error') {
            return { status: 'failed', progress: 0, error: result.result.content };
        }

        return { status: 'completed', progress: 100, result: result.result };
    }

    // Method to format results for different content types
    formatResultForDisplay(result) {
        if (!result || result.type === 'error') {
            return {
                html: result?.content || 'No result available',
                hasLinks: false,
                hasImages: false
            };
        }

        const content = result.content;
        
        // Check for links
        const hasLinks = /<a\s+href=/i.test(content);
        
        // Check for images (markdown or HTML)
        const hasImages = /!\[.*?\]\(.*?\)|<img\s+src=/i.test(content);
        
        // Ensure proper HTML structure
        let html = content;
        if (!html.includes('<') || !html.includes('>')) {
            // Plain text, convert to HTML
            html = html.replace(/\n/g, '<br>');
        }

        return {
            html,
            hasLinks,
            hasImages,
            raw: result.raw || content
        };
    }
}

module.exports = AgenticPipelineService;
