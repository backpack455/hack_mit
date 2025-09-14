const { ipcMain, globalShortcut, screen, desktopCapturer, BrowserWindow } = require('electron');
const path = require('path');

class OverlayService {
  constructor() {
    this.overlayWindow = null;
    this.isOverlayVisible = false;
    this.screenshotQueue = [];
    this.maxQueueSize = 5;
    this.gestureListener = null;
    this.dismissTimeout = null;
    this.allowClose = false;
  }

  /**
   * Initialize the overlay service
   */
  async initialize() {
    try {
      console.log('🎯 Initializing VIPR Overlay Service...');
      
      // Register global shortcuts for circle gesture simulation
      this.registerGlobalShortcuts();
      
      // Set up IPC handlers
      this.setupIPCHandlers();
      
      console.log('✅ Overlay service initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize overlay service:', error);
      return false;
    }
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
      
      // Show brief capture indicator
      this.showCaptureIndicator();
      
      // Capture screenshot
      const screenshot = await this.captureScreenshot();
      
      if (screenshot) {
        console.log('✅ Screenshot captured, adding to queue...');
        // Add to context queue
        this.addToScreenshotQueue(screenshot);
        
        // Generate mock actions (not connected to real automation yet)
        const actions = this.generateMockActions(screenshot);
        console.log('🎯 Generated actions:', actions.length);
        
        // Show overlay with actions
        console.log('🎨 Attempting to show overlay...');
        await this.showOverlay(actions);
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
      
      // For shortcuts, just show overlay with last actions (no screenshot)
      if (this.screenshotQueue.length > 0) {
        const lastScreenshot = this.screenshotQueue[this.screenshotQueue.length - 1];
        const actions = this.generateMockActions(lastScreenshot);
        console.log('🎯 Using cached actions:', actions.length);
        
        console.log('🎨 Attempting to show overlay...');
        await this.showOverlay(actions);
      } else {
        // No cached screenshots, show default actions
        const defaultActions = [
          { id: 'extract_text', title: 'Extract Text', description: 'Extract text from screen content', icon: 'text', confidence: 0.85 },
          { id: 'analyze_content', title: 'Analyze Content', description: 'Analyze visual elements and layout', icon: 'analyze', confidence: 0.90 },
          { id: 'create_summary', title: 'Create Summary', description: 'Generate summary of visible content', icon: 'summary', confidence: 0.80 }
        ];
        
        console.log('🎯 Using default actions:', defaultActions.length);
        console.log('🎨 Attempting to show overlay...');
        await this.showOverlay(defaultActions);
      }
      
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
   * Generate mock actions for demonstration (not connected to real automation)
   */
  generateMockActions(screenshot) {
    const mockActions = [
      {
        id: 'extract_text',
        title: 'Extract Text',
        description: 'Extract and copy text from the screenshot',
        icon: 'text',
        confidence: 0.9
      },
      {
        id: 'analyze_content',
        title: 'Analyze Content',
        description: 'Analyze the content and provide insights',
        icon: 'analyze',
        confidence: 0.8
      },
      {
        id: 'create_summary',
        title: 'Create Summary',
        description: 'Generate a summary of the visible content',
        icon: 'summary',
        confidence: 0.7
      },
      {
        id: 'find_links',
        title: 'Find Links',
        description: 'Extract and organize any links found',
        icon: 'link',
        confidence: 0.6
      }
    ];

    // Return top 3 actions sorted by confidence
    return mockActions
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3);
  }

  /**
   * Show overlay window with actions
   */
  async showOverlay(actions) {
    if (this.isOverlayVisible) {
      console.log('🔄 Updating existing overlay with new actions...');
      // Update existing overlay with new actions
      if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
        this.overlayWindow.webContents.send('show-actions', actions);
        console.log('✅ Overlay updated with new actions:', actions.map(a => a.title));
      }
      return;
    }

    try {
      console.log('🎨 Creating overlay window...');
      
      // Get optimal position (bottom-right corner)
      const position = this.getOptimalPosition();
      console.log('📍 Overlay position:', position);
      
      // Create overlay window
      this.overlayWindow = new BrowserWindow({
        width: 360,
        height: 260,
        x: position.x,
        y: position.y,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        movable: false,
        focusable: false, // Changed back to false to prevent focus stealing
        show: false,
        type: 'panel',
        level: 'screen-saver',
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false,
          enableRemoteModule: true
        }
      });

      // Prevent window from being closed accidentally
      this.overlayWindow.on('close', (event) => {
        // Only allow programmatic closing
        if (!this.allowClose) {
          event.preventDefault();
        }
      });

      console.log('🔗 Loading overlay HTML...');
      // Load overlay HTML
      await this.overlayWindow.loadFile(path.join(__dirname, '../overlay/overlay.html'));
      
      // Show the window after loading
      this.overlayWindow.show();
      console.log('👁️ Overlay window shown');
      
      // Send actions to overlay after a brief delay
      setTimeout(() => {
        if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
          console.log('📤 Sending actions to overlay...');
          this.overlayWindow.webContents.send('show-actions', actions);
        }
      }, 100);
      
      this.isOverlayVisible = true;
      
      // No auto-dismiss timeout - overlay stays until manually toggled
      console.log('✅ Overlay displayed with actions (sticky mode):', actions.map(a => a.title));
      
    } catch (error) {
      console.error('❌ Failed to show overlay:', error);
      console.error('Stack:', error.stack);
    }
  }

  /**
   * Get optimal position for overlay (bottom-right corner of active screen)
   */
  getOptimalPosition() {
    // Get the display where the cursor is currently located
    const cursorPoint = screen.getCursorScreenPoint();
    const activeDisplay = screen.getDisplayNearestPoint(cursorPoint);
    const { x: screenX, y: screenY, width, height } = activeDisplay.workArea;
    
    return {
      x: screenX + width - 380, // 360px width + 20px margin
      y: screenY + height - 280  // 260px height + 20px margin
    };
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
      this.overlayWindow.close();
      this.overlayWindow = null;
      this.allowClose = false; // Reset flag
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
    ipcMain.handle('execute-overlay-action', async (event, actionId) => {
      console.log(`🎯 Executing action: ${actionId}`);
      
      // DON'T hide overlay - let it stay open for task sequence
      // this.hideOverlay(); // REMOVED - overlay should stay open
      
      // Mock action execution (not connected to real automation yet)
      await this.executeAction(actionId);
      
      return { success: true, actionId };
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
    ipcMain.handle('get-actions-for-screenshot', (event, index) => {
      if (index >= 0 && index < this.screenshotQueue.length) {
        const screenshot = this.screenshotQueue[index];
        return this.generateMockActions(screenshot);
      }
      return null;
    });

    // Handle hover events to reset timeout
    ipcMain.handle('overlay-hover', () => {
      // Reset dismiss timeout on hover
      this.setDismissTimeout();
      return { success: true };
    });
  }

  /**
   * Mock action execution (placeholder for future integration)
   */
  async executeAction(actionId) {
    console.log(`🔄 Mock executing action: ${actionId}`);
    
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log(`✅ Mock action completed: ${actionId}`);
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    // Unregister global shortcuts
    globalShortcut.unregisterAll();
    
    // Hide overlay
    this.hideOverlay();
    
    // Clear timeouts
    if (this.dismissTimeout) {
      clearTimeout(this.dismissTimeout);
    }
    
    console.log('🧹 Overlay service cleaned up');
  }
}

module.exports = OverlayService;
