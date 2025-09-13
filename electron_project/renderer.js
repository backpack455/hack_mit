// This file runs in the renderer process and handles the UI interactions

let isGestureMode = false;
let screenshots = [];

document.addEventListener('DOMContentLoaded', async () => {
    // Set up gesture and screenshot functionality
    setupGestureControls();
    
    // Load initial gesture status
    await updateGestureStatus();
    
    // Add interactive effects
    addInteractiveEffects();
});


// Setup gesture control functionality
function setupGestureControls() {
    const gestureToggle = document.getElementById('gesture-toggle');
    const screenshotBtn = document.getElementById('screenshot-btn');
    
    // Gesture toggle button
    gestureToggle.addEventListener('click', async () => {
        try {
            isGestureMode = !isGestureMode;
            await window.electronAPI.toggleGestureMode(isGestureMode);
            updateGestureUI();
        } catch (error) {
            console.error('Error toggling gesture mode:', error);
        }
    });
    
    // Manual screenshot button
    screenshotBtn.addEventListener('click', async () => {
        try {
            await window.electronAPI.captureScreenshot();
        } catch (error) {
            console.error('Error capturing screenshot:', error);
        }
    });
    
    // Listen for screenshot events from main process
    window.electronAPI.onScreenshotCaptured((event, data) => {
        addScreenshotToUI(data);
    });
    
    // Listen for gesture mode changes from main process
    window.electronAPI.onGestureModeChanged((event, enabled) => {
        isGestureMode = enabled;
        updateGestureUI();
    });
    
    // Listen for accessibility permission requests
    window.electronAPI.onAccessibilityPermissionNeeded(() => {
        showAccessibilityAlert();
    });
    
    // Set up gesture detection
    setupGestureDetection();
}

// Gesture detection using mouse/trackpad movements
function setupGestureDetection() {
    let gesturePoints = [];
    let lastCheckTime = 0;
    let lastPos = null;
    let lastDetectionTime = 0;
    const movementThreshold = 5;
    const detectionCooldown = 2000; // 2 second cooldown between detections
    
    // Track all mouse movements for gesture detection (no clicking required)
    document.addEventListener('mousemove', (e) => {
        if (!isGestureMode) return;
        
        const now = Date.now();
        const currentPos = { x: e.clientX, y: e.clientY };
        
        // Throttle and check for significant movement
        if (now - lastCheckTime > 50 && // 50ms throttle
            (lastPos === null || 
             Math.abs(currentPos.x - lastPos.x) > movementThreshold ||
             Math.abs(currentPos.y - lastPos.y) > movementThreshold)) {
            
            gesturePoints.push({ x: currentPos.x, y: currentPos.y, timestamp: now });
            lastPos = currentPos;
            lastCheckTime = now;
            
            // Keep only recent points (last 3 seconds)
            gesturePoints = gesturePoints.filter(point => now - point.timestamp < 3000);
            
            // Check for circular gesture continuously (increased threshold)
            if (gesturePoints.length > 30 && 
                now - lastDetectionTime > detectionCooldown && 
                detectCircularGesture(gesturePoints)) {
                console.log('Natural circular gesture detected!');
                window.electronAPI.gestureDetected();
                gesturePoints = []; // Clear to avoid repeated triggers
                lastDetectionTime = now; // Set cooldown
            }
        }
    });
    
    // Also detect trackpad gestures (for macOS)
    let touchPoints = [];
    
    document.addEventListener('touchstart', (e) => {
        if (!isGestureMode) return;
        
        touchPoints = [];
        for (let touch of e.touches) {
            touchPoints.push({ x: touch.clientX, y: touch.clientY, timestamp: Date.now() });
        }
    });
    
    document.addEventListener('touchmove', (e) => {
        if (!isGestureMode) return;
        
        for (let touch of e.touches) {
            touchPoints.push({ x: touch.clientX, y: touch.clientY, timestamp: Date.now() });
        }
        
        // Keep only recent points
        const now = Date.now();
        touchPoints = touchPoints.filter(point => now - point.timestamp < 2000);
    });
    
    document.addEventListener('touchend', (e) => {
        if (!isGestureMode) return;
        
        if (touchPoints.length > 15 && detectCircularGesture(touchPoints)) {
            console.log('Circular touch gesture detected!');
            window.electronAPI.gestureDetected();
            touchPoints = [];
        }
    });
}

// Detect circular gesture pattern
function detectCircularGesture(points) {
    if (points.length < 25) return false; // Increased minimum points
    
    // Get recent points
    const recentPoints = points.slice(-30);
    
    // Calculate center point
    const centerX = recentPoints.reduce((sum, p) => sum + p.x, 0) / recentPoints.length;
    const centerY = recentPoints.reduce((sum, p) => sum + p.y, 0) / recentPoints.length;
    
    // Calculate minimum radius requirement
    const distances = recentPoints.map(point => {
        return Math.sqrt(Math.pow(point.x - centerX, 2) + Math.pow(point.y - centerY, 2));
    });
    const avgRadius = distances.reduce((sum, d) => sum + d, 0) / distances.length;
    
    // Require minimum radius of 50 pixels to prevent accidental detection
    if (avgRadius < 50) return false;
    
    // Calculate angles from center
    const angles = recentPoints.map(point => {
        return Math.atan2(point.y - centerY, point.x - centerX);
    });
    
    // Check if angles cover a significant circular range
    let totalAngleChange = 0;
    for (let i = 1; i < angles.length; i++) {
        let angleDiff = angles[i] - angles[i-1];
        
        // Normalize angle difference
        if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
        
        totalAngleChange += Math.abs(angleDiff);
    }
    
    // Require at least 80% of a full circle for more reliable detection
    return totalAngleChange > Math.PI * 1.6;
}

// Update gesture status from main process
async function updateGestureStatus() {
    try {
        isGestureMode = await window.electronAPI.getGestureStatus();
        updateGestureUI();
    } catch (error) {
        console.error('Error getting gesture status:', error);
    }
}

// Update gesture UI elements
function updateGestureUI() {
    const gestureToggle = document.getElementById('gesture-toggle');
    const gestureStatus = document.getElementById('gesture-status');
    const statusDot = document.getElementById('status-dot');
    
    if (isGestureMode) {
        gestureToggle.textContent = 'Disable Gestures';
        gestureToggle.classList.add('active');
        gestureStatus.textContent = 'Gesture Mode Enabled';
        statusDot.classList.add('active');
    } else {
        gestureToggle.textContent = 'Enable Gestures';
        gestureToggle.classList.remove('active');
        gestureStatus.textContent = 'Gesture Mode Disabled';
        statusDot.classList.remove('active');
    }
}

// Add screenshot to UI
function addScreenshotToUI(data) {
    const container = document.getElementById('screenshots-container');
    const emptyState = container.querySelector('.empty-state');
    const screenshotCount = document.querySelector('.screenshot-count');
    
    // Remove empty state if it exists
    if (emptyState) {
        emptyState.remove();
    }
    
    // Create screenshot element
    const screenshotDiv = document.createElement('div');
    screenshotDiv.className = 'screenshot-item';
    
    const img = document.createElement('img');
    img.src = `file://${data.filePath}`;
    img.alt = `Screenshot ${data.filename}`;
    img.style.cursor = 'pointer';
    img.onclick = () => openScreenshotViewer(data);
    
    const info = document.createElement('div');
    info.className = 'screenshot-info';
    info.innerHTML = `
        <h4>${data.filename}</h4>
        <p>${new Date(data.timestamp).toLocaleString()}</p>
        <div class="screenshot-actions">
            <button onclick="openScreenshotViewer(${JSON.stringify(data).replace(/"/g, '&quot;')})" class="view-btn">View Full Size</button>
            <button onclick="analyzeScreenshot('${data.filename}')" class="analyze-btn">Analyze Context</button>
        </div>
    `;
    
    screenshotDiv.appendChild(img);
    screenshotDiv.appendChild(info);
    
    // Add to beginning of container
    container.insertBefore(screenshotDiv, container.firstChild);
    
    // Keep only last 5 screenshots in UI
    const screenshotItems = container.querySelectorAll('.screenshot-item');
    if (screenshotItems.length > 5) {
        screenshotItems[screenshotItems.length - 1].remove();
    }
    
    // Store screenshot data
    screenshots.unshift(data);
    if (screenshots.length > 5) {
        screenshots.pop();
    }
    
    // Update screenshot count
    if (screenshotCount) {
        const count = container.querySelectorAll('.screenshot-item').length;
        screenshotCount.textContent = `${count} captured`;
    }
}

// Open screenshot viewer modal
function openScreenshotViewer(data) {
    // Create modal overlay
    const modal = document.createElement('div');
    modal.className = 'screenshot-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>${data.filename}</h3>
                <span class="close-modal">&times;</span>
            </div>
            <div class="modal-body">
                <img src="file://${data.filePath}" alt="${data.filename}" class="full-screenshot">
                <div class="screenshot-details">
                    <p><strong>Captured:</strong> ${new Date(data.timestamp).toLocaleString()}</p>
                    <p><strong>Location:</strong> ${data.filePath}</p>
                </div>
            </div>
            <div class="modal-footer">
                <button onclick="openScreenshotFolder('${data.filePath}')" class="download-btn">Open Folder</button>
                <button onclick="copyScreenshotPath('${data.filePath}')" class="copy-btn">Copy Path</button>
                <button onclick="analyzeScreenshot('${data.filename}')" class="analyze-btn">Analyze Context</button>
            </div>
        </div>
    `;
    
    // Add modal to body
    document.body.appendChild(modal);
    
    // Close modal handlers
    const closeBtn = modal.querySelector('.close-modal');
    closeBtn.onclick = () => modal.remove();
    
    modal.onclick = (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    };
    
    // ESC key to close
    const handleEsc = (e) => {
        if (e.key === 'Escape') {
            modal.remove();
            document.removeEventListener('keydown', handleEsc);
        }
    };
    document.addEventListener('keydown', handleEsc);
}

// Open screenshot folder
function openScreenshotFolder(filePath) {
    window.electronAPI.openScreenshotFolder(filePath);
}

// Copy screenshot path to clipboard
async function copyScreenshotPath(filePath) {
    try {
        await navigator.clipboard.writeText(filePath);
        
        // Show feedback
        const btn = event.target;
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        btn.style.backgroundColor = '#10b981';
        setTimeout(() => {
            btn.textContent = originalText;
            btn.style.backgroundColor = '';
        }, 2000);
    } catch (error) {
        console.error('Failed to copy path to clipboard:', error);
        alert('Failed to copy path to clipboard.');
    }
}

// Analyze screenshot context (placeholder for future AI integration)
function analyzeScreenshot(filename) {
    alert(`Context analysis for ${filename} would be implemented here. This could integrate with AI services to analyze the screenshot content.`);
}

// Show accessibility permission alert
function showAccessibilityAlert() {
    const alertDiv = document.createElement('div');
    alertDiv.className = 'accessibility-alert';
    alertDiv.innerHTML = `
        <div class="alert-content">
            <h3>⚠️ Accessibility Permission Required</h3>
            <p>To enable global gesture detection across your entire screen, please:</p>
            <ol>
                <li>Open <strong>System Preferences</strong></li>
                <li>Go to <strong>Security & Privacy</strong></li>
                <li>Click <strong>Privacy</strong> tab</li>
                <li>Select <strong>Accessibility</strong> from the list</li>
                <li>Click the lock icon and enter your password</li>
                <li>Add this Electron app to the list</li>
            </ol>
            <p>Once enabled, you can draw circular gestures anywhere on your screen!</p>
            <button onclick="this.parentElement.parentElement.remove()">Got it!</button>
        </div>
    `;
    
    document.body.appendChild(alertDiv);
}


function addInteractiveEffects() {
    // Add click animation to buttons
    const buttons = document.querySelectorAll('button');
    buttons.forEach(button => {
        button.addEventListener('click', () => {
            button.style.transform = 'scale(0.95)';
            setTimeout(() => {
                button.style.transform = 'scale(1)';
            }, 100);
        });
    });
    
    // Add hover effects to cards
    const cards = document.querySelectorAll('.gesture-status-card, .instructions-card, .screenshot-item');
    cards.forEach(card => {
        card.addEventListener('mouseenter', () => {
            if (!card.classList.contains('screenshot-item')) {
                card.style.transform = 'translateY(-1px)';
            }
        });
        
        card.addEventListener('mouseleave', () => {
            if (!card.classList.contains('screenshot-item')) {
                card.style.transform = 'translateY(0)';
            }
        });
    });
}

// Cleanup event listeners when page unloads
window.addEventListener('beforeunload', () => {
    window.electronAPI.removeAllListeners('screenshot-captured');
    window.electronAPI.removeAllListeners('gesture-mode-changed');
});
