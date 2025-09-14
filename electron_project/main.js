const { app, BrowserWindow, Menu, ipcMain, Tray, nativeImage, globalShortcut, Notification, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const screenshot = require('screenshot-desktop');
const { spawn } = require('child_process');
require('dotenv').config();

// --- NEW: Simple JSON session store -----------------------------------------
const SESSIONS_DIR = path.join(__dirname, 'sessions');
const SESSIONS_FILE = path.join(SESSIONS_DIR, 'sessions.json');

function loadStore() {
  try {
    if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    if (!fs.existsSync(SESSIONS_FILE)) {
      fs.writeFileSync(SESSIONS_FILE, JSON.stringify({ sessions: [] }, null, 2));
    }
    return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
  } catch (e) {
    console.error('Failed to load session store:', e);
    return { sessions: [] };
  }
}

function saveStore(store) {
  try {
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(store, null, 2));
  } catch (e) {
    console.error('Failed to save session store:', e);
  }
}

function isoNow() { return new Date().toISOString(); }

function sessionIdForToday(mode) {
  const d = new Date();
  const day = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return `${mode}-${day}`;
}

function ensureSession(store, mode) {
  const id = sessionIdForToday(mode);
  let s = store.sessions.find(s => s.id === id);
  if (!s) {
    s = {
      id,
      mode,
      title: `${mode[0].toUpperCase()+mode.slice(1)} • ${id.split('-').slice(1).join('-')}`,
      created_at: isoNow(),
      updated_at: isoNow(),
      tags: [],
      artifacts: []  // inline for simplicity (keeps MVP simple)
    };
    store.sessions.unshift(s); // newest first
  }
  return s;
}

function addScreenshotArtifact(mode, filePath, filename, extraMeta={}) {
  const store = loadStore();
  const session = ensureSession(store, mode);
  const artifact = {
    id: `art-${Date.now()}`,
    session_id: session.id,
    kind: 'screenshot',
    path: filePath,
    meta_json: { filename, ...extraMeta },
    created_at: isoNow()
  };
  session.artifacts.unshift(artifact);
  session.updated_at = isoNow();
  saveStore(store);
  return { session, artifact };
}
// ---------------------------------------------------------------------------

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
  const { createCanvas } = require('canvas');
  
  const displaySize = 16;  // Display size in menu bar
  const scale = 1.5;  // Scale factor for retina/HD display
  const size = displaySize * scale;  // Render at higher resolution
  
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d', { antialias: 'subpixel' });
  
  // Enable high-quality anti-aliasing
  ctx.antialias = 'subpixel';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  
  // Clear canvas with transparent background
  ctx.clearRect(0, 0, size, size);
  
  // Calculate proportions based on the original 60x35 eye
  const eyeRatio = 60 / 35;  // Original width/height ratio
  const eyeWidth = size * 0.9;  // Slightly smaller than canvas
  const eyeHeight = eyeWidth / eyeRatio;  // Maintain original proportions
  
  // Draw the eye shape (horizontal ellipse) with crisp edges
  ctx.beginPath();
  ctx.ellipse(
    size/2, 
    size/2, 
    eyeWidth/2, 
    eyeHeight/2, 
    0, 0, Math.PI * 2
  );
  ctx.strokeStyle = '#FFFFFF';  // White stroke
  ctx.lineWidth = 1.5 * scale;  // Scale line width
  ctx.stroke();
  
  // Draw the iris (vertical oval in the center)
  // Original iris was 6x25 in a 60x35 container
  const irisWidth = (6 / 60) * eyeWidth;  // Scale proportionally
  const irisHeight = (25 / 35) * eyeHeight;  // Scale proportionally
  
  ctx.beginPath();
  ctx.ellipse(
    size/2, 
    size/2, 
    irisWidth/2,  
    irisHeight/2, 
    0, 0, Math.PI * 2
  );
  ctx.fillStyle = '#FFFFFF';  // White fill
  ctx.fill();
  
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
app.whenReady().then(async () => {
  // --- NEW: Mode IPC ----------------------------------------------------------
  ipcMain.handle('set-mode', (_evt, mode) => {
    if (!['study','work','research'].includes(mode)) return currentMode;
    currentMode = mode;
    // notify all windows (main + overlay if present)
    if (mainWindow) mainWindow.webContents.send('mode-changed', currentMode);
    if (overlayService && overlayService.overlayWindow && !overlayService.overlayWindow.isDestroyed()) {
      overlayService.overlayWindow.webContents.send('mode-changed', currentMode);
    }
    // also refresh tray menu highlights if you build them off currentMode
    updateTrayMenu && updateTrayMenu();
    return currentMode;
  });

  ipcMain.handle('get-mode', () => currentMode);

  // --- NEW: Sessions IPC ------------------------------------------------------
  ipcMain.handle('get-sessions', (_evt, modeFilter) => {
    const store = loadStore();
    const list = Array.isArray(store.sessions) ? store.sessions : [];
    return modeFilter ? list.filter(s => s.mode === modeFilter) : list;
  });

  ipcMain.handle('get-artifacts', (_evt, sessionId) => {
    const store = loadStore();
    const s = store.sessions.find(x => x.id === sessionId);
    return s ? s.artifacts : [];
  });

  // Hide dock icon for pure menu-bar app experience (optional)
  if (process.platform === 'darwin') {
    app.dock.hide();
  }
  
  createAppMenu();
  createWindow();
  createTray();
  setupGlobalShortcuts();
  startGestureDetection();
  
  // Initialize overlay service
  if (overlayService) {
    await overlayService.initialize();
  }

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
app.on('before-quit', async (event) => {
  console.log('🔄 App is quitting, cleaning up...');
  
  // Prevent immediate quit to allow async cleanup
  event.preventDefault();
  
  try {
    // Unregister all global shortcuts
    globalShortcut.unregisterAll();
    
    // Stop gesture detection
    if (gestureProcess && !gestureProcess.killed) {
      gestureProcess.kill();
      gestureProcess = null;
    }
    
    // Clean up overlay service with session cleanup
    if (overlayService) {
      await overlayService.cleanup();
      console.log('✅ Overlay service cleanup completed');
    }
    
    console.log('✅ All cleanup completed, quitting app');
  } catch (error) {
    console.error('❌ Error during app cleanup:', error);
  } finally {
    // Force quit after cleanup
    app.exit(0);
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

    const screenshotsDir = path.join(__dirname, 'screenshots');
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }
    const filePath = path.join(screenshotsDir, filename);
    fs.writeFileSync(filePath, img);

    // Persist to session store under the ACTIVE MODE
    const { session, artifact } = addScreenshotArtifact(
      currentMode,
      filePath,
      filename,
      { mode: currentMode }
    );

    // Notify user
    new Notification({
      title: 'Screenshot Captured',
      body: `Saved to ${currentMode} • ${session.id}`,
      silent: false
    }).show();

    // Broadcast to UI(s)
    const payload = {
      filename,
      filePath,
      timestamp: new Date().toISOString(),
      mode: currentMode,
      sessionId: session.id,
      artifactId: artifact.id
    };

    if (mainWindow) {
      mainWindow.webContents.send('screenshot-captured', payload);
      mainWindow.webContents.send('session-updated', { session });
      if (!mainWindow.isVisible()) { mainWindow.show(); mainWindow.focus(); }
    }
    if (overlayService && overlayService.overlayWindow && !overlayService.overlayWindow.isDestroyed()) {
      overlayService.overlayWindow.webContents.send('screenshot-captured', payload);
      overlayService.overlayWindow.webContents.send('session-updated', { session });
    }

    return filename;
  } catch (error) {
    console.error('Screenshot capture failed:', error);
    new Notification({ title: 'Screenshot Failed', body: 'Could not capture screenshot', silent: false }).show();
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

function updateTrayMenu() {
  if (!tray) return;

  // Check if the main window is visible (not hidden)
  const isWindowVisible = mainWindow && mainWindow.isVisible();
  
  // Check if overlay is visible to determine app visibility state
  const appIsVisible = isWindowVisible || (overlayService && overlayService.isOverlayVisible);

  const template = [
    {
      label: 'Mode',
      submenu: [
        { label: 'Study', type: 'radio', checked: currentMode==='study', click: () => ipcMain.emit('force-set-mode', null, 'study') },
        { label: 'Work', type: 'radio', checked: currentMode==='work', click: () => ipcMain.emit('force-set-mode', null, 'work') },
        { label: 'Research', type: 'radio', checked: currentMode==='research', click: () => ipcMain.emit('force-set-mode', null, 'research') },
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
      label: 'Show Session History',
      click: () => {
        if (mainWindow) {
          if (mainWindow.isMinimized()) {
            mainWindow.restore();
          }
          mainWindow.show();
          mainWindow.focus();
          mainWindow.moveTop();
          // On macOS, show the dock icon when opening the window
          if (process.platform === 'darwin') {
            app.dock.show();
          }
        } else {
          // If window doesn't exist, create it
          createWindow();
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

// Single place to apply + broadcast:
ipcMain.on('force-set-mode', (_evt, mode) => {
  currentMode = mode;
  if (mainWindow) mainWindow.webContents.send('mode-changed', currentMode);
  if (overlayService && overlayService.overlayWindow && !overlayService.overlayWindow.isDestroyed()) {
    overlayService.overlayWindow.webContents.send('mode-changed', currentMode);
  }
  updateTrayMenu && updateTrayMenu();
});

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
    // Use virtual environment Python first - try multiple possible executables
    const venvPaths = [
      path.join(__dirname, 'venv', 'bin', 'python'),
      path.join(__dirname, 'venv', 'bin', 'python3'),
      path.join(__dirname, 'venv', 'bin', 'python3.12')
    ];
    
    let pythonExec = 'python3';
    
    for (const venvPath of venvPaths) {
      if (fs.existsSync(venvPath)) {
        pythonExec = venvPath;
        console.log('✅ Using virtual environment Python:', venvPath);
        break;
      }
    }
    
    if (!venvPaths.some(p => fs.existsSync(p))) {
      console.log('⚠️ Virtual environment not found, using system Python');
    }
    
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

async function handleGestureMessage(message) {
  switch (message.type) {
    case 'started':
      console.log('Global gesture detection active');
      break;
      
    case 'gesture_detected':
      if (isGestureMode) {
        console.log('Global circular gesture detected!');
        console.log('Capturing screenshot...');
        
        // Trigger overlay service - this handles both screenshot capture and processing
        if (overlayService) {
          await overlayService.handleCircleGesture();
        }
        
        // Don't call the old captureScreenshot() function anymore
        // The overlay service handles everything now
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
const OverlayService = require('./services/overlayService');
let contextService;
let overlayService;

// Initialize context service and overlay service
try {
  contextService = new ContextService();
  overlayService = new OverlayService();
  console.log('✅ Services initialized successfully');
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
  console.error('Failed to initialize services:', contextError);
  console.error('Stack trace:', contextError.stack);
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

// Legacy IPC handler removed - now handled by the new session store system above

// IPC handler to get session details
ipcMain.handle('get-session-details', (event, sessionId) => {
  if (overlayService) {
    return overlayService.getSessionDetails(sessionId);
  }
  return null;
});

// IPC handlers for mode and after-capture action are already defined in app.whenReady()

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
