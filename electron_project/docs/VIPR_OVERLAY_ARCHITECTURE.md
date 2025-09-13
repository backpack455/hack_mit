# VIPR Context-Aware Overlay Architecture

## 1. Architectural Plan

### Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                    VIPR Overlay System                     │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │ Gesture Listener│  │Screenshot Module│  │Analysis Engine  │ │
│  │                 │  │                 │  │                 │ │
│  │ • OS Hotkeys    │  │ • Screen Capture│  │ • OCR/Vision    │ │
│  │ • Trackpad      │  │ • Region Select │  │ • App Detection │ │
│  │ • Custom Keys   │  │ • Context Queue │  │ • Content Class │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
│           │                     │                     │        │
│           └─────────────────────┼─────────────────────┘        │
│                                 │                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │ Action Generator│  │ UI Overlay Mgr  │  │  MCP Executor   │ │
│  │                 │  │                 │  │                 │ │
│  │ • Context Rules │  │ • Hover States  │  │ • Task Dispatch │ │
│  │ • AI Suggestions│  │ • Animations    │  │ • Result Handle │ │
│  │ • Action Filter │  │ • Positioning   │  │ • Error Recovery│ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

#### 1.1 Gesture Listener Component
- **Responsibility**: Low-latency OS-level gesture detection
- **Key Features**:
  - Global hotkey registration (cross-platform)
  - Circle gesture recognition that conducts screenshots
  - Custom key combinations
  - Debouncing to prevent accidental triggers
- **Performance**: <10ms response time, minimal CPU usage when idle

#### 1.2 Screenshot Module
- **Responsibility**: Efficient screen capture and context management
- **Key Features**:
  - Active window capture
  - User-defined region selection
  - Context history queue (last 5 screenshots)
  - Metadata extraction (timestamp, app context)
- **Optimization**: Hardware-accelerated capture, compressed storage

#### 1.3 Analysis Engine
- **Responsibility**: Asynchronous image and context analysis
- **Key Features**:
  - Application detection (browser, IDE, design tools)
  - Content classification (text, code, UI, forms)
  - Entity extraction (text, buttons, logos)
  - Confidence scoring for suggestions
- **Architecture**: Plugin-based analyzers for extensibility

#### 1.4 Action Generator
- **Responsibility**: Context-aware action suggestion
- **Key Features**:
  - Rule-based action mapping
  - AI-powered suggestion refinement
  - Action prioritization and filtering
  - Dynamic action templates
- **Output**: 2-4 ranked, actionable suggestions

#### 1.5 UI Overlay Manager
- **Responsibility**: Subtle, non-intrusive UI presentation
- **Key Features**:
  - Consistent positioning system
  - Smooth hover animations
  - Auto-dismiss logic
  - Theme adaptation (light/dark)
- **Design**: Semi-transparent, OS-integrated appearance

#### 1.6 MCP Executor
- **Responsibility**: Action execution and result handling
- **Key Features**:
  - Pre-defined MCP task dispatch
  - Progress indication
  - Error handling and recovery
  - Result presentation

## 2. Technology Stack Recommendations

### 2.1 Primary Framework: **Tauri** (Recommended)
```rust
// Tauri provides the best balance of performance and OS integration
[dependencies]
tauri = { version = "1.5", features = ["api-all"] }
tokio = { version = "1.0", features = ["full"] }
serde = { version = "1.0", features = ["derive"] }
```

**Advantages**:
- Native performance with Rust backend
- Excellent OS integration capabilities
- Small bundle size (~10MB vs Electron's ~100MB)
- Built-in security model
- Cross-platform gesture/hotkey support

**Frontend**: React/TypeScript for overlay UI

### 2.2 Alternative: **Electron** (Fallback)
```javascript
// If team prefers full JavaScript stack
const { app, globalShortcut, screen, BrowserWindow } = require('electron');
```

**Advantages**:
- Familiar JavaScript ecosystem
- Rich plugin ecosystem
- Easier for web developers
- Mature cross-platform APIs

### 2.3 Core Libraries

#### Screen Capture
```rust
// Tauri
use screenshots::Screen;

// Electron
const { desktopCapturer } = require('electron');
```

#### OCR & Vision Analysis
```javascript
// Tesseract.js for OCR
import Tesseract from 'tesseract.js';

// OpenCV.js for image analysis
import cv from 'opencv.js';

// Cloud Vision APIs for advanced analysis
import { ImageAnnotatorClient } from '@google-cloud/vision';
```

#### OS Integration
```rust
// Global hotkeys (Tauri)
use global_hotkey::{hotkey::HotKey, GlobalHotKeyManager};

// Trackpad gestures
use cocoa::appkit::NSEvent; // macOS
use winapi::um::winuser; // Windows
```

#### UI Framework
```typescript
// React with Framer Motion for animations
import { motion, AnimatePresence } from 'framer-motion';

// Styled Components for theming
import styled from 'styled-components';
```

## 3. Core Logic Pseudocode

```typescript
class VIPROverlaySystem {
  private gestureListener: GestureListener;
  private screenshotModule: ScreenshotModule;
  private analysisEngine: AnalysisEngine;
  private actionGenerator: ActionGenerator;
  private overlayManager: OverlayManager;
  private mcpExecutor: MCPExecutor;

  async initialize() {
    // Initialize all components
    await this.gestureListener.registerGlobalHotkeys();
    await this.screenshotModule.initializeCapture();
    await this.analysisEngine.loadModels();
    
    // Set up event handlers
    this.gestureListener.onGesture(this.handleGesture.bind(this));
  }

  async handleGesture(gestureType: GestureType) {
    try {
      // 1. Immediate feedback
      this.showCaptureIndicator();
      
      // 2. Capture screenshot
      const screenshot = await this.screenshotModule.captureActiveWindow();
      const context = await this.screenshotModule.getApplicationContext();
      
      // 3. Add to context queue
      this.screenshotModule.addToContextQueue(screenshot, context);
      
      // 4. Asynchronous analysis (non-blocking)
      this.analyzeAndDisplay(screenshot, context);
      
    } catch (error) {
      this.handleError(error);
    }
  }

  async analyzeAndDisplay(screenshot: Screenshot, context: AppContext) {
    try {
      // 1. Parallel analysis
      const [appInfo, contentType, entities] = await Promise.all([
        this.analysisEngine.detectApplication(screenshot),
        this.analysisEngine.classifyContent(screenshot),
        this.analysisEngine.extractEntities(screenshot)
      ]);

      // 2. Generate contextual actions
      const analysisResult = { appInfo, contentType, entities, context };
      const actions = await this.actionGenerator.generateActions(analysisResult);

      // 3. Display overlay with actions
      if (actions.length > 0) {
        await this.overlayManager.showOverlay(actions, {
          position: this.getOptimalPosition(),
          timeout: 15000,
          dismissible: true
        });
      }

    } catch (error) {
      this.handleAnalysisError(error);
    }
  }

  async executeAction(actionId: string, context: ActionContext) {
    try {
      // 1. Hide overlay
      this.overlayManager.hideOverlay();
      
      // 2. Show progress indicator
      this.overlayManager.showProgress(actionId);
      
      // 3. Execute MCP task
      const result = await this.mcpExecutor.execute(actionId, context);
      
      // 4. Handle result
      this.handleActionResult(result);
      
    } catch (error) {
      this.handleExecutionError(error);
    }
  }

  private getOptimalPosition(): Position {
    const screen = this.screenshotModule.getPrimaryScreen();
    return {
      x: screen.width - 320, // 320px from right edge
      y: screen.height - 200, // 200px from bottom
      anchor: 'bottom-right'
    };
  }
}

// Usage
const viprSystem = new VIPROverlaySystem();
await viprSystem.initialize();
```

## 4. UI/UX Design Recommendations

### 4.1 Overlay Design Principles

#### Visual Hierarchy
```css
/* Base overlay container */
.vipr-overlay {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 999999;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui;
}

/* Collapsed state - subtle indicator */
.vipr-indicator {
  width: 48px;
  height: 48px;
  background: rgba(0, 122, 255, 0.9);
  border-radius: 24px;
  backdrop-filter: blur(20px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.vipr-indicator:hover {
  transform: scale(1.1);
  box-shadow: 0 12px 48px rgba(0, 122, 255, 0.3);
}

/* Expanded state - action panel */
.vipr-panel {
  min-width: 280px;
  max-width: 320px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 16px;
  backdrop-filter: blur(40px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
  padding: 16px;
}

/* Dark mode adaptation */
@media (prefers-color-scheme: dark) {
  .vipr-panel {
    background: rgba(28, 28, 30, 0.95);
    border-color: rgba(255, 255, 255, 0.1);
  }
}
```

#### Animation System
```typescript
// Framer Motion variants for smooth transitions
const overlayVariants = {
  hidden: {
    scale: 0,
    opacity: 0,
    y: 20,
    transition: { duration: 0.2 }
  },
  visible: {
    scale: 1,
    opacity: 1,
    y: 0,
    transition: { 
      duration: 0.3,
      type: "spring",
      stiffness: 300,
      damping: 30
    }
  },
  exit: {
    scale: 0.8,
    opacity: 0,
    y: 10,
    transition: { duration: 0.2 }
  }
};

const actionButtonVariants = {
  hover: {
    scale: 1.02,
    backgroundColor: "rgba(0, 122, 255, 0.1)",
    transition: { duration: 0.15 }
  },
  tap: {
    scale: 0.98,
    transition: { duration: 0.1 }
  }
};
```

### 4.2 Interaction Patterns

#### Progressive Disclosure
1. **Idle State**: Invisible, no UI presence
2. **Gesture Detected**: Brief capture indicator (200ms pulse)
3. **Analysis Complete**: Small indicator appears (48px circle)
4. **Hover**: Expands to show action buttons
5. **Action Selected**: Executes and dismisses

#### Dismissal Methods
```typescript
const dismissalHandlers = {
  // Auto-dismiss after timeout
  timeout: 15000,
  
  // Click outside overlay
  clickOutside: true,
  
  // Escape key
  escapeKey: true,
  
  // Gesture repeat (double-tap to dismiss)
  gestureRepeat: true,
  
  // Focus loss (when user switches apps)
  focusLoss: true
};
```

### 4.3 Accessibility Considerations

```typescript
// ARIA labels and keyboard navigation
const OverlayComponent = () => (
  <div
    role="dialog"
    aria-label="VIPR Context Actions"
    aria-describedby="vipr-actions-description"
  >
    <div id="vipr-actions-description" className="sr-only">
      Context-aware actions based on your current screen content
    </div>
    
    {actions.map((action, index) => (
      <button
        key={action.id}
        aria-label={action.description}
        tabIndex={index}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            executeAction(action.id);
          }
        }}
      >
        {action.title}
      </button>
    ))}
  </div>
);
```

### 4.4 Performance Optimizations

#### Rendering Strategy
```typescript
// Use React.memo for expensive components
const ActionButton = React.memo(({ action, onExecute }) => (
  <motion.button
    variants={actionButtonVariants}
    whileHover="hover"
    whileTap="tap"
    onClick={() => onExecute(action.id)}
  >
    <Icon name={action.icon} />
    <span>{action.title}</span>
  </motion.button>
));

// Virtualization for large action lists
import { FixedSizeList as List } from 'react-window';
```

#### Resource Management
```typescript
// Cleanup and memory management
useEffect(() => {
  const cleanup = () => {
    // Cancel pending analysis
    analysisController.abort();
    
    // Clear screenshot cache
    screenshotModule.clearCache();
    
    // Remove event listeners
    gestureListener.cleanup();
  };

  return cleanup;
}, []);
```

This architecture provides a solid foundation for the VIPR overlay system, balancing performance, user experience, and technical feasibility while maintaining the "intrusive but not overly intrusive" design principle.
