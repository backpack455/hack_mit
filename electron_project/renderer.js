// This file runs in the renderer process and handles the UI interactions

let isGestureMode = false;
let screenshots = [];
let currentMode = 'study';

// Lightweight "DB" stub for demo sessions
let sessions = [];

document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  setupGestureControls();
  await updateGestureStatus();
  const initialMode = await window.electronAPI.getMode();
  setModeUI(initialMode);
  window.electronAPI.onModeChanged((event, mode) => setModeUI(mode));

  // --- NEW: Initial load for session view
  await refreshSessionsUI();

  // React to mode changes from tray or elsewhere
  window.electronAPI.onModeChanged(async (newMode) => {
    await refreshSessionsUI();
  });

  // React to session updates and new screenshots
  window.electronAPI.onSessionUpdated(async (_data) => {
    await refreshSessionsUI();
  });
  window.electronAPI.onScreenshotCaptured(async (_evt, _payload) => {
    await refreshSessionsUI();
  });

  // Optional (hide mode cards): if your HTML still renders the Study/Work selection cards on the home page
  const modeCards = document.querySelector('.mode-selection');
  if (modeCards) modeCards.style.display = 'none';
});

function setupNavigation() {
  const modeRadios = document.querySelectorAll('.mode-switch input[name="mode-toggle"]');
  modeRadios.forEach(radio => {
    radio.addEventListener('change', async () => {
      const mode = radio.value;
      await window.electronAPI.setMode(mode);
      // UI update happens via onModeChanged
    });
  });

  document.getElementById('logo-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    setModeUI(currentMode);
    // Optionally collapse other sections or modals
  });
}

function setModeUI(mode) {
  currentMode = mode;

  // highlight radio buttons
  document.querySelectorAll('.mode-switch input[name="mode-toggle"]').forEach(r => {
    r.checked = r.value === mode;
  });

  // render sessions for this mode
  renderSessions();
}

async function refreshSessionsUI() {
  try {
    const mode = await window.electronAPI.getMode();
    const sessions = await window.electronAPI.getSessions(mode);
    renderSessionList(sessions, mode);
  } catch (e) {
    console.error('Failed to refresh sessions:', e);
  }
}

// Minimal card renderer (screenshots only for now)
function renderSessionList(sessions, mode) {
  const container = document.getElementById('session-container') || document.getElementById('work-session-container') || document.getElementById('sessions-root');
  if (!container) return;

  container.innerHTML = '';

  if (!sessions || sessions.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `
      <div class="icon empty-icon target-icon"></div>
      <h3>No ${mode} sessions yet</h3>
      <p>Capture a screenshot or start recording to build your knowledge base</p>
    `;
    container.appendChild(empty);
    return;
  }

  sessions.forEach((s) => {
    const card = document.createElement('div');
    card.className = 'screenshot-item';
    const latestShot = (s.artifacts || []).find(a => a.kind === 'screenshot');

    card.innerHTML = `
      <div class="screenshot-info" style="padding-bottom:0.5rem">
        <h4>${s.title}</h4>
        <p>${new Date(s.updated_at).toLocaleString()}</p>
      </div>
      ${latestShot ? `<img src="file://${latestShot.path}" alt="${latestShot.meta_json?.filename || 'screenshot'}" />` : ''}
      <div class="screenshot-info">
        <div class="screenshot-actions">
          <button class="view-btn" data-session="${s.id}">View</button>
          <button class="analyze-btn" data-action="deck" data-session="${s.id}">Convert to Deck</button>
          <button class="analyze-btn" data-action="visual" data-session="${s.id}">Generate Visual</button>
          <button class="analyze-btn" data-action="ask" data-session="${s.id}">Ask AI</button>
        </div>
      </div>
    `;
    container.appendChild(card);
  });

  // Hook up buttons (stubs)
  container.querySelectorAll('button[data-action]').forEach(btn => {
    btn.onclick = () => {
      const action = btn.dataset.action;
      const sessionId = btn.dataset.session;
      alert(`[stub] ${action} → session ${sessionId}`);
    };
  });

  container.querySelectorAll('button.view-btn').forEach(btn => {
    btn.onclick = () => {
      const sessionId = btn.dataset.session;
      openSessionViewer(sessionId);
    };
  });
}

async function openSessionViewer(sessionId) {
  const artifacts = await window.electronAPI.getArtifacts(sessionId);
  // Minimal modal or console for now
  console.log('Artifacts for', sessionId, artifacts);
  alert(`Session ${sessionId} has ${artifacts.length} artifact(s). (Viewer TBD)`);
}

// Load sessions from the overlay service
async function loadSessions() {
  try {
    const loadedSessions = await window.electronAPI.getSessions();
    sessions = loadedSessions || [];
    console.log('Loaded sessions:', sessions.length);
  } catch (error) {
    console.error('Error loading sessions:', error);
    sessions = [];
  }
}

function renderSessions() {
  const container = document.getElementById('session-container');
  if (!container) return;

  // Filter sessions by current mode
  const filteredSessions = sessions.filter(session => session.mode === currentMode);

  // Sort sessions by creation date (newest first)
  filteredSessions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  // Clear container
  container.innerHTML = '';

  if (filteredSessions.length === 0) {
    // Show empty state with mode-specific message
    const modeDescriptions = {
      'study': 'academic lectures, notes, and learning materials',
      'work': 'meetings, presentations, and work-related content',
      'research': 'research papers, investigations, and analytical content'
    };

    container.innerHTML = `
      <div class="empty-state">
        <div class="icon empty-icon target-icon"></div>
        <h3>No ${currentMode} sessions yet</h3>
        <p>Sessions for ${modeDescriptions[currentMode] || currentMode + ' content'} will appear here when created.</p>
        <div class="mode-stats">
          <small>Total sessions across all modes: ${sessions.length}</small>
        </div>
      </div>`;
    return;
  }

  // Add mode summary header
  const summaryDiv = document.createElement('div');
  summaryDiv.className = 'mode-summary';
  summaryDiv.innerHTML = `
    <div class="summary-stats">
      <span class="session-count">${filteredSessions.length} ${currentMode} session${filteredSessions.length === 1 ? '' : 's'}</span>
      <span class="last-updated">Last updated: ${new Date(filteredSessions[0].created_at).toLocaleDateString()}</span>
    </div>
  `;
  container.appendChild(summaryDiv);

  // Render session cards
  filteredSessions.forEach(session => {
    const sessionCard = createSessionCard(session);
    container.appendChild(sessionCard);
  });
}

function createSessionCard(session) {
  const card = document.createElement('div');
  card.className = 'session-item';
  card.dataset.mode = session.mode;

  // Find screenshot and transcript artifacts
  const screenshot = session.artifacts.find(a => a.kind === 'screenshot');
  const transcript = session.artifacts.find(a => a.kind === 'transcript');

  // Create preview content
  let previewContent = '';
  if (screenshot) {
    // Handle both file paths and data URLs
    const imageSrc = screenshot.dataURL || `file://${screenshot.path}`;
    previewContent = `<div class="session-preview"><img src="${imageSrc}" alt="Session preview" onerror="this.style.display='none'" /></div>`;
  } else if (transcript) {
    previewContent = `<div class="session-preview-text">Transcript preview: Lorem ipsum dolor sit amet, consectetur adipiscing elit...</div>`;
  }

  card.innerHTML = `
    <h3>${session.title}</h3>
    <div class="session-meta">
      ${new Date(session.created_at).toLocaleDateString()} • ${session.artifacts.length} item${session.artifacts.length === 1 ? '' : 's'}
    </div>
    ${previewContent}
    <div class="session-actions">
      <button class="session-action-btn" onclick="viewSessionDetails('${session.id}')">View Screenshots</button>
      <button class="session-action-btn" onclick="convertToSlideDeck('${session.id}')">Convert to Slide Deck</button>
      <button class="session-action-btn" onclick="generateVisual('${session.id}')">Generate Visual</button>
      <button class="session-action-btn" onclick="requestAIClarification('${session.id}')">Request AI Clarification</button>
    </div>
  `;

  return card;
}

// View session details with screenshots
async function viewSessionDetails(sessionId) {
  try {
    const sessionDetails = await window.electronAPI.getSessionDetails(sessionId);
    if (!sessionDetails) {
      alert('Session details not found.');
      return;
    }
    
    showSessionModal(sessionDetails);
  } catch (error) {
    console.error('Error loading session details:', error);
    alert('Failed to load session details.');
  }
}

// Show session details modal
function showSessionModal(sessionDetails) {
  const modal = document.createElement('div');
  modal.className = 'session-modal';
  
  const screenshotsHtml = sessionDetails.screenshots.map((screenshot, index) => {
    const imageSrc = screenshot.dataURL || `file://${screenshot.imagePath || screenshot.path}`;
    return `
      <div class="session-screenshot-item">
        <img src="${imageSrc}" alt="Screenshot ${index + 1}" onerror="this.style.display='none'" />
        <div class="screenshot-info">
          <p><strong>Captured:</strong> ${new Date(screenshot.timestamp).toLocaleString()}</p>
          ${screenshot.processingResult ? `
            <p><strong>AI Description:</strong> ${screenshot.processingResult.visualDescription.description || 'N/A'}</p>
            <p><strong>URLs Found:</strong> ${screenshot.processingResult.urls.found.length}</p>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
  
  modal.innerHTML = `
    <div class="modal-content session-modal-content">
      <div class="modal-header">
        <h3>Session Details</h3>
        <span class="close-modal">&times;</span>
      </div>
      <div class="modal-body">
        <div class="session-screenshots">
          <h4>Screenshots (${sessionDetails.screenshots.length})</h4>
          <div class="screenshots-grid">
            ${screenshotsHtml}
          </div>
        </div>
        ${sessionDetails.contextFiles && sessionDetails.contextFiles.length > 0 ? `
          <div class="session-context">
            <h4>Context Files</h4>
            <ul>
              ${sessionDetails.contextFiles.map(file => `<li>${file}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
      </div>
    </div>
  `;
  
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

// Placeholder functions for session actions
function convertToSlideDeck(sessionId) {
  console.log('Convert to slide deck:', sessionId);
  alert('Convert to Slide Deck functionality will be implemented here.');
}

function generateVisual(sessionId) {
  console.log('Generate visual:', sessionId);
  alert('Generate Visual functionality will be implemented here.');
}

function requestAIClarification(sessionId) {
  console.log('Request AI clarification:', sessionId);
  alert('Request AI Clarification functionality will be implemented here.');
}

// Page Navigation Setup
function setupPageNavigation() {
    const pages = document.querySelectorAll('.page');
    const homeButtons = document.querySelectorAll('#home-btn, #home-btn-work');
    const profileButtons = document.querySelectorAll('#profile-btn-home, #profile-btn, #profile-btn-work');
    
    // Home button navigation
    homeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            showPage('home-page');
        });
    });
    
    // Profile button placeholder (can add profile functionality later)
    profileButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            console.log('Profile clicked - functionality to be implemented');
        });
    });
    
    function showPage(pageId) {
        pages.forEach(page => {
            page.classList.remove('active');
        });
        document.getElementById(pageId).classList.add('active');
    }
}

// Setup gesture control functionality
function setupGestureControls() {
    const gestureToggle = document.getElementById('gesture-toggle');
    
    // Setup all screenshot buttons
    const screenshotButtons = [
        document.getElementById('work-screenshot')
    ].filter(btn => btn !== null); // Filter out null elements
    
    // Gesture toggle button - only set up if element exists
    if (gestureToggle) {
        gestureToggle.addEventListener('click', async () => {
            try {
                isGestureMode = !isGestureMode;
                await window.electronAPI.toggleGestureMode(isGestureMode);
                updateGestureUI();
            } catch (error) {
                console.error('Error toggling gesture mode:', error);
            }
        });
    } else {
        console.log('Gesture toggle button not found in current page - this is normal for home page');
    }
    
    // Manual screenshot buttons
    screenshotButtons.forEach(screenshotBtn => {
        screenshotBtn.addEventListener('click', async () => {
            try {
                await window.electronAPI.captureScreenshot();
            } catch (error) {
                console.error('Error capturing screenshot:', error);
            }
        });
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
    
    // Add null checks to prevent errors
    if (gestureToggle) {
        if (isGestureMode) {
            gestureToggle.textContent = 'Disable Gestures';
            gestureToggle.classList.add('active');
        } else {
            gestureToggle.textContent = 'Enable Gestures';
            gestureToggle.classList.remove('active');
        }
    }
    
    if (gestureStatus) {
        if (isGestureMode) {
            gestureStatus.textContent = 'Gesture Mode Enabled';
        } else {
            gestureStatus.textContent = 'Gesture Mode Disabled';
        }
    }
    
    if (statusDot) {
        if (isGestureMode) {
            statusDot.classList.add('active');
        } else {
            statusDot.classList.remove('active');
        }
    }
}

// Helper function to build proper file:// URLs
function buildFileURL(filePath) {
    try {
        // Prefer proper URL creation (handles spaces, unicode)
        return require('url').pathToFileURL(filePath).toString();
    } catch {
        // Fallback
        return `file://${encodeURI(filePath)}`;
    }
}

// Add screenshot to UI
function addScreenshotToUI(data) {
    const containers = [
        document.getElementById('screenshots-container'),
        document.getElementById('session-container'),
        document.getElementById('work-session-container')
    ].filter(Boolean);

    if (containers.length === 0) {
        console.warn('No screenshots container found in DOM');
        return;
    }

    const cardHTML = (data) => `
        <div class="screenshot-item">
            <img src="${data.src}" alt="Screenshot ${data.filename}" class="thumb" style="cursor:pointer">
            <div class="screenshot-info">
                <h4>${data.filename}</h4>
                <p>${new Date(data.timestamp).toLocaleString()}</p>
                <div class="screenshot-actions">
                    <button class="view-btn">View Full Size</button>
                    <button class="analyze-btn">Analyze Context</button>
                </div>
            </div>
        </div>`;

    // Build a safe file:// URL (handles spaces, etc.)
    const src = buildFileURL(data.filePath);

    containers.forEach(container => {
        // Remove empty state
        const empty = container.querySelector('.empty-state');
        if (empty) empty.remove();

        // Prepend card
        const wrapper = document.createElement('div');
        wrapper.innerHTML = cardHTML({ ...data, src });
        const card = wrapper.firstElementChild;

        // Wire buttons
        card.querySelector('.thumb').onclick = () => openScreenshotViewer({ ...data, filePath: data.filePath });
        card.querySelector('.view-btn').onclick = () => openScreenshotViewer({ ...data, filePath: data.filePath });
        card.querySelector('.analyze-btn').onclick = () => analyzeScreenshot(data.filename);

        container.insertBefore(card, container.firstChild);

        // Keep last 5
        const items = container.querySelectorAll('.screenshot-item');
        if (items.length > 5) items[items.length - 1].remove();

        // Update any "X captured" counters in that section
        const countEl = container.closest('.session-section')?.querySelector('.screenshot-count');
        if (countEl) countEl.textContent = `${container.querySelectorAll('.screenshot-item').length} captured`;
    });
    
    // Store screenshot data
    screenshots.unshift(data);
    if (screenshots.length > 5) {
        screenshots.pop();
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
                <img src="${buildFileURL(data.filePath)}" alt="${data.filename}" class="full-screenshot">
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
            <h3>Accessibility Permission Required</h3>
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
