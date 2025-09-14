const fs = require('fs').promises;
const path = require('path');

class AgentMatchingService {
    constructor() {
        this.mcpAgents = [];
        this.init();
    }

    async init() {
        try {
            await this.loadMCPAgents();
            console.log('✅ Agent Matching Service initialized with', this.mcpAgents.length, 'agents');
        } catch (error) {
            console.error('❌ Failed to initialize Agent Matching Service:', error);
        }
    }

    async loadMCPAgents() {
        try {
            const agentsPath = path.join(__dirname, '..', 'mcp_agents.json');
            const agentsData = await fs.readFile(agentsPath, 'utf8');
            const parsed = JSON.parse(agentsData);
            this.mcpAgents = parsed.agents || [];
        } catch (error) {
            console.error('❌ Error loading MCP agents:', error);
            throw error;
        }
    }

    calculateContextAgentSimilarity(contextContent, task) {
        const similarities = [];
        
        // Combine context and task for comprehensive similarity analysis
        const combinedText = `${contextContent} ${task.title} ${task.description} ${task.keywords.join(' ')}`.toLowerCase();
        
        this.mcpAgents.forEach(agent => {
            const agentText = `${agent.tag} ${agent.description}`.toLowerCase();
            
            // Calculate semantic similarity score
            const similarityScore = this.calculateSemanticSimilarity(combinedText, agentText);
            
            similarities.push({
                agent: agent,
                similarityScore: similarityScore,
                contextRelevance: this.calculateContextRelevance(contextContent, agent)
            });
        });
        
        // Sort by similarity score descending
        return similarities.sort((a, b) => b.similarityScore - a.similarityScore);
    }

    calculateSemanticSimilarity(text1, text2) {
        // Extract keywords from both texts
        const words1 = this.extractKeywords(text1);
        const words2 = this.extractKeywords(text2);
        
        // Calculate Jaccard similarity
        const intersection = words1.filter(word => words2.includes(word));
        const union = [...new Set([...words1, ...words2])];
        
        const jaccardSimilarity = intersection.length / union.length;
        
        // Calculate weighted keyword matches
        let weightedScore = 0;
        const importantKeywords = ['search', 'analysis', 'documentation', 'web', 'ai', 'data', 'project', 'email', 'social'];
        
        intersection.forEach(word => {
            if (importantKeywords.includes(word)) {
                weightedScore += 2;
            } else {
                weightedScore += 1;
            }
        });
        
        // Combine scores (0-1 scale)
        return Math.min((jaccardSimilarity * 0.6 + (weightedScore / Math.max(words1.length, words2.length)) * 0.4), 1);
    }

    calculateContextRelevance(contextContent, agent) {
        if (!contextContent) return 0.5; // Default relevance
        
        const contextWords = this.extractKeywords(contextContent.toLowerCase());
        const agentWords = this.extractKeywords(`${agent.tag} ${agent.description}`.toLowerCase());
        
        // Calculate context-specific relevance
        let relevanceScore = 0;
        
        // Check for technology/domain matches
        const techKeywords = ['javascript', 'python', 'web', 'api', 'database', 'ai', 'ml', 'search', 'email', 'project'];
        techKeywords.forEach(tech => {
            if (contextWords.includes(tech) && agentWords.some(word => word.includes(tech))) {
                relevanceScore += 0.1;
            }
        });
        
        return Math.min(relevanceScore, 1);
    }

    extractKeywords(text) {
        // Remove common stop words and extract meaningful keywords
        const stopWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should'];
        
        return text.toLowerCase()
            .replace(/[^a-zA-Z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length > 2 && !stopWords.includes(word))
            .slice(0, 20); // Limit to top 20 keywords
    }

    calculateMatchScore(task, agent, similarityData = null) {
        let score = 0;
        const taskText = `${task.title} ${task.description} ${task.keywords.join(' ')}`.toLowerCase();
        const agentText = `${agent.tag} ${agent.description}`.toLowerCase();

        // Use similarity score if available
        if (similarityData) {
            score += similarityData.similarityScore * 10; // Scale to 0-10
            score += similarityData.contextRelevance * 5; // Add context relevance
        }

        // Keyword matching
        const taskKeywords = task.keywords.map(k => k.toLowerCase());
        taskKeywords.forEach(keyword => {
            if (agentText.includes(keyword)) {
                score += 3;
            }
        });

        // Category-specific matching
        const categoryMappings = {
            'research': ['search', 'exa', 'brave', 'web', 'academic', 'documentation', 'context'],
            'productivity': ['linear', 'airtable', 'notion', 'email', 'agentmail', 'project'],
            'development': ['github', 'documentation', 'aws', 'context', 'sequential-thinking'],
            'communication': ['email', 'agentmail', 'linkedin', 'tweet', 'social'],
            'analysis': ['sequential-thinking', 'hf-mcp', 'general-mcp', 'context']
        };

        const categoryKeywords = categoryMappings[task.category] || [];
        categoryKeywords.forEach(keyword => {
            if (agentText.includes(keyword)) {
                score += 2;
            }
        });

        // Specific agent scoring based on common use cases
        const agentScoring = {
            'exa-mcp': this.scoreForSearch(task),
            'brave-search-mcp': this.scoreForSearch(task),
            'sonar': this.scoreForSearch(task),
            'sequential-thinking': this.scoreForAnalysis(task),
            'context7': this.scoreForDocumentation(task),
            'general-mcp': this.scoreForGeneral(task),
            'linkedin-scraper-mcp': this.scoreForProfessional(task),
            'tweet-mcp': this.scoreForSocial(task),
            'notion-mcp': this.scoreForProductivity(task),
            'linear-mcp': this.scoreForProductivity(task),
            'agentmail-mcp': this.scoreForCommunication(task),
            'hf-mcp': this.scoreForAI(task),
            'aws-documentation-mcp-server': this.scoreForTechnical(task)
        };

        if (agentScoring[agent.tag]) {
            score += agentScoring[agent.tag];
        }

        // Text similarity (simple word overlap)
        const taskWords = taskText.split(/\s+/);
        const agentWords = agentText.split(/\s+/);
        const commonWords = taskWords.filter(word => 
            word.length > 3 && agentWords.includes(word)
        );
        score += commonWords.length;

        return score;
    }

    scoreForSearch(task) {
        const searchIndicators = ['search', 'find', 'research', 'lookup', 'discover', 'information'];
        const taskText = `${task.title} ${task.description}`.toLowerCase();
        return searchIndicators.some(indicator => taskText.includes(indicator)) ? 5 : 0;
    }

    scoreForAnalysis(task) {
        const analysisIndicators = ['analyze', 'think', 'reason', 'solve', 'problem', 'logic'];
        const taskText = `${task.title} ${task.description}`.toLowerCase();
        return analysisIndicators.some(indicator => taskText.includes(indicator)) ? 5 : 0;
    }

    scoreForDocumentation(task) {
        const docIndicators = ['documentation', 'docs', 'guide', 'reference', 'api', 'code'];
        const taskText = `${task.title} ${task.description}`.toLowerCase();
        return docIndicators.some(indicator => taskText.includes(indicator)) ? 5 : 0;
    }

    scoreForGeneral(task) {
        // General MCP is good for temporal context and metadata
        const generalIndicators = ['time', 'date', 'context', 'metadata', 'current'];
        const taskText = `${task.title} ${task.description}`.toLowerCase();
        return generalIndicators.some(indicator => taskText.includes(indicator)) ? 4 : 0;
    }

    scoreForProfessional(task) {
        const professionalIndicators = ['linkedin', 'profile', 'professional', 'career', 'networking'];
        const taskText = `${task.title} ${task.description}`.toLowerCase();
        return professionalIndicators.some(indicator => taskText.includes(indicator)) ? 5 : 0;
    }

    scoreForSocial(task) {
        const socialIndicators = ['twitter', 'tweet', 'social', 'startup', 'ycombinator'];
        const taskText = `${task.title} ${task.description}`.toLowerCase();
        return socialIndicators.some(indicator => taskText.includes(indicator)) ? 5 : 0;
    }

    scoreForProductivity(task) {
        const productivityIndicators = ['project', 'task', 'manage', 'organize', 'workflow', 'plan'];
        const taskText = `${task.title} ${task.description}`.toLowerCase();
        return productivityIndicators.some(indicator => taskText.includes(indicator)) ? 5 : 0;
    }

    scoreForCommunication(task) {
        const commIndicators = ['email', 'message', 'send', 'communicate', 'contact'];
        const taskText = `${task.title} ${task.description}`.toLowerCase();
        return commIndicators.some(indicator => taskText.includes(indicator)) ? 5 : 0;
    }

    scoreForAI(task) {
        const aiIndicators = ['ai', 'model', 'hugging', 'face', 'machine learning', 'dataset'];
        const taskText = `${task.title} ${task.description}`.toLowerCase();
        return aiIndicators.some(indicator => taskText.includes(indicator)) ? 5 : 0;
    }

    scoreForTechnical(task) {
        const techIndicators = ['aws', 'cloud', 'technical', 'infrastructure', 'deployment'];
        const taskText = `${task.title} ${task.description}`.toLowerCase();
        return techIndicators.some(indicator => taskText.includes(indicator)) ? 5 : 0;
    }

    findBestAgents(task, agentSimilarities = null) {
        let agentScores;
        
        if (agentSimilarities) {
            // Use similarity-based scoring
            agentScores = agentSimilarities.map(similarity => {
                const matchScore = this.calculateMatchScore(task, similarity.agent, similarity);
                return {
                    agent: similarity.agent,
                    score: matchScore,
                    similarityScore: similarity.similarityScore,
                    contextRelevance: similarity.contextRelevance
                };
            });
        } else {
            // Fallback to traditional scoring
            agentScores = this.mcpAgents.map(agent => ({
                agent,
                score: this.calculateMatchScore(task, agent),
                similarityScore: 0.5,
                contextRelevance: 0.5
            }));
        }

        // Sort by score (descending)
        agentScores.sort((a, b) => b.score - a.score);

        return agentScores.slice(0, 3); // Return top 3 agents
    }

    async generateRecommendations(tasks, contextContent = '') {
        try {
            const recommendations = [];
            
            for (const task of tasks) {
                // Calculate similarity scores between context and all agents
                const agentSimilarities = this.calculateContextAgentSimilarity(contextContent, task);
                
                // Find best matching agents for this task with similarity scores
                const matchedAgents = this.findBestAgents(task, agentSimilarities);
                
                // Create action for the best agent with similarity data
                const bestAgent = matchedAgents[0];
                const action = {
                    id: `action_${task.title.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`,
                    title: task.title,
                    description: task.description,
                    icon: this.getIconForCategory(task.category),
                    confidence: bestAgent.score,
                    mcpAgent: bestAgent.agent.tag,
                    similarityScore: bestAgent.similarityScore,
                    agentSimilarities: agentSimilarities.slice(0, 5), // Top 5 similar agents
                    taskData: task
                };
                
                recommendations.push(action);
            }
            
            return {
                actions: recommendations,
                timestamp: new Date().toISOString()
            };
            
        } catch (error) {
            console.error('❌ Error generating recommendations:', error);
            throw error;
        }
    }


    getIconForCategory(category) {
        const iconMap = {
            'research': 'analyze',
            'productivity': 'document',
            'development': 'code',
            'communication': 'link',
            'analysis': 'analyze'
        };
        return iconMap[category] || 'default';
    }

}

module.exports = AgentMatchingService;
