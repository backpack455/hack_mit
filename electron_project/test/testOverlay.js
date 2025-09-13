const { app, BrowserWindow, globalShortcut } = require('electron');
const path = require('path');
const OverlayService = require('../services/overlayService');

let overlayService;

// Simple test app to verify overlay functionality
app.whenReady().then(async () => {
  console.log('🚀 Starting overlay test...');
  
  try {
    // Initialize overlay service
    overlayService = new OverlayService();
    const initialized = await overlayService.initialize();
    
    if (initialized) {
      console.log('✅ Overlay service initialized successfully');
      console.log('📋 Press Cmd+Shift+C (or Ctrl+Shift+C) to trigger overlay');
      console.log('📋 Press Cmd+Q to quit');
    } else {
      console.error('❌ Failed to initialize overlay service');
    }
    
  } catch (error) {
    console.error('❌ Error during initialization:', error);
    console.error('Stack:', error.stack);
  }
});

// Quit when all windows are closed
app.on('window-all-closed', () => {
  app.quit();
});

app.on('before-quit', () => {
  if (overlayService) {
    overlayService.cleanup();
  }
});

// Handle activation (macOS)
app.on('activate', () => {
  // Keep app running even without windows for overlay testing
});

console.log('🔍 Overlay test app starting...');
console.log('📁 Working directory:', process.cwd());
console.log('📁 Script path:', __filename);
