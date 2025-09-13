const { contextBridge, ipcRenderer } = require('electron');

// existing API functions for screenshot, gestures...
contextBridge.exposeInMainWorld('electronAPI', {
  // Already existing methods:
  captureScreenshot: () => ipcRenderer.invoke('capture-screenshot'),
  toggleGestureMode: (enabled) => ipcRenderer.invoke('toggle-gesture-mode', enabled),
  getGestureStatus: () => ipcRenderer.invoke('get-gesture-status'),
  onScreenshotCaptured: (callback) => ipcRenderer.on('screenshot-captured', (event, data) => callback(event, data)),
  onGestureModeChanged: (callback) => ipcRenderer.on('gesture-mode-changed', (event, enabled) => callback(event, enabled)),
  openScreenshotFolder: (filePath) => ipcRenderer.invoke('open-screenshot-folder', filePath),

  // NEW: mode and after-capture handling
  setMode: (mode) => ipcRenderer.invoke('set-mode', mode),
  getMode: () => ipcRenderer.invoke('get-mode'),
  onModeChanged: (callback) => ipcRenderer.on('mode-changed', (_event, mode) => callback(mode)),
  setAfterCaptureAction: (action) => ipcRenderer.invoke('set-after-capture-action', action),
  getAfterCaptureAction: () => ipcRenderer.invoke('get-after-capture-action'),
  onAfterCaptureChanged: (callback) => ipcRenderer.on('after-capture-changed', (_event, action) => callback(action)),

  // Event listener cleanup
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
  
  // Additional event listeners that may be needed
  onAccessibilityPermissionNeeded: (callback) => ipcRenderer.on('accessibility-permission-needed', callback),
  gestureDetected: () => ipcRenderer.invoke('gesture-detected'),
  // URL Context Retrieval API
  retrieveUrlContext: (url, query = null) => ipcRenderer.invoke('retrieve-url-context', url, query),
  getUrlSummary: (url) => ipcRenderer.invoke('get-url-summary', url),
  getRawContent: (url, useBrowser = false) => ipcRenderer.invoke('get-raw-content', url, useBrowser),
  batchRetrieveUrlContext: (urls, query = null) => ipcRenderer.invoke('batch-retrieve-url-context', urls, query),
  
  // Cache management
  clearContextCache: () => ipcRenderer.invoke('clear-context-cache'),
  getCacheStats: () => ipcRenderer.invoke('get-cache-stats'),
  
  // Google Drive integration
  extractGoogleDrive: (url, query) => ipcRenderer.invoke('extract-google-drive', url, query),
  initGoogleDrive: (credentials) => ipcRenderer.invoke('init-google-drive', credentials),
  
  // Add more API methods here as needed
  platform: process.platform,
  versions: process.versions
});
