const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

// existing API functions for screenshot, gestures...
contextBridge.exposeInMainWorld('electronAPI', {
  // App version
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  
  // Show message
  showMessage: (message) => ipcRenderer.invoke('show-message', message),
  
  // Gesture controls
  toggleGestureMode: (enabled) => ipcRenderer.invoke('toggle-gesture-mode', enabled),
  getGestureStatus: () => ipcRenderer.invoke('get-gesture-status'),
  gestureDetected: () => ipcRenderer.invoke('gesture-detected'),
  
  // Screenshot functionality
  captureScreenshot: () => ipcRenderer.invoke('capture-screenshot'),
  openScreenshotFolder: (filePath) => ipcRenderer.invoke('open-screenshot-folder', filePath),
  
  // Mode management
  setMode: (mode) => ipcRenderer.invoke('set-mode', mode),
  getMode: () => ipcRenderer.invoke('get-mode'),
  
  // Session management
  getSessions: () => ipcRenderer.invoke('get-sessions'),
  getSessionDetails: (sessionId) => ipcRenderer.invoke('get-session-details', sessionId),
  
  // Event listeners
  onScreenshotCaptured: (callback) => ipcRenderer.on('screenshot-captured', callback),
  onGestureModeChanged: (callback) => ipcRenderer.on('gesture-mode-changed', callback),
  onModeChanged: (callback) => ipcRenderer.on('mode-changed', callback),
  onAccessibilityPermissionNeeded: (callback) => ipcRenderer.on('accessibility-permission-needed', callback),
  onFocusChanged: (callback) => ipcRenderer.on('focus-changed', callback),
  onAfterCaptureChanged: (callback) => ipcRenderer.on('after-capture-changed', callback),
  
  // Remove listeners
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
  
  // URL Context Retrieval
  retrieveUrlContext: (url, query) => ipcRenderer.invoke('retrieve-url-context', url, query),
  extractGoogleDrive: (url, query) => ipcRenderer.invoke('extract-google-drive', url, query),
  initGoogleDrive: (credentials) => ipcRenderer.invoke('init-google-drive', credentials),
  getUrlSummary: (url) => ipcRenderer.invoke('get-url-summary', url),
  getRawContent: (url, useBrowser) => ipcRenderer.invoke('get-raw-content', url, useBrowser),
  batchRetrieveUrlContext: (urls, query) => ipcRenderer.invoke('batch-retrieve-url-context', urls, query),
  clearContextCache: () => ipcRenderer.invoke('clear-context-cache'),
  getCacheStats: () => ipcRenderer.invoke('get-cache-stats'),
  
  
  // Add more API methods here as needed
  platform: process.platform,
  versions: process.versions
});
