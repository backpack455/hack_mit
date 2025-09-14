const { ipcMain, globalShortcut, screen, desktopCapturer, BrowserWindow, Menu } = require('electron');
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
    this.currentPosition = 'bottom-right'; // Track current position: 'top-left', 'top-right', 'bottom-left', 'bottom-right'
    this.registeredShortcuts = [];
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
    
    console.log('✅ Overlay window created (hidden)');
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
    // Unregister all shortcuts
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
  }
}

module.exports = OverlayService;
