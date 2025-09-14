# Agentic Pipeline System

## Overview

The Agentic Pipeline System is an intelligent automation framework that analyzes user context from screenshots and provides smart, AI-powered task recommendations. When a user captures a screenshot via gesture, the system:

1. **Analyzes Context** - Uses Claude AI to understand what the user is working on
2. **Generates Tasks** - Creates 3 actionable task recommendations based on context
3. **Matches Agents** - Selects the best MCP agents for each task from 20+ available options
4. **Executes Actions** - Runs tasks using the Dedalus platform with selected agents
5. **Displays Results** - Shows formatted results with clickable links and rich content

## Architecture

### Core Services

#### 1. ContextAnalysisService (`services/contextAnalysisService.js`)
- Reads context files from screenshot sessions
- Sends context to Claude AI for intelligent task analysis
- Returns 3 prioritized task recommendations with categories and keywords

#### 2. AgentMatchingService (`services/agentMatchingService.js`)
- Maintains database of 20+ MCP agents with descriptions
- Uses intelligent scoring algorithm to match tasks to best agents
- Considers task category, keywords, and agent capabilities
- Returns top 3 agent recommendations per task

#### 3. DedalusService (`services/dedalusService.js`)
- Integrates with Dedalus platform for agentic task execution
- Supports multiple AI models (GPT-4, Claude 3.5 Sonnet)
- Handles MCP server selection and configuration
- Formats results for display with HTML, links, and images

#### 4. AgenticPipelineService (`services/agenticPipelineService.js`)
- Orchestrates the entire pipeline workflow
- Manages execution state and result storage
- Provides unified interface for overlay integration
- Handles error recovery and fallback scenarios

## Available MCP Agents

The system includes 20+ specialized MCP agents:

### Search & Research
- **exa-mcp** - Fast, intelligent web search and crawling
- **brave-search-mcp** - Privacy-focused web search integration
- **sonar** - Perplexity's Sonar API for web searches

### Development & Documentation
- **context7** - Version-specific documentation and code examples
- **aws-documentation-mcp-server** - AWS documentation with intelligent comprehension
- **sequential-thinking** - Dynamic problem-solving through structured thinking
- **hf-mcp** - Hugging Face Hub integration for AI models and datasets

### Productivity & Project Management
- **linear-mcp** - Complete Linear project management integration
- **notion-mcp** - Essential Notion workspace integration
- **airtable-mcp-server** - Airtable database integration

### Communication & Social
- **agentmail-mcp** - Email management via AgentMail API
- **linkedin-scraper-mcp** - LinkedIn profile data extraction
- **tweet-mcp** - Y Combinator Tweet search for startup insights

### Specialized Services
- **open-meteo-mcp** - Weather data from global meteorological services
- **ticketmaster-mcp** - Event and venue discovery
- **foursquare-places-mcp** - Location and place recommendations
- **flight-search** - Real-time flight search with SerpAPI
- **yclistededalus** - Y Combinator startup database with analytics

## User Interface

### Overlay System
The agentic recommendations appear in the VIPR overlay as three intelligent action buttons:

```
┌─────────────────────────────────────┐
│ 🔍 Search for Documentation        │
│ Find relevant docs for your code   │
│ Confidence: 85%                     │
├─────────────────────────────────────┤
│ 📊 Analyze Development Context      │
│ Get insights on your current work  │
│ Confidence: 92%                     │
├─────────────────────────────────────┤
│ 🚀 Find Similar Projects           │
│ Discover related open source code  │
│ Confidence: 78%                     │
└─────────────────────────────────────┘
```

### Task Execution Interface
When a task runs, users see real-time progress:

```
Running Agentic Task                    Step 3 of 5
┌─────────────────────────────────────┐
│ ✅ Analyzing context with Claude AI │
│ ✅ Matching task to best MCP agents │
│ 🔄 Initializing Dedalus runner     │
│ ⏳ Executing with selected agents   │
│ ⏳ Processing and formatting results│
└─────────────────────────────────────┘

🔄 Executing with exa-mcp agents...
→ Processing data: 87% accuracy
→ Found 23 relevant resources
→ Confidence: 94%
```

### Result Display
Results are formatted with rich content:

- **Clickable Links** - All URLs become clickable hyperlinks
- **Formatted Text** - Markdown-style headers, lists, and emphasis
- **Code Blocks** - Syntax-highlighted code examples
- **Images** - Embedded images when provided by agents
- **Error Handling** - Clear error messages with recovery options

## Configuration

### Environment Variables
```bash
# Required for context analysis
ANTHROPIC_API_KEY=your_claude_api_key

# Optional for production Dedalus integration
DEDALUS_API_KEY=your_dedalus_api_key
```

### MCP Agent Configuration
Agents are configured in `mcp_agents.json`:

```json
{
  "agents": [
    {
      "tag": "exa-mcp",
      "description": "Fast, intelligent web search and crawling."
    }
  ]
}
```

## Integration Points

### Screenshot Capture Flow
1. User performs circular gesture
2. Screenshot captured and processed with AI
3. Context file updated with visual description and extracted text
4. Agentic pipeline automatically triggered
5. Smart recommendations appear in overlay

### IPC Communication
The system uses Electron IPC for communication:

```javascript
// Generate recommendations
const actions = await ipcRenderer.invoke('generate-agentic-recommendations');

// Execute action
const result = await ipcRenderer.invoke('execute-agentic-action', actionId);

// Get execution progress
const progress = await ipcRenderer.invoke('get-task-progress', actionId);
```

## Development Mode

The system includes a mock Dedalus implementation for development:

- **No External Dependencies** - Works without Dedalus API access
- **Realistic Responses** - Generates contextually appropriate mock results
- **Full UI Testing** - Complete overlay and execution flow testing
- **Performance Simulation** - Realistic timing and progress updates

## Extending the System

### Adding New MCP Agents
1. Add agent definition to `mcp_agents.json`
2. Update scoring logic in `AgentMatchingService`
3. Add server mapping in `DedalusService.getMCPServersForAgent()`

### Custom Task Categories
1. Extend category mappings in `AgentMatchingService`
2. Add category-specific icons in `overlay.js`
3. Update task generation prompts in `ContextAnalysisService`

### Result Formatting
1. Extend `formatAgenticResult()` in `overlay.js`
2. Add CSS styles in `overlay.css`
3. Handle new content types in `DedalusService.parseAndFormatContent()`

## Error Handling

The system includes comprehensive error handling:

- **Service Initialization Failures** - Graceful fallback to mock implementations
- **API Rate Limits** - Automatic retry with exponential backoff
- **Network Issues** - Offline mode with cached recommendations
- **Invalid Context** - Fallback to default task suggestions
- **Agent Failures** - Alternative agent selection and execution

## Performance Considerations

- **Context Caching** - Reuses recent context analysis to avoid redundant API calls
- **Agent Scoring Cache** - Caches agent matching results for similar tasks
- **Result Streaming** - Progressive result display for long-running tasks
- **Background Processing** - Non-blocking execution with progress updates

## Security

- **API Key Management** - Environment variable storage with validation
- **Content Sanitization** - HTML sanitization for user-generated content
- **URL Validation** - Safe link handling with security checks
- **Process Isolation** - Separate processes for AI services and UI

## Future Enhancements

- **Custom Agent Development** - Framework for creating custom MCP agents
- **Learning System** - User preference learning for better recommendations
- **Batch Processing** - Multiple screenshot analysis in sequence
- **Integration APIs** - External service integration capabilities
- **Advanced Analytics** - Usage patterns and effectiveness metrics
