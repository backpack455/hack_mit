const { app, BrowserWindow, Menu, ipcMain, Tray, nativeImage, globalShortcut, Notification, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const screenshot = require('screenshot-desktop');
const { spawn } = require('child_process');

// Helper for packaged app paths
const RES = (...p) => app.isPackaged
  ? path.join(process.resourcesPath, ...p)
  : path.join(__dirname, ...p);

// Keep a global reference of the window object
let mainWindow;
let tray = null;
let isGestureMode = false;
let currentMode = 'study';          // NEW: default mode
let afterCaptureAction = 'popover';  // NEW: default after-capture
let isRecording = false;             // NEW: recording state
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

// NEW: update tray title with a dot if gesture mode on
function updateTrayTitle() {
  // On macOS, a simple dot is enough; you can combine with a space or emoji if desired
  const dot = isGestureMode ? ' •' : '';
  tray.setTitle(dot);
}

// Create system tray
function createTray() {
  // Create custom tray icon using canvas
function createTrayIcon(gestureEnabled = false) {
  // Draw an eye-like oval with a radial gradient and an iris line
  const { createCanvas } = require('canvas');
  const canvas = createCanvas(20, 12);
  const ctx = canvas.getContext('2d');

  // Background oval (slightly taller than wide)
  const grad = ctx.createRadialGradient(10, 6, 0, 10, 6, 6);
  grad.addColorStop(0, gestureEnabled ? '#69D39B' : '#E0B465');
  grad.addColorStop(1, gestureEnabled ? '#49D29C' : '#CFA052');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(10, 6, 8, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Central slit (iris)
  ctx.fillStyle = '#0B0C10';
  ctx.beginPath();
  ctx.ellipse(10, 6, 1.2, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Transparent surrounding
  return nativeImage.createFromBuffer(canvas.toBuffer());
}
  
  tray = new Tray(createTrayIcon(isGestureMode));
  updateTrayMenu();
  updateTrayTitle();  // update title based on gesture mode

  tray.on('click', () => { tray.popUpContextMenu(); });
  tray.on('right-click', () => { tray.popUpContextMenu(); });

  // monkey patch toggleGestureMode so it updates tray and menu
  const origToggle = toggleGestureMode;
  toggleGestureMode = function(enabled) {
    origToggle(enabled);
    updateTrayTitle();
    updateTrayMenu();
  };
}

// Create proper macOS App menu
function createAppMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: 'Preferences…', accelerator: 'CmdOrCtrl+,', click: () => mainWindow?.show() },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }] : []),
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' }
      ]
    }
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  // Set up IPC handlers for mode management
  ipcMain.handle('set-mode', (event, mode) => {
    if (['study', 'work', 'research'].includes(mode)) {
      currentMode = mode;
      // Notify all windows of the mode change
      BrowserWindow.getAllWindows().forEach(window => {
        window.webContents.send('mode-changed', currentMode);
      });
      return true;
    }
    return false;
  });

  ipcMain.handle('get-mode', () => currentMode);

  // Hide dock icon for pure menu-bar app experience (optional)
  if (process.platform === 'darwin') {
    app.dock.hide();
  }
  
  createAppMenu();
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
    // Capture screenshot without hiding windows - let it capture whatever is visible
    console.log('Capturing screenshot...');
    
    const img = await screenshot({ 
      format: 'png'
    });
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

// REPLACE: rebuild the tray menu with new structure
function updateTrayMenu() {
  if (!tray) return;
  const template = [
    {
      label: 'Mode',
      submenu: [
        {
          label: 'Study',
          type: 'radio',
          checked: currentMode === 'study',
          click: () => {
            currentMode = 'study';
            updateTrayMenu();
            // notify renderer
            if (mainWindow) mainWindow.webContents.send('mode-changed', 'study');
          },
        },
        {
          label: 'Work',
          type: 'radio',
          checked: currentMode === 'work',
          click: () => {
            currentMode = 'work';
            updateTrayMenu();
            if (mainWindow) mainWindow.webContents.send('mode-changed', 'work');
          },
        },
        {
          label: 'Research',
          type: 'radio',
          checked: currentMode === 'research',
          click: () => {
            currentMode = 'research';
            updateTrayMenu();
            if (mainWindow) mainWindow.webContents.send('mode-changed', 'research');
          },
        },
      ],
    },
    { type: 'separator' },
    {
      label: 'Gesture Mode',
      type: 'checkbox',
      checked: isGestureMode,
      click: (menuItem) => {
        toggleGestureMode(menuItem.checked);
      },
    },
    {
      // Recording entry is present but disabled for now
      label: isRecording ? 'Stop Recording' : 'Start Recording',
      enabled: false,
    },
    {
      label: 'Take Screenshot Now',
      click: () => {
        captureScreenshot();
      },
    },
    { type: 'separator' },
    {
      label: 'After-capture',
      submenu: [
        {
          label: 'Popover',
          type: 'radio',
          checked: afterCaptureAction === 'popover',
          click: () => {
            afterCaptureAction = 'popover';
            updateTrayMenu();
            if (mainWindow) mainWindow.webContents.send('after-capture-changed', 'popover');
          },
        },
        {
          label: 'Notification',
          type: 'radio',
          checked: afterCaptureAction === 'notification',
          click: () => {
            afterCaptureAction = 'notification';
            updateTrayMenu();
            if (mainWindow) mainWindow.webContents.send('after-capture-changed', 'notification');
          },
        },
        {
          label: 'Silent',
          type: 'radio',
          checked: afterCaptureAction === 'silent',
          click: () => {
            afterCaptureAction = 'silent';
            updateTrayMenu();
            if (mainWindow) mainWindow.webContents.send('after-capture-changed', 'silent');
          },
        },
      ],
    },
    { type: 'separator' },
    {
      label: 'Show App Window',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    {
      label: 'Preferences…',
      click: () => {
        // Placeholder for preferences UI
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit App',
      role: 'quit',
    },
  ];
  const contextMenu = Menu.buildFromTemplate(template);
  
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
    // Find available Python executable
    const candidates = [
      path.join(__dirname, 'venv', 'bin', 'python'),
      '/usr/bin/python3',
      '/opt/homebrew/bin/python3'
    ];
    const pythonExec = candidates.find(p => fs.existsSync(p)) || 'python3';
    
    console.log(`Using Python executable: ${pythonExec}`);
    gestureProcess = spawn(pythonExec, [scriptPath]);
    
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

// NEW: IPC handlers for mode and after-capture action
ipcMain.handle('get-mode', () => {
  return currentMode;
});

ipcMain.handle('set-mode', (event, mode) => {
  currentMode = mode;
  updateTrayMenu();
  return currentMode;
});

ipcMain.handle('get-after-capture-action', () => {
  return afterCaptureAction;
});

ipcMain.handle('set-after-capture-action', (event, action) => {
  afterCaptureAction = action;
  updateTrayMenu();
  return afterCaptureAction;
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
