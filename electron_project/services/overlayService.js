const { ipcMain, globalShortcut, screen, desktopCapturer, BrowserWindow, Menu } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const ScreenshotProcessingService = require('./screenshotProcessingService');
const AgenticPipelineService = require('./agenticPipelineService');

class OverlayService {
  constructor() {
    this.overlayWindow = null;
    this.isOverlayVisible = false;
    this.screenshotQueue = [];
    this.maxQueueSize = 5;
    this.gestureListener = null;
    this.dismissTimeout = null;
    this.allowClose = false;
    this.currentPosition = 'bottom-right'; // Track current position: 'top-left', 'top-right', 'bottom-left', 'bottom-right'
    this.registeredShortcuts = [];
    this.screenshotProcessor = new ScreenshotProcessingService();
    this.agenticPipeline = new AgenticPipelineService();
    this.currentSessionId = null;
  }

  /**
   * Initialize the overlay service
   */
  async initialize() {
    try {
      console.log('🎯 Initializing VIPR Overlay Service...');
      
      // Initialize screenshot processing service
      await this.screenshotProcessor.initialize();
      console.log('✅ Screenshot processing service initialized');
      
      // Create new session
      this.currentSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      console.log('📝 Created session:', this.currentSessionId);
      
      // Register global shortcuts for circle gesture simulation
      this.registerGlobalShortcuts();
      
      // Set up IPC handlers
      this.setupIPCHandlers();
      
      // Register navigation shortcuts
      this.registerNavigationShortcuts();
      
      // Create the overlay window but don't show it yet
      await this.createOverlayWindow();
      
      console.log('✅ Overlay service initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize overlay service:', error);
      return false;
    }
  }

  /**
   * Register navigation shortcuts for moving the overlay
   */
  registerNavigationShortcuts() {
    if (process.platform !== 'darwin') return; // Only for macOS

    const shortcuts = [
      { combo: 'Command+Shift+Up', handler: () => this.handlePositionTransition('up') },
      { combo: 'Command+Shift+Right', handler: () => this.handlePositionTransition('right') },
      { combo: 'Command+Shift+Down', handler: () => this.handlePositionTransition('down') },
      { combo: 'Command+Shift+Left', handler: () => this.handlePositionTransition('left') }
    ];

    // Unregister any existing shortcuts first
    this.unregisterNavigationShortcuts();

    for (const { combo, handler } of shortcuts) {
      const registered = globalShortcut.register(combo, handler);

      if (registered) {
        this.registeredShortcuts.push(combo);
        console.log(`✅ Registered navigation shortcut: ${combo}`);
      } else {
        console.warn(`⚠️ Failed to register navigation shortcut: ${combo}`);
      }
    }
  }
  
  /**
   * Unregister all navigation shortcuts
   */
  unregisterNavigationShortcuts() {
    for (const shortcut of this.registeredShortcuts) {
      globalShortcut.unregister(shortcut);
    }
    this.registeredShortcuts = [];
  }
  
  /**
   * Handle position transition based on current position and direction
   */
  handlePositionTransition(direction) {
    const currentPos = this.currentPosition;
    let newPosition = null;

    // Apply movement rules based on current position and direction
    switch(direction) {
      case 'up':
        if (currentPos === 'bottom-left') {
          newPosition = 'top-left';      // Bottom-left → Top-left
        } else if (currentPos === 'bottom-right') {
          newPosition = 'top-right';     // Bottom-right → Top-right
        }
        // Top positions: up does nothing
        break;

      case 'down':
        if (currentPos === 'top-left') {
          newPosition = 'bottom-left';   // Top-left → Bottom-left
        } else if (currentPos === 'top-right') {
          newPosition = 'bottom-right';  // Top-right → Bottom-right
        }
        // Bottom positions: down does nothing
        break;

      case 'left':
        if (currentPos === 'top-right') {
          newPosition = 'top-left';      // Top-right → Top-left
        } else if (currentPos === 'bottom-right') {
          newPosition = 'bottom-left';   // Bottom-right → Bottom-left
        }
        // Left positions: left does nothing
        break;

      case 'right':
        if (currentPos === 'top-left') {
          newPosition = 'top-right';     // Top-left → Top-right
        } else if (currentPos === 'bottom-left') {
          newPosition = 'bottom-right';  // Bottom-left → Bottom-right
        }
        // Right positions: right does nothing
        break;
    }

    // Update position if a valid move was made
    if (newPosition) {
      this.moveOverlayToPosition(newPosition);
    }
  }

  /**
   * Move overlay to specified position
   */
  moveOverlayToPosition(position = 'bottom-right') {
    if (!this.overlayWindow || this.overlayWindow.isDestroyed()) return;

    this.currentPosition = position;
    const bounds = this.calculatePosition();

    // Use animated transition for smooth positioning
    this.overlayWindow.setBounds({
      x: bounds.x,
      y: bounds.y,
      width: this.overlayWindow.getBounds().width,
      height: this.overlayWindow.getBounds().height
    }, true);  // animate: true for smooth transition

    console.log(`📍 Moved overlay to ${position} at (${bounds.x}, ${bounds.y})`);

    // Notify renderer of position change
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      this.overlayWindow.webContents.send('position-changed', { position });
    }
  }
  
  /**
   * Calculate window position based on current position setting
   */
  calculatePosition() {
    const cursorPoint = screen.getCursorScreenPoint();
    const activeDisplay = screen.getDisplayNearestPoint(cursorPoint);
    const { x: screenX, y: screenY, width, height } = activeDisplay.workArea;

    const windowWidth = 720;  // Double the width
    const windowHeight = 520;  // Double the height
    const margin = 20;

    // Ensure window doesn't exceed screen boundaries
    const maxX = screenX + width - windowWidth - margin;
    const maxY = screenY + height - windowHeight - margin;
    const minX = screenX + margin;
    const minY = screenY + margin;

    let position;
    switch (this.currentPosition) {
      case 'top-left':
        position = { x: Math.max(minX, screenX + margin), y: Math.max(minY, screenY + margin) };
        break;
      case 'top-right':
        position = { x: Math.min(maxX, screenX + width - windowWidth - margin), y: Math.max(minY, screenY + margin) };
        break;
      case 'bottom-left':
        position = { x: Math.max(minX, screenX + margin), y: Math.min(maxY, screenY + height - windowHeight - margin) };
        break;
      case 'bottom-right':
      default:
        position = {
          x: Math.min(maxX, screenX + width - windowWidth - margin),
          y: Math.min(maxY, screenY + height - windowHeight - margin)
        };
    }

    // Final boundary check to prevent overlay from going off-screen
    position.x = Math.max(screenX, Math.min(position.x, screenX + width - windowWidth));
    position.y = Math.max(screenY, Math.min(position.y, screenY + height - windowHeight));

    return position;
  }

  /**
   * Register global shortcuts to simulate circle gesture
   */
  registerGlobalShortcuts() {
    // Try multiple shortcut combinations to avoid conflicts
    const shortcuts = [
      process.platform === 'darwin' ? 'Cmd+Shift+O' : 'Ctrl+Shift+O', // O for Overlay
      process.platform === 'darwin' ? 'Cmd+Alt+O' : 'Ctrl+Alt+O',
      process.platform === 'darwin' ? 'Cmd+Shift+V' : 'Ctrl+Shift+V'  // V for VIPR
    ];
    
    let registered = false;
    let activeShortcut = '';
    
    for (const shortcut of shortcuts) {
      try {
        const success = globalShortcut.register(shortcut, () => {
          console.log('🔄 Shortcut pressed:', shortcut);
          console.log('🎯 Toggling overlay display...');
          this.handleShortcutToggle();
        });
        
        if (success) {
          registered = true;
          activeShortcut = shortcut;
          console.log(`✅ Global shortcut registered: ${shortcut}`);
          console.log(`📋 Press ${shortcut} to trigger overlay`);
          break;
        } else {
          console.log(`⚠️ Failed to register ${shortcut}, trying next...`);
        }
      } catch (error) {
        console.log(`⚠️ Error registering ${shortcut}:`, error.message);
      }
    }
    
    if (!registered) {
      console.error('❌ Failed to register any global shortcut');
      console.log('💡 You can also trigger overlay programmatically for testing');
      
      // Add a fallback method for testing
      setTimeout(() => {
        console.log('🧪 Testing overlay display in 3 seconds...');
        setTimeout(() => {
          console.log('🧪 Auto-triggering overlay for testing...');
          this.handleCircleGesture();
        }, 3000);
      }, 1000);
    }
  }

  /**
   * Handle circle gesture detection - toggle overlay visibility
   */
  async handleCircleGesture() {
    try {
      // If overlay is visible, hide it (toggle off)
      if (this.isOverlayVisible) {
        console.log('🔄 Toggling overlay off...');
        this.hideOverlay();
        return;
      }
      
      console.log('📸 Capturing screenshot...');
      console.log('🔍 DEBUG: About to capture screenshot');
      
      // Show brief capture indicator
      this.showCaptureIndicator();
      
      // Capture screenshot
      const screenshot = await this.captureScreenshot();
      console.log('🔍 DEBUG: Screenshot result:', screenshot ? 'SUCCESS' : 'FAILED');
      
      if (screenshot) {
        console.log('✅ Screenshot captured, processing with AI...');
        console.log('🔍 DEBUG: Starting screenshot processing pipeline');
        
        // Save screenshot to main screenshots folder for processing
        const screenshotDir = path.join(__dirname, '..', 'screenshots');
        await fs.mkdir(screenshotDir, { recursive: true });
        
        const screenshotPath = path.join(screenshotDir, `screenshot_${screenshot.id}.png`);
        const base64Data = screenshot.dataURL.replace(/^data:image\/png;base64,/, '');
        await fs.writeFile(screenshotPath, base64Data, 'base64');
        
        // Update screenshot object with file path for frontend display
        screenshot.path = screenshotPath;
        screenshot.filename = `screenshot_${screenshot.id}.png`;
        
        // Process screenshot with AI, OCR, and URL extraction
        console.log('🔄 Processing screenshot with session ID:', this.currentSessionId);
        const processingResult = await this.screenshotProcessor.processScreenshot(screenshotPath, this.currentSessionId);
        
        console.log('📊 Processing result:', processingResult);
        if (processingResult.success) {
          console.log('✅ Screenshot processed successfully');
          console.log('📄 Context file created at:', processingResult.contextFile);
          
          // Update screenshot with processing results
          screenshot.processingResult = processingResult.data;
          screenshot.contextFile = processingResult.contextFile;
          
          // Add to context queue (screenshot already has path and dataURL)
          this.addToScreenshotQueue(screenshot);
          
          // Generate smart agentic recommendations
          const actions = await this.generateAgenticRecommendations();
          console.log('🎯 Generated agentic recommendations:', actions.length);
          
          // Show overlay with actions
          console.log('🎨 Attempting to show overlay...');
          await this.showOverlay(actions);
        } else {
          console.error('❌ Failed to process screenshot:', processingResult.error);
          // Fallback to basic screenshot handling (screenshot already has path and dataURL)
          this.addToScreenshotQueue(screenshot);
          const actions = await this.generateAgenticRecommendations(true); // fallback mode
          await this.showOverlay(actions);
        }
      } else {
        console.error('❌ Failed to capture screenshot');
      }
      
    } catch (error) {
      console.error('❌ Error handling circle gesture:', error);
      console.error('Stack:', error.stack);
    }
  }

  async handleShortcutToggle() {
    try {
      // If overlay is visible, hide it (toggle off)
      if (this.isOverlayVisible) {
        console.log('🔄 Toggling overlay off...');
        this.hideOverlay();
        return;
      }
      
      // For shortcuts, generate fresh agentic recommendations
      const actions = await this.generateAgenticRecommendations();
      console.log('🎯 Generated agentic recommendations for shortcut:', actions.length);
      
      console.log('🎨 Attempting to show overlay...');
      await this.showOverlay(actions);
      
    } catch (error) {
      console.error('❌ Error handling shortcut toggle:', error);
      console.error('Stack:', error.stack);
    }
  }

  /**
   * Capture screenshot of active window
   */
  async captureScreenshot() {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['window', 'screen'],
        thumbnailSize: { width: 1920, height: 1080 }
      });

      if (sources.length > 0) {
        // Get the primary screen or first available source
        const primarySource = sources.find(source => source.name === 'Entire Screen') || sources[0];
        
        const screenshot = {
          id: Date.now().toString(),
          timestamp: new Date().toISOString(),
          dataURL: primarySource.thumbnail.toDataURL(),
          source: primarySource.name,
          size: {
            width: primarySource.thumbnail.getSize().width,
            height: primarySource.thumbnail.getSize().height
          }
        };

        console.log('✅ Screenshot captured successfully');
        return screenshot;
      }
    } catch (error) {
      console.error('❌ Failed to capture screenshot:', error);
      return null;
    }
  }

  /**
   * Add screenshot to context queue
   */
  addToScreenshotQueue(screenshot) {
    this.screenshotQueue.unshift(screenshot);
    
    // Keep only the last 5 screenshots
    if (this.screenshotQueue.length > this.maxQueueSize) {
      this.screenshotQueue = this.screenshotQueue.slice(0, this.maxQueueSize);
    }
    
    console.log(`📚 Screenshot added to queue. Queue size: ${this.screenshotQueue.length}`);
  }

  /**
   * Generate actions based on AI processing results
   */
  generateActionsFromProcessing(processingData) {
    const actions = [];
    
    // Always include view context action
    actions.push({
      id: 'view_context',
      title: 'View Full Context',
      description: `AI analysis, OCR text, and ${processingData.urls.count} URLs processed`,
      icon: 'context',
      confidence: 1.0,
      data: {
        contextFile: processingData.contextFile,
        hasAI: processingData.visualDescription.success,
        hasOCR: processingData.ocrText.success,
        urlCount: processingData.urls.count
      }
    });
    
    // Add OCR text action if text was extracted
    if (processingData.ocrText.success && processingData.ocrText.extractedText.trim()) {
      actions.push({
        id: 'copy_text',
        title: 'Copy Extracted Text',
        description: `Copy ${processingData.ocrText.extractedText.length} characters of OCR text`,
        icon: 'text',
        confidence: 0.9,
        data: {
          text: processingData.ocrText.extractedText
        }
      });
    }
    
    // Add URL actions if URLs were found
    if (processingData.urls.found.length > 0) {
      actions.push({
        id: 'open_urls',
        title: `Open ${processingData.urls.found.length} URLs`,
        description: `Found ${processingData.urls.processed.length} processed URLs with content`,
        icon: 'link',
        confidence: 0.8,
        data: {
          urls: processingData.urls.found,
          processedUrls: processingData.urls.processed
        }
      });
    }
    
    // Add AI description action if available
    if (processingData.visualDescription.success) {
      actions.push({
        id: 'view_ai_description',
        title: 'View AI Description',
        description: 'See AI-generated visual analysis',
        icon: 'analyze',
        confidence: 0.85,
        data: {
          description: processingData.visualDescription.description
        }
      });
    }
    
    // Add session context action
    actions.push({
      id: 'generate_session_context',
      title: 'Generate Session Summary',
      description: 'Create comprehensive session context file',
      icon: 'summary',
      confidence: 0.7,
      data: {
        sessionId: processingData.sessionId
      }
    });
    
    // Return top 4 actions sorted by confidence
    return actions
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 4);
  }
  

  /**
   * Create the overlay window (without showing it)
   */
  async createOverlayWindow() {
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      return this.overlayWindow;
    }
    
    console.log('🎨 Creating overlay window...');
    
    // Calculate initial position
    const position = this.calculatePosition();
    
    // Create overlay window with alwaysOnTop and other required flags
    this.overlayWindow = new BrowserWindow({
      width: 720,  // Double the width
      height: 520, // Double the height
      x: position.x,
      y: position.y,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      focusable: false,
      show: false,
      type: 'panel',
      level: 'screen-saver',
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        enableRemoteModule: true,
        backgroundThrottling: false // Ensure smooth animations even when in background
      },
      titleBarStyle: 'customButtonsOnHover',
      fullscreenable: false,
      hasShadow: false,
      acceptFirstMouse: true,
      hiddenInMissionControl: true,
      visibleOnAllWorkspaces: true,
      roundedCorners: false
    });
    
    // Prevent window from being closed accidentally
    this.overlayWindow.on('close', (event) => {
      // Only allow programmatic closing
      if (!this.allowClose) {
        event.preventDefault();
      }
    });
    
    // Make sure window stays on top of fullscreen windows
    this.overlayWindow.setAlwaysOnTop(true, 'screen-saver');
    
    // Load the overlay HTML
    console.log('🔗 Loading overlay HTML...');
    await this.overlayWindow.loadFile(path.join(__dirname, '../overlay/overlay.html'));
    
    // Set up IPC communication
    this.setupOverlayIPC();
    
    // Show the overlay window immediately so the VIPR button is visible
    this.overlayWindow.showInactive();
    this.isOverlayVisible = true;
    
    console.log('✅ Overlay window created and shown');
    console.log('👁️ VIPR button should now be visible on screen');
    return this.overlayWindow;
  }
  
  /**
   * Set up IPC communication with the overlay window
   */
  setupOverlayIPC() {
    if (!this.overlayWindow) return;
    
    // Handle position changes from renderer
    ipcMain.on('request-position', (event) => {
      event.returnValue = this.currentPosition;
    });

    // Handle move overlay to position requests from renderer
    ipcMain.on('move-overlay-to-position', (event, position) => {
      this.moveOverlayToPosition(position);
    });

    // Handle close requests (only allowed from menu bar)
    ipcMain.on('request-close', (event) => {
      if (this.allowClose) {
        this.hideOverlay();
      }
    });
  }

  /**
   * Show overlay window with actions
   */
  async showOverlay(actions) {
    try {
      // Hide main window when overlay is shown
      const { app } = require('electron');
      const mainWindow = require('electron').BrowserWindow.getAllWindows().find(win => !win.isDestroyed() && win.webContents.getURL().includes('index.html'));
      if (mainWindow && mainWindow.isVisible()) {
        mainWindow.hide();
        // Hide dock icon on macOS
        if (process.platform === 'darwin') {
          app.dock.hide();
        }
      }

      // Ensure overlay window exists
      if (!this.overlayWindow || this.overlayWindow.isDestroyed()) {
        await this.createOverlayWindow();
      }
      
      // Show the window if hidden
      if (!this.overlayWindow.isVisible()) {
        this.overlayWindow.showInactive(); // Show without stealing focus
        console.log('👁️ Overlay window shown');
      }
      
      // Update actions
      if (actions && actions.length > 0) {
        console.log('📤 Sending actions to overlay...');
        this.overlayWindow.webContents.send('show-actions', actions);
      }
      
      this.isOverlayVisible = true;
      
      // No auto-dismiss timeout - overlay stays until manually toggled
      console.log('✅ Overlay displayed with actions (sticky mode)');
      
    } catch (error) {
      console.error('❌ Failed to show overlay:', error);
      console.error('Stack:', error.stack);
    }
  }

  /**
   * Get optimal position for overlay (bottom-right corner of active screen)
   * @deprecated Use calculatePosition() instead
   */
  getOptimalPosition() {
    const pos = this.calculatePosition();
    return { x: pos.x, y: pos.y };
  }

  /**
   * Show brief capture indicator
   */
  showCaptureIndicator() {
    // This could be enhanced with a brief visual flash
    console.log('📸 Capture indicator shown');
  }

  /**
   * Set auto-dismiss timeout
   */
  setDismissTimeout() {
    if (this.dismissTimeout) {
      clearTimeout(this.dismissTimeout);
    }
    
    this.dismissTimeout = setTimeout(() => {
      this.hideOverlay();
    }, 60000); // 60 second timeout (much longer)
  }

  /**
   * Hide overlay window
   */
  hideOverlay() {
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      this.allowClose = true; // Allow the window to close
      this.overlayWindow.hide(); // Hide instead of close to preserve state
      this.allowClose = false; // Reset flag
      
      // Notify renderer that overlay was hidden
      this.overlayWindow.webContents.send('overlay-hidden');
    }
    
    this.isOverlayVisible = false;
    
    if (this.dismissTimeout) {
      clearTimeout(this.dismissTimeout);
      this.dismissTimeout = null;
    }
    
    console.log('✅ Overlay hidden');
  }

  /**
   * Setup IPC handlers for overlay communication
   */
  setupIPCHandlers() {
    // Handle action execution
    ipcMain.handle('execute-overlay-action', async (event, actionId, actionData) => {
      console.log(`🎯 Executing action: ${actionId}`);
      
      // Execute the action with enhanced processing
      const result = await this.executeAction(actionId, actionData);
      
      return result;
    });

    // Handle overlay dismissal
    ipcMain.handle('dismiss-overlay', () => {
      this.hideOverlay();
      return { success: true };
    });

    // Handle screenshot queue requests
    ipcMain.handle('get-screenshot-queue', () => {
      return this.screenshotQueue.map((screenshot, index) => ({
        ...screenshot,
        index,
        timestamp: screenshot.timestamp || Date.now()
      }));
    });

    // Handle actions for specific screenshot
    ipcMain.handle('get-actions-for-screenshot', async (event, index) => {
      if (index >= 0 && index < this.screenshotQueue.length) {
        const screenshot = this.screenshotQueue[index];
        // Use AI-powered actions if processing results are available
        if (screenshot.processingResult) {
          return this.generateActionsFromProcessing(screenshot.processingResult);
        } else {
          // Generate agentic recommendations instead of mock actions
          return await this.generateAgenticRecommendations();
        }
      }
      return null;
    });
    
    // Handle session context generation
    ipcMain.handle('generate-session-context', async (event, sessionId) => {
      try {
        const contextPath = await this.screenshotProcessor.generateSessionContext(sessionId || this.currentSessionId);
        return { success: true, contextPath };
      } catch (error) {
        console.error('Error generating session context:', error);
        return { success: false, error: error.message };
      }
    });
    
    // Handle context file viewing
    ipcMain.handle('view-context-file', async (event, filePath) => {
      try {
        const content = await fs.readFile(filePath, 'utf8');
        return { success: true, content };
      } catch (error) {
        console.error('Error reading context file:', error);
        return { success: false, error: error.message };
      }
    });
    
    // Handle session cleanup
    ipcMain.handle('cleanup-session', async (event, sessionId) => {
      try {
        await this.screenshotProcessor.cleanupSession(sessionId || this.currentSessionId);
        return { success: true };
      } catch (error) {
        console.error('Error cleaning up session:', error);
        return { success: false, error: error.message };
      }
    });
    
    // Handle service status requests
    ipcMain.handle('get-processing-status', () => {
      return this.screenshotProcessor.getStatus();
    });

    // Handle hover events to reset timeout
    ipcMain.handle('overlay-hover', () => {
      // Reset dismiss timeout on hover
      this.setDismissTimeout();
      return { success: true };
    });
  }

  /**
   * Execute screenshot processing actions
   */
  async executeAction(actionId, actionData) {
    console.log(`🔄 Executing action: ${actionId}`);
    
    try {
      switch (actionId) {
        case 'view_context':
          if (actionData && actionData.contextFile) {
            const content = await fs.readFile(actionData.contextFile, 'utf8');
            return { success: true, actionId, data: { content, filePath: actionData.contextFile } };
          }
          break;
          
        case 'copy_text':
          if (actionData && actionData.text) {
            // In a real implementation, this would copy to clipboard
            console.log('📋 Text copied to clipboard (simulated)');
            return { success: true, actionId, data: { text: actionData.text, copied: true } };
          }
          break;
          
        case 'open_urls':
          if (actionData && actionData.urls) {
            console.log(`🔗 Opening ${actionData.urls.length} URLs (simulated)`);
            return { success: true, actionId, data: { urls: actionData.urls, opened: true } };
          }
          break;
          
        case 'view_ai_description':
          if (actionData && actionData.description) {
            return { success: true, actionId, data: { description: actionData.description } };
          }
          break;
          
        case 'generate_session_context':
          if (actionData && actionData.sessionId) {
            const contextPath = await this.screenshotProcessor.generateSessionContext(actionData.sessionId);
            return { success: true, actionId, data: { contextPath } };
          }
          break;
          
        default:
          // Fallback to mock execution for unknown actions
          await new Promise(resolve => setTimeout(resolve, 500));
          return { success: true, actionId, data: { message: 'Action executed (mock)' } };
      }
      
      return { success: false, actionId, error: 'Invalid action data' };
      
    } catch (error) {
      console.error(`❌ Error executing action ${actionId}:`, error);
      return { success: false, actionId, error: error.message };
    }
  }

  /**
   * Get sessions formatted for Session History page
   */

  getSessionsForHistory() {
    const sessions = [];
    
    // Get session data from screenshot processor
    if (this.screenshotProcessor && this.screenshotProcessor.sessionData) {
      for (const [sessionId, sessionInfo] of this.screenshotProcessor.sessionData) {
        if (sessionInfo.screenshots && sessionInfo.screenshots.length > 0) {
          const session = {
            id: sessionId,
            title: `Screenshot Session ${new Date(sessionInfo.startTime).toLocaleDateString()}`,
            created_at: sessionInfo.startTime,
            mode: 'study', // Default mode, could be enhanced to track actual mode
            artifacts: sessionInfo.screenshots.map(screenshot => ({
              kind: 'screenshot',
              path: screenshot.imagePath,
              dataURL: screenshot.dataURL || null,
              timestamp: screenshot.timestamp,
              filename: screenshot.metadata?.fileName || 'screenshot.png',
              processingResult: screenshot.processingResult || null
            }))
          };
          sessions.push(session);
        }
      }
    }
    
    // Also include screenshots from the overlay queue
    if (this.screenshotQueue.length > 0) {
      const queueSession = {
        id: 'current_queue',
        title: `Current Session - ${this.screenshotQueue.length} screenshots`,
        created_at: new Date().toISOString(),
        mode: 'study',
        artifacts: this.screenshotQueue.map(screenshot => ({
          kind: 'screenshot',
          path: screenshot.path || screenshot.filePath,
          dataURL: screenshot.dataURL || null,
          timestamp: screenshot.timestamp,
          filename: screenshot.filename || 'screenshot.png',
          processingResult: screenshot.processingResult || null
        }))
      };
      sessions.push(queueSession);
    }
    
    return sessions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  /**
   * Get detailed session information
   */
  getSessionDetails(sessionId) {
    if (sessionId === 'current_queue') {
      return {
        id: sessionId,
        screenshots: this.screenshotQueue,
        contextFiles: this.screenshotQueue.map(s => s.contextFile).filter(Boolean)
      };
    }
    
    if (this.screenshotProcessor && this.screenshotProcessor.sessionData) {
      const sessionInfo = this.screenshotProcessor.sessionData.get(sessionId);
      if (sessionInfo) {
        return {
          id: sessionId,
          screenshots: sessionInfo.screenshots,
          contextFiles: sessionInfo.contextFiles || [],
          sessionContextFile: sessionInfo.sessionContextFile
        };
      }
    }
    
    return null;
  }

  /**
   * Generate agentic recommendations using the pipeline service
   */
  async generateAgenticRecommendations(fallbackMode = false) {
    try {
      if (fallbackMode) {
        // Return fallback actions when context analysis fails
        return [
          {
            id: 'fallback_search',
            title: 'Search for Information',
            description: 'Search the web for relevant information based on your current context',
            icon: 'analyze',
            confidence: 0.7
          },
          {
            id: 'fallback_analyze',
            title: 'Analyze Current Context',
            description: 'Use AI to analyze and provide insights on your current work',
            icon: 'analyze',
            confidence: 0.6
          },
          {
            id: 'fallback_documentation',
            title: 'Find Documentation',
            description: 'Search for relevant documentation and code examples',
            icon: 'document',
            confidence: 0.5
          }
        ];
      }

      // Use the agentic pipeline service directly
      const recommendations = await this.agenticPipeline.generateSmartRecommendations();
      if (recommendations && recommendations.length > 0) {
        return recommendations;
      }

      // If no recommendations, return fallback
      return await this.generateAgenticRecommendations(true);
      
    } catch (error) {
      console.error('❌ Error generating agentic recommendations:', error);
      return await this.generateAgenticRecommendations(true);
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    try {
      // Cleanup screenshot processor and session data
      this.unregisterNavigationShortcuts();
      
      globalShortcut.unregisterAll();

      // Close overlay window if it exists
      if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
        this.allowClose = true;
        this.overlayWindow.close();
      }
    
    // Clear any pending timeouts
      if (this.dismissTimeout) {
        clearTimeout(this.dismissTimeout);
      }
    
      console.log('🧹 Cleaned up overlay service');
      
      if (this.screenshotProcessor) {
        await this.screenshotProcessor.cleanupAll();
      }
      
      // Unregister global shortcuts
      globalShortcut.unregisterAll();
      
      // Hide overlay
      this.hideOverlay();
      
      console.log('🧹 Overlay service cleaned up');
    } catch (error) {
      console.error('❌ Error during cleanup:', error);
    }
  }
}

module.exports = OverlayService;
