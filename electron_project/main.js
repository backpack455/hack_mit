const { app, BrowserWindow, Menu, ipcMain, Tray, nativeImage, globalShortcut, Notification, screen } = require('electron');
const path = require('path');
const screenshot = require('screenshot-desktop');
const { spawn } = require('child_process');
require('dotenv').config();

// Keep a global reference of the window object
let mainWindow;
let tray = null;
let isGestureMode = false;
let gestureStartTime = 0;
let gesturePoints = [];
let lastMousePos = { x: 0, y: 0 };

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    },
    show: false, // Don't show until ready
    skipTaskbar: true, // Hide from taskbar initially
    minimizable: true,
    closable: true
  });

  // Load the index.html file
  mainWindow.loadFile('index.html');

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  // Emitted when the window is closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Create system tray
function createTray() {
  // Create custom tray icon using canvas
  const createTrayIcon = (gestureEnabled = false) => {
    const iconPath = path.join(__dirname, 'assets/tray-icon.png');
    let trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
    
    // If no custom icon exists, create one using canvas
    if (trayIcon.isEmpty()) {
      try {
        const { createCanvas } = require('canvas');
        const canvas = createCanvas(16, 16);
        const ctx = canvas.getContext('2d');
        
        // Clear canvas
        ctx.clearRect(0, 0, 16, 16);
        
        if (gestureEnabled) {
          // Draw a circular gesture icon for enabled state
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 1.5;
          ctx.lineCap = 'round';
          
          // Draw circular arrow
          ctx.beginPath();
          ctx.arc(8, 8, 5, -Math.PI/2, Math.PI, false);
          ctx.stroke();
          
          // Draw arrow head
          ctx.beginPath();
          ctx.moveTo(3.5, 10);
          ctx.lineTo(2, 8.5);
          ctx.lineTo(4.5, 8.5);
          ctx.closePath();
          ctx.fillStyle = '#000000';
          ctx.fill();
          
          // Add small dot in center
          ctx.beginPath();
          ctx.arc(8, 8, 1, 0, 2 * Math.PI);
          ctx.fillStyle = '#000000';
          ctx.fill();
        } else {
          // Draw a simple camera icon for disabled state
          ctx.fillStyle = '#666666';
          ctx.strokeStyle = '#666666';
          ctx.lineWidth = 1;
          
          // Camera body
          ctx.fillRect(3, 6, 10, 6);
          
          // Camera lens
          ctx.beginPath();
          ctx.arc(8, 9, 2, 0, 2 * Math.PI);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          ctx.stroke();
          
          // Camera top
          ctx.fillStyle = '#666666';
          ctx.fillRect(6, 4, 4, 2);
        }
        
        trayIcon = nativeImage.createFromBuffer(canvas.toBuffer());
        trayIcon.setTemplateImage(true);
      } catch (error) {
        console.log('Canvas not available, using system template');
        // Fallback to system template
        trayIcon = nativeImage.createFromNamedImage('NSMenuOnStateTemplate', [16, 16]);
        if (!trayIcon.isEmpty()) {
          trayIcon.setTemplateImage(true);
        }
      }
    }
    
    return trayIcon;
  };
  
  tray = new Tray(createTrayIcon(isGestureMode));
  updateTrayMenu();
  
  // Update tooltip based on gesture mode
  const updateTooltip = () => {
    const status = isGestureMode ? 'ON' : 'OFF';
    tray.setToolTip(`Gesture Screenshot App - Gesture Mode: ${status}`);
  };
  updateTooltip();
  
  // Both click and right-click show the menu (no auto-toggle)
  tray.on('click', () => {
    tray.popUpContextMenu();
  });
  
  tray.on('right-click', () => {
    tray.popUpContextMenu();
  });
  
  // Update tray icon when gesture mode changes
  const originalToggleGestureMode = toggleGestureMode;
  toggleGestureMode = function(enabled) {
    originalToggleGestureMode(enabled);
    tray.setImage(createTrayIcon(enabled));
    updateTooltip();
    updateTrayMenu();
  };
}

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  createWindow();
  createTray();
  setupGlobalShortcuts();
  startGestureDetection();

  // On macOS, re-create window when dock icon is clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed
app.on('window-all-closed', () => {
  // On macOS, keep app running even when all windows are closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Clean up gesture detector on quit
app.on('before-quit', () => {
  if (gestureProcess) {
    gestureProcess.stdin.write(JSON.stringify({action: 'quit'}) + '\n');
    gestureProcess.kill();
  }
});

// Security: Prevent new window creation
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (event, navigationUrl) => {
    event.preventDefault();
  });
});

// Example IPC handler
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

// Example IPC handler for showing message
ipcMain.handle('show-message', (event, message) => {
  console.log('Message from renderer:', message);
  return `Echo: ${message}`;
});

// Screenshot capture function
async function captureScreenshot() {
  try {
    const img = await screenshot({ format: 'png' });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `screenshot-${timestamp}.png`;
    
    // Save screenshot to local screenshots directory
    const fs = require('fs');
    const screenshotsDir = path.join(__dirname, 'screenshots');
    
    // Create screenshots directory if it doesn't exist
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }
    
    const filePath = path.join(screenshotsDir, filename);
    fs.writeFileSync(filePath, img);
    
    // Show notification
    new Notification({
      title: 'Screenshot Captured',
      body: `Screenshot saved to ${filename}`,
      silent: false
    }).show();
    
    // Send to renderer with local file path
    if (mainWindow) {
      mainWindow.webContents.send('screenshot-captured', {
        filename: filename,
        filePath: filePath,
        timestamp: new Date().toISOString()
      });
      
      // Show window if hidden
      if (!mainWindow.isVisible()) {
        mainWindow.show();
        mainWindow.focus();
      }
    }
    
    return filename;
  } catch (error) {
    console.error('Screenshot capture failed:', error);
    new Notification({
      title: 'Screenshot Failed',
      body: 'Could not capture screenshot',
      silent: false
    }).show();
  }
}

// Global shortcuts setup
function setupGlobalShortcuts() {
  // Register global shortcut for screenshot
  globalShortcut.register('CommandOrControl+Shift+S', () => {
    captureScreenshot();
  });
  
  // Register gesture mode toggle
  globalShortcut.register('CommandOrControl+Shift+G', () => {
    toggleGestureMode(!isGestureMode);
  });
}

// Update tray menu
function updateTrayMenu() {
  if (!tray) return;
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: isGestureMode ? '🟢 Gesture Mode: ON' : '🔴 Gesture Mode: OFF',
      type: 'checkbox',
      checked: isGestureMode,
      click: (menuItem) => {
        toggleGestureMode(menuItem.checked);
      }
    },
    { type: 'separator' },
    {
      label: '📱 Show App Window',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    {
      label: '📸 Take Screenshot Now',
      accelerator: 'CmdOrCtrl+Shift+S',
      click: () => {
        captureScreenshot();
      }
    },
    { type: 'separator' },
    {
      label: '⚙️ Preferences',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    { type: 'separator' },
    {
      label: '❌ Quit App',
      accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
      click: () => {
        app.quit();
      }
    }
  ]);
  
  tray.setContextMenu(contextMenu);
}

// Toggle gesture detection mode
function toggleGestureMode(enabled) {
  isGestureMode = enabled;
  
  // Control the Python gesture detector
  if (gestureProcess && gestureProcess.stdin) {
    const action = enabled ? 'start' : 'stop';
    gestureProcess.stdin.write(JSON.stringify({action}) + '\n');
  }
  
  new Notification({
    title: 'Gesture Mode',
    body: `Gesture detection ${enabled ? 'enabled' : 'disabled'}. ${enabled ? 'Move cursor in circles to capture!' : 'Click tray icon to re-enable.'}`,
    silent: false
  }).show();
  
  // Send to renderer
  if (mainWindow) {
    mainWindow.webContents.send('gesture-mode-changed', enabled);
  }
}

// Global gesture detection using macOS system events
function startGestureDetection() {
  console.log('Initializing global gesture detection...');
  
  // Create a Python script for global mouse tracking on macOS
  const pythonScript = `
import Quartz
import time
import math
import sys
import json
from threading import Thread

class GlobalGestureDetector:
    def __init__(self):
        self.gesture_points = []
        self.is_tracking = False
        self.last_pos = None
        self.gesture_start_time = 0
        self.movement_threshold = 5  # Minimum movement to register
        self.last_check_time = 0
        self.last_detection_time = 0  # Cooldown for detections
        self.detection_cooldown = 2.0  # 2 second cooldown between detections
        
    def mouse_event_callback(self, proxy, event_type, event, refcon):
        if not self.is_tracking:
            return event
            
        location = Quartz.CGEventGetLocation(event)
        x, y = location.x, location.y
        current_time = time.time()
        
        # Track all mouse movements, not just clicks
        if event_type == Quartz.kCGEventMouseMoved:
            # Only process if enough time has passed and mouse moved significantly
            if (current_time - self.last_check_time > 0.05 and  # 50ms throttle
                (self.last_pos is None or 
                 abs(x - self.last_pos['x']) > self.movement_threshold or 
                 abs(y - self.last_pos['y']) > self.movement_threshold)):
                
                self.gesture_points.append({'x': x, 'y': y, 'time': current_time})
                self.last_pos = {'x': x, 'y': y}
                self.last_check_time = current_time
                
                # Keep only recent points (last 3 seconds for natural movement)
                self.gesture_points = [p for p in self.gesture_points if current_time - p['time'] < 3.0]
                
                # Check for circular gesture continuously (increased threshold)
                if (len(self.gesture_points) > 30 and 
                    current_time - self.last_detection_time > self.detection_cooldown and 
                    self.detect_circular_gesture()):
                    print(json.dumps({'type': 'gesture_detected', 'points': len(self.gesture_points)}))
                    sys.stdout.flush()
                    # Clear ALL points and set cooldown to avoid repeated triggers
                    self.gesture_points = []
                    self.last_detection_time = current_time
                
        return event
    
    def detect_circular_gesture(self):
        if len(self.gesture_points) < 25:  # Increased minimum points
            return False
            
        recent_points = self.gesture_points[-30:]  # More points for better detection
        
        # Calculate center
        center_x = sum(p['x'] for p in recent_points) / len(recent_points)
        center_y = sum(p['y'] for p in recent_points) / len(recent_points)
        
        # Calculate minimum radius requirement
        distances = []
        for point in recent_points:
            distance = math.sqrt((point['x'] - center_x)**2 + (point['y'] - center_y)**2)
            distances.append(distance)
        avg_radius = sum(distances) / len(distances)
        
        # Require minimum radius of 50 pixels to prevent accidental detection
        if avg_radius < 50:
            return False
        
        # Calculate angles
        angles = []
        for point in recent_points:
            angle = math.atan2(point['y'] - center_y, point['x'] - center_x)
            angles.append(angle)
        
        # Check total angle change
        total_angle_change = 0
        for i in range(1, len(angles)):
            angle_diff = angles[i] - angles[i-1]
            
            # Normalize angle difference
            if angle_diff > math.pi:
                angle_diff -= 2 * math.pi
            elif angle_diff < -math.pi:
                angle_diff += 2 * math.pi
                
            total_angle_change += abs(angle_diff)
        
        # Require at least 80% of a full circle for more reliable detection
        return total_angle_change > math.pi * 1.6
    
    def start_monitoring(self):
        self.is_tracking = True
        event_mask = (
            Quartz.CGEventMaskBit(Quartz.kCGEventMouseMoved)
        )
        
        tap = Quartz.CGEventTapCreate(
            Quartz.kCGSessionEventTap,
            Quartz.kCGHeadInsertEventTap,
            Quartz.kCGEventTapOptionDefault,
            event_mask,
            self.mouse_event_callback,
            None
        )
        
        if tap is None:
            print(json.dumps({'type': 'error', 'message': 'Failed to create event tap. Need accessibility permissions.'}))
            sys.stdout.flush()
            return
            
        run_loop_source = Quartz.CFMachPortCreateRunLoopSource(None, tap, 0)
        Quartz.CFRunLoopAddSource(
            Quartz.CFRunLoopGetCurrent(),
            run_loop_source,
            Quartz.kCFRunLoopDefaultMode
        )
        
        Quartz.CGEventTapEnable(tap, True)
        print(json.dumps({'type': 'started', 'message': 'Global gesture detection started'}))
        sys.stdout.flush()
        
        try:
            Quartz.CFRunLoopRun()
        except KeyboardInterrupt:
            print(json.dumps({'type': 'stopped', 'message': 'Global gesture detection stopped'}))
            sys.stdout.flush()

if __name__ == '__main__':
    detector = GlobalGestureDetector()
    
    # Listen for commands from stdin
    def handle_commands():
        for line in sys.stdin:
            try:
                cmd = json.loads(line.strip())
                if cmd.get('action') == 'start':
                    detector.is_tracking = True
                elif cmd.get('action') == 'stop':
                    detector.is_tracking = False
                elif cmd.get('action') == 'quit':
                    break
            except:
                pass
    
    # Start command handler in separate thread
    Thread(target=handle_commands, daemon=True).start()
    
    # Start monitoring
    detector.start_monitoring()
`;
  
  // Write Python script to file
  const fs = require('fs');
  const scriptPath = path.join(__dirname, 'gesture_detector.py');
  fs.writeFileSync(scriptPath, pythonScript);
  
  startPythonGestureDetector(scriptPath);
}

let gestureProcess = null;

function startPythonGestureDetector(scriptPath) {
  try {
    // Use the virtual environment Python
    const venvPython = path.join(__dirname, 'venv', 'bin', 'python');
    gestureProcess = spawn(venvPython, [scriptPath]);
    
    gestureProcess.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (line.trim()) {
          try {
            const message = JSON.parse(line);
            handleGestureMessage(message);
          } catch (e) {
            console.log('Gesture detector:', line);
          }
        }
      }
    });
    
    gestureProcess.stderr.on('data', (data) => {
      console.error('Gesture detector error:', data.toString());
    });
    
    gestureProcess.on('close', (code) => {
      console.log('Gesture detector process closed with code:', code);
      if (code !== 0 && isGestureMode) {
        // Restart if it crashed and gesture mode is still enabled
        setTimeout(() => startPythonGestureDetector(scriptPath), 1000);
      }
    });
    
    // Send start command
    if (gestureProcess.stdin) {
      gestureProcess.stdin.write(JSON.stringify({action: 'start'}) + '\n');
    }
    
  } catch (error) {
    console.error('Failed to start gesture detector:', error);
    
    // Fallback: Show instructions for manual setup
    new Notification({
      title: 'Gesture Detection Setup Required',
      body: 'Please grant accessibility permissions to enable global gestures',
      silent: false
    }).show();
  }
}

function handleGestureMessage(message) {
  switch (message.type) {
    case 'started':
      console.log('Global gesture detection active');
      break;
      
    case 'gesture_detected':
      if (isGestureMode) {
        console.log('Global circular gesture detected!');
        captureScreenshot();
      }
      break;
      
    case 'error':
      console.error('Gesture detector error:', message.message);
      if (message.message.includes('accessibility')) {
        showAccessibilityInstructions();
      }
      break;
  }
}

function showAccessibilityInstructions() {
  new Notification({
    title: 'Accessibility Permission Required',
    body: 'Open System Preferences > Security & Privacy > Privacy > Accessibility and add this app',
    silent: false
  }).show();
  
  // Also show in main window if available
  if (mainWindow) {
    mainWindow.webContents.send('accessibility-permission-needed');
  }
}

// Handle gesture detection from renderer process
ipcMain.handle('gesture-detected', () => {
  if (isGestureMode) {
    console.log('Circular gesture detected from renderer!');
    captureScreenshot();
    return true;
  }
  return false;
});

// Handle opening screenshot folder
ipcMain.handle('open-screenshot-folder', (event, filePath) => {
  const { shell } = require('electron');
  const path = require('path');
  const folderPath = path.dirname(filePath);
  shell.showItemInFolder(filePath);
});

// URL Context Retrieval Handlers
const ContextService = require('./services/contextService');
let contextService;

// Initialize context service
try {
  contextService = new ContextService();
  // IPC Handlers for URL Context Retrieval
  ipcMain.handle('retrieve-url-context', async (event, url, query) => {
    try {
      const result = await contextService.retrieveUrlContext(url, query);
      return result;
    } catch (error) {
      return {
        success: false,
        error: error.message,
        url: url
      };
    }
  });

  // IPC Handler for Google Drive content extraction
  ipcMain.handle('extract-google-drive', async (event, url, query) => {
    try {
      const result = await contextService.handleGoogleDriveUrl(url, query);
      return result;
    } catch (error) {
      return {
        success: false,
        error: error.message,
        url: url,
        service: 'google_drive'
      };
    }
  });

  // IPC Handler for Google Drive service initialization
  ipcMain.handle('init-google-drive', async (event, credentials) => {
    try {
      const success = await contextService.googleDriveService.initialize(credentials);
      return {
        success: success,
        message: success ? 'Google Drive service initialized' : 'Failed to initialize Google Drive service'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  });

} catch (contextError) {
  console.error('Failed to initialize context service:', contextError);
}

ipcMain.handle('get-url-summary', async (event, url) => {
  try {
    const contextService = new ContextService();
    return await contextService.getUrlSummary(url);
  } catch (error) {
    console.error('URL summary error:', error);
    return {
      success: false,
      error: error.message,
      url: url
    };
  }
});

ipcMain.handle('get-raw-content', async (event, url, useBrowser = false) => {
  try {
    const contextService = new ContextService();
    return await contextService.getRawContent(url, useBrowser);
  } catch (error) {
    console.error('Raw content retrieval error:', error);
    return {
      success: false,
      error: error.message,
      url: url
    };
  }
});

// Handle batch URL context retrieval
ipcMain.handle('batch-retrieve-url-context', async (event, urls, query = null) => {
  try {
    const contextService = new ContextService();
    return await contextService.batchRetrieveUrlContext(urls, query);
  } catch (error) {
    console.error('Batch URL context retrieval error:', error);
    return urls.map(url => ({
      success: false,
      error: error.message,
      url: url
    }));
  }
});

// Handle cache management
ipcMain.handle('clear-context-cache', async (event) => {
  if (contextService) {
    contextService.clearCache();
    return { success: true, message: 'Cache cleared successfully' };
  }
  return { success: false, error: 'Context service not available' };
});

ipcMain.handle('get-cache-stats', async (event) => {
  if (contextService) {
    return { success: true, stats: contextService.getCacheStats() };
  }
  return { success: false, error: 'Context service not available' };
});

// IPC handlers for gesture and screenshot functionality
ipcMain.handle('toggle-gesture-mode', (event, enabled) => {
  toggleGestureMode(enabled);
  return isGestureMode;
});

ipcMain.handle('capture-screenshot', () => {
  return captureScreenshot();
});

ipcMain.handle('get-gesture-status', () => {
  return isGestureMode;
});

// Handle window focus for gesture detection
app.on('browser-window-focus', () => {
  if (mainWindow && isGestureMode) {
    mainWindow.webContents.send('focus-changed', true);
  }
});

app.on('browser-window-blur', () => {
  if (mainWindow && isGestureMode) {
    mainWindow.webContents.send('focus-changed', false);
  }
});
