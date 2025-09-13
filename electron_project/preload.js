const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  showMessage: (message) => ipcRenderer.invoke('show-message', message),
  
  // Gesture and screenshot functionality
  toggleGestureMode: (enabled) => ipcRenderer.invoke('toggle-gesture-mode', enabled),
  captureScreenshot: () => ipcRenderer.invoke('capture-screenshot'),
  getGestureStatus: () => ipcRenderer.invoke('get-gesture-status'),
  gestureDetected: () => ipcRenderer.invoke('gesture-detected'),
  
  // Event listeners for main process events
  onScreenshotCaptured: (callback) => ipcRenderer.on('screenshot-captured', callback),
  onGestureModeChanged: (callback) => ipcRenderer.on('gesture-mode-changed', callback),
  onAccessibilityPermissionNeeded: (callback) => ipcRenderer.on('accessibility-permission-needed', callback),
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
  
  // Add more API methods here as needed
  platform: process.platform,
  versions: process.versions
});
