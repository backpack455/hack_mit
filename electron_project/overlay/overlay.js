// VIPR Overlay JavaScript
const { ipcRenderer } = require('electron');

class OverlayUI {
    constructor() {
        this.indicator = null;
        this.panel = null;
        this.actionsContainer = null;
        this.closeBtn = null;
        this.overlayContainer = null;
        this.isExpanded = false;
        this.hoverTimeout = null;
        this.actions = [];
        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartLeft = 0;
        this.currentPosition = 'bottom-right';
        this.isVisible = true;
        this.isProcessing = false; // Track if we're processing gestures/screenshots

        this.init();
        this.setupKeyboardListeners();
    }

    init() {
        // Get DOM elements
        this.indicator = document.getElementById('vipr-indicator');
        this.panel = document.getElementById('vipr-panel');
        this.actionsContainer = document.getElementById('actions-container');
        this.closeBtn = document.getElementById('close-btn');
        this.overlayContainer = document.querySelector('.overlay-container');
        
        // Show indicator immediately - this is critical for visibility on app load
        this.indicator.style.display = 'flex';
        this.indicator.style.opacity = '1';
        this.indicator.style.visibility = 'visible';
        this.indicator.style.zIndex = '999999';
        this.indicator.style.position = 'relative';
        
        // Set initial position class
        this.updatePositionClass();
        this.screenshotGallery = document.getElementById('screenshot-gallery');
        this.screenshotScroll = document.getElementById('screenshot-scroll');
        this.screenshotCount = document.getElementById('screenshot-count');

        // Set up event listeners
        this.setupEventListeners();
        
        // Set up drag functionality
        this.setupDragFunctionality();
        
        // Set up live update listeners
        this.setupLiveUpdateListeners();
        
        // Listen for IPC messages
        this.setupIPCListeners();

        // Check for initial context and show appropriate message
        this.checkInitialContext();
        
        // Request current position from main process (non-blocking)
        ipcRenderer.invoke('request-position')
            .then((pos) => {
                if (pos) {
                    this.currentPosition = pos;
                    this.updatePositionClass();
                }
            })
            .catch((err) => {
                console.warn('⚠️ Failed to get async position, using default:', err);
                this.updatePositionClass();
            });
        
        console.log('✅ Overlay UI initialized');
    }

    /**
     * Update position class on the overlay container
     */
    updatePositionClass() {
        // Remove all position classes
        this.overlayContainer.classList.remove(
            'position-top-left',
            'position-top-right',
            'position-bottom-left',
            'position-bottom-right'
        );

        // Add current position class
        this.overlayContainer.classList.add(`position-${this.currentPosition}`);

        // Update position display text
        this.updatePositionDisplay();
    }

    /**
     * Update the position display text
     */
    updatePositionDisplay() {
        const positionDisplay = document.getElementById('position-display');
        if (positionDisplay) {
            const positionNames = {
                'top-left': 'Top Left',
                'top-right': 'Top Right',
                'bottom-left': 'Bottom Left',
                'bottom-right': 'Bottom Right'
            };

            positionDisplay.textContent = positionNames[this.currentPosition] || 'Unknown';
        }
    }
    
    /**
     * Setup keyboard event listeners
     */
    setupKeyboardListeners() {
        // Handle keyboard events for navigation
        document.addEventListener('keydown', (e) => {
            this.handleKeyDown(e);
        });
    }
    
    handleKeyDown(e) {
        if (!this.isExpanded) return;

        const key = e.key.toLowerCase();
        const isArrowKey = key.startsWith('arrow');

        // Only handle arrow keys with cmd+shift
        if (!e.metaKey || !e.shiftKey || !isArrowKey) return;

        e.preventDefault();
        e.stopPropagation();

        let newPosition = null;

        // Apply movement rules based on current position and key press
        switch(key) {
            case 'arrowup':
                if (this.currentPosition === 'bottom-left') {
                    newPosition = 'top-left';      // Bottom-left → Top-left
                } else if (this.currentPosition === 'bottom-right') {
                    newPosition = 'top-right';     // Bottom-right → Top-right
                }
                // Top positions: up does nothing
                break;

            case 'arrowdown':
                if (this.currentPosition === 'top-left') {
                    newPosition = 'bottom-left';   // Top-left → Bottom-left
                } else if (this.currentPosition === 'top-right') {
                    newPosition = 'bottom-right';  // Top-right → Bottom-right
                }
                // Bottom positions: down does nothing
                break;

            case 'arrowleft':
                if (this.currentPosition === 'top-right') {
                    newPosition = 'top-left';      // Top-right → Top-left
                } else if (this.currentPosition === 'bottom-right') {
                    newPosition = 'bottom-left';   // Bottom-right → Bottom-left
                }
                // Left positions: left does nothing
                break;

            case 'arrowright':
                if (this.currentPosition === 'top-left') {
                    newPosition = 'top-right';     // Top-left → Top-right
                } else if (this.currentPosition === 'bottom-left') {
                    newPosition = 'bottom-right';  // Bottom-left → Bottom-right
                }
                // Right positions: right does nothing
                break;
        }

        // Update position if a valid move was made
        if (newPosition) {
            this.currentPosition = newPosition;
            this.updatePositionClass();
            // Send to main process to actually move the window
            ipcRenderer.send('move-overlay-to-position', newPosition);
        }
    }
    
    setupEventListeners() {
        // Prevent clicks from propagating to underlying content
        this.overlayContainer.addEventListener('click', (e) => {
            e.stopPropagation();
        });
        
        // Prevent default drag behavior
        this.overlayContainer.addEventListener('dragstart', (e) => {
            e.preventDefault();
            return false;
        });
        
        // Toggle panel on indicator click (handled in mouseup for drag compatibility)

        // Panel hover events
        this.panel.addEventListener('mouseenter', () => {
            clearTimeout(this.hoverTimeout);
            this.expandPanel();
        });

        // When the cursor leaves the expanded panel, collapse it shortly after
        this.panel.addEventListener('mouseleave', () => {
            clearTimeout(this.hoverTimeout);
            this.hoverTimeout = setTimeout(() => {
                if (this.isExpanded) {
                    this.collapsePanel(); // this will re-show the eye via CSS class removal
                }
            }, 250);
        });

        // If the user hovers the eye while a collapse is pending, keep it visible
        this.indicator.addEventListener('mouseenter', () => {
            clearTimeout(this.hoverTimeout);
        });

        // Close button
        this.closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.dismissOverlay();
        });

        // Keyboard events
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.dismissOverlay();
            }
        });

        // Click outside to dismiss - but only on the actual overlay elements
        document.addEventListener('click', (e) => {
            // Don't dismiss if currently processing
            if (this.isProcessing) {
                return;
            }

            // Don't dismiss if loading state is visible
            const loadingState = document.getElementById('loading-state');
            if (loadingState && loadingState.style.display !== 'none') {
                return;
            }

            // Only dismiss if clicking outside both the panel AND indicator
            // AND not clicking on the transparent overlay container itself
            const clickedOnOverlay = this.overlayContainer.contains(e.target);
            const clickedOnIndicator = this.indicator.contains(e.target);
            const clickedOnPanel = this.panel.contains(e.target);

            // Only dismiss if we clicked somewhere that's not the indicator or panel
            // but don't dismiss on transparent areas of the overlay container
            if (!clickedOnIndicator && !clickedOnPanel && !clickedOnOverlay) {
                this.dismissOverlay();
            }
        });
    }

    setupDragFunctionality() {
        let startX, startY, startLeft, startTop;

        // Mouse events for dragging
        this.indicator.addEventListener('mousedown', (e) => {
            if (this.isExpanded) return; // Don't drag when expanded

            // Add a small delay to distinguish between click and drag
            this.dragStartTime = Date.now();
            this.dragStarted = false;

            startX = e.clientX;
            startY = e.clientY;

            // Get current computed position
            const rect = this.overlayContainer.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;

            e.preventDefault();
            e.stopPropagation();
        });

        document.addEventListener('mousemove', (e) => {
            // Only start dragging if mouse has moved enough and enough time has passed
            if (this.dragStartTime && !this.dragStarted) {
                const deltaX = Math.abs(e.clientX - startX);
                const deltaY = Math.abs(e.clientY - startY);
                const timeElapsed = Date.now() - this.dragStartTime;

                // Require both mouse movement and time threshold to start drag
                if ((deltaX > 5 || deltaY > 5) && timeElapsed > 100) {
                    this.isDragging = true;
                    this.dragStarted = true;
                    this.overlayContainer.classList.add('dragging');
                }
                return;
            }

            if (!this.isDragging) return;

            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;

            const newLeft = startLeft + deltaX;
            const newTop = startTop + deltaY;

            // Constrain to screen bounds
            const minLeft = 20;
            const minTop = 20;
            const maxLeft = window.innerWidth - this.overlayContainer.offsetWidth - 20;
            const maxTop = window.innerHeight - this.overlayContainer.offsetHeight - 20;

            const constrainedLeft = Math.max(minLeft, Math.min(maxLeft, newLeft));
            const constrainedTop = Math.max(minTop, Math.min(maxTop, newTop));

            // Set absolute positioning
            this.overlayContainer.style.position = 'fixed';
            this.overlayContainer.style.left = constrainedLeft + 'px';
            this.overlayContainer.style.top = constrainedTop + 'px';
            this.overlayContainer.style.right = 'auto';
            this.overlayContainer.style.bottom = 'auto';

            e.preventDefault();
        });

        document.addEventListener('mouseup', () => {
            // Check if this was a drag or just a click
            const wasDragging = this.isDragging;
            const timeElapsed = this.dragStartTime ? Date.now() - this.dragStartTime : 0;

            // Reset drag state
            this.isDragging = false;
            this.dragStarted = false;
            this.dragStartTime = null;
            this.overlayContainer.classList.remove('dragging');

            if (wasDragging) {
                // Optional: Snap to nearest corner after drag
                this.snapToNearestCorner();
            } else if (timeElapsed < 300) {
                // This was a quick click, toggle the panel
                this.togglePanel();
            }
        });

        // Touch events for mobile support
        this.indicator.addEventListener('touchstart', (e) => {
            if (this.isExpanded) return;

            this.isDragging = true;
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;

            const rect = this.overlayContainer.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;

            this.overlayContainer.classList.add('dragging');
            e.preventDefault();
        });

        document.addEventListener('touchmove', (e) => {
            if (!this.isDragging) return;

            const deltaX = e.touches[0].clientX - startX;
            const deltaY = e.touches[0].clientY - startY;

            const newLeft = startLeft + deltaX;
            const newTop = startTop + deltaY;

            const minLeft = 20;
            const minTop = 20;
            const maxLeft = window.innerWidth - this.overlayContainer.offsetWidth - 20;
            const maxTop = window.innerHeight - this.overlayContainer.offsetHeight - 20;

            const constrainedLeft = Math.max(minLeft, Math.min(maxLeft, newLeft));
            const constrainedTop = Math.max(minTop, Math.min(maxTop, newTop));

            this.overlayContainer.style.position = 'fixed';
            this.overlayContainer.style.left = constrainedLeft + 'px';
            this.overlayContainer.style.top = constrainedTop + 'px';
            this.overlayContainer.style.right = 'auto';
            this.overlayContainer.style.bottom = 'auto';

            e.preventDefault();
        });

        document.addEventListener('touchend', () => {
            if (this.isDragging) {
                this.isDragging = false;
                this.overlayContainer.classList.remove('dragging');
                this.snapToNearestCorner();
            }
        });
    }

    // Optional: Snap to nearest corner after dragging
    snapToNearestCorner() {
        const rect = this.overlayContainer.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;

        // Determine which corner is closest
        const isLeft = centerX < screenWidth / 2;
        const isTop = centerY < screenHeight / 2;

        let newPosition;
        if (isTop && isLeft) {
            newPosition = 'top-left';
        } else if (isTop && !isLeft) {
            newPosition = 'top-right';
        } else if (!isTop && isLeft) {
            newPosition = 'bottom-left';
        } else {
            newPosition = 'bottom-right';
        }

        // Update current position and apply class
        this.currentPosition = newPosition;
        this.updatePositionClass();

        // Reset inline styles to let CSS classes take over
        this.overlayContainer.style.left = '';
        this.overlayContainer.style.top = '';
        this.overlayContainer.style.right = '';
        this.overlayContainer.style.bottom = '';

        // Notify main process of position change
        ipcRenderer.send('move-overlay-to-position', newPosition);
    }

    setupIPCListeners() {
        // Eye icon is always visible - removed hide functionality
        ipcRenderer.on('show-eye-icon', () => {
            this.indicator.style.display = 'flex';
            this.indicator.style.opacity = '1';
            this.indicator.style.visibility = 'visible';
        });
        
        // Removed hide-eye-icon handler - eye stays visible always
        
        // Listen for actions from main process
        ipcRenderer.on('show-actions', (_, actions) => {
            this.actions = actions;
            
            // Hide loading state and show actions
            this.hideLoadingState();
            this.renderActions();

            // Expand the panel when actions are received and keep it open
            if (!this.isExpanded) {
                this.togglePanel();
            }
        });
        
        // Listen for new screenshots being added
        ipcRenderer.on('screenshot-added', (_, screenshot) => {
            console.log('📸 New screenshot added to overlay:', screenshot.id);
            // Refresh the overlay content to show new screenshot
            this.checkScreenshotsBeforeLoading();
        });
        
        // Listen for position changes from main process
        ipcRenderer.on('position-changed', (_, { position }) => {
            this.currentPosition = position;
            this.updatePositionClass();
        });
        
        // Listen for overlay visibility changes
        ipcRenderer.on('overlay-hidden', () => {
            this.isVisible = false;
            this.overlayContainer.classList.add('hidden');
        });
    // Note: Button click handlers are attached per-button in createActionButton,
    // and they invoke 'execute-agentic-action' to ensure routing to Dedalus.
        
        // Handle close button
        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                // Don't close if processing
                const loadingState = document.getElementById('loading-state');
                if (loadingState && loadingState.style.display !== 'none') {
                    console.log('🚫 Cannot close overlay while processing');
                    return;
                }
                ipcRenderer.send('request-close');
            });
        }
    }

    showActions(actions) {
        this.actions = actions;
        this.renderActions();
        this.updateScreenshotGallery();
        
        // Show indicator initially
        this.indicator.style.display = 'flex';
        
        console.log('🎯 Actions received:', actions.length);
    }

    updateScreenshotGallery() {
        // Request screenshot data from main process
        ipcRenderer.invoke('get-screenshot-queue').then(screenshots => {
            this.renderScreenshots(screenshots);
        }).catch(error => {
            console.error('❌ Error getting screenshots:', error);
        });
    }

    renderScreenshots(screenshots) {
        // Clear existing screenshots
        this.screenshotScroll.innerHTML = '';
        
        // Update count
        this.screenshotCount.textContent = `${screenshots.length} screenshot${screenshots.length !== 1 ? 's' : ''}`;
        
        // Hide gallery if no screenshots
        if (screenshots.length === 0) {
            this.screenshotGallery.style.display = 'none';
            return;
        }
        
        this.screenshotGallery.style.display = 'block';
        
        // Create screenshot items
        screenshots.forEach((screenshot, index) => {
            const screenshotItem = this.createScreenshotItem(screenshot, index);
            this.screenshotScroll.appendChild(screenshotItem);
        });
        
        // Mark the most recent screenshot as active
        if (screenshots.length > 0) {
            const lastItem = this.screenshotScroll.lastElementChild;
            if (lastItem) {
                lastItem.classList.add('active');
            }
        }
    }

    createScreenshotItem(screenshot, index) {
        const item = document.createElement('div');
        item.className = 'screenshot-item';
        item.setAttribute('data-index', index);
        
        // Create image element
        const img = document.createElement('img');
        
        // Use dataURL if available, otherwise convert file path to file:// URL
        if (screenshot.dataURL) {
            img.src = screenshot.dataURL;
        } else if (screenshot.path) {
            // Convert absolute path to file:// URL for renderer process
            img.src = `file://${screenshot.path}`;
        } else {
            // Fallback placeholder
            img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIwIiBoZWlnaHQ9IjgwIiB2aWV3Qm94PSIwIDAgMTIwIDgwIiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIxMjAiIGhlaWdodD0iODAiIGZpbGw9IiMxRTIyMjUiLz48dGV4dCB4PSI2MCIgeT0iNDAiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZpbGw9IiNCNUJCQzQiIGZvbnQtc2l6ZT0iMTIiPk5vIEltYWdlPC90ZXh0Pjwvc3ZnPg==';
        }
        
        img.alt = `Screenshot ${index + 1}`;
        img.onerror = () => {
            console.log('Failed to load screenshot image, using placeholder');
            // Fallback to placeholder if image fails to load
            img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIwIiBoZWlnaHQ9IjgwIiB2aWV3Qm94PSIwIDAgMTIwIDgwIiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIxMjAiIGhlaWdodD0iODAiIGZpbGw9IiMxRTIyMjUiLz48dGV4dCB4PSI2MCIgeT0iNDAiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZpbGw9IiNCNUJCQzQiIGZvbnQtc2l6ZT0iMTIiPk5vIEltYWdlPC90ZXh0Pjwvc3ZnPg==';
        };
        
        // Create overlay with timestamp
        const overlay = document.createElement('div');
        overlay.className = 'screenshot-overlay';
        
        const timestamp = new Date(screenshot.timestamp || Date.now());
        const timeStr = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        overlay.innerHTML = `
            <div>Screenshot ${index + 1}</div>
            <div class="screenshot-timestamp">${timeStr}</div>
        `;
        
        item.appendChild(img);
        item.appendChild(overlay);
        
        // Add click handler
        item.addEventListener('click', () => {
            this.selectScreenshot(index);
        });
        
        return item;
    }

    selectScreenshot(index) {
        // Remove active class from all items
        const items = this.screenshotScroll.querySelectorAll('.screenshot-item');
        items.forEach(item => item.classList.remove('active'));
        
        // Add active class to selected item
        const selectedItem = this.screenshotScroll.querySelector(`[data-index="${index}"]`);
        if (selectedItem) {
            selectedItem.classList.add('active');
        }
        
        // Request actions for this screenshot
        ipcRenderer.invoke('get-actions-for-screenshot', index).then(actions => {
            if (actions) {
                this.actions = actions;
                this.renderActions();
            }
        }).catch(error => {
            console.error('❌ Error getting actions for screenshot:', error);
        });
    }

    renderActions() {
        console.log("Rendering actions:", this.actions);
        
        // Clear existing actions (but preserve loading state)
        const actionButtons = this.actionsContainer.querySelectorAll('.action-button');
        actionButtons.forEach(btn => btn.remove());

        if (!this.actions || this.actions.length === 0) {
            // Show empty state
            this.showEmptyState();
            return;
        }
        
        // Hide empty state and create action buttons
        this.hideEmptyState();
        this.hideLoadingState();
        
        // Create wrapper for better styling
        const actionButtonsContainer = document.createElement('div');
        actionButtonsContainer.className = 'action-buttons-container';
        
        // Create and append each action button
        this.actions.forEach((action) => {
            if (!action || !action.id) {
                console.error("Invalid action:", action);
                return;
            }
            const actionButton = this.createActionButton(action);
            this.actionsContainer.appendChild(actionButton);
        });
        
        console.log("Rendered action buttons:", actionButtons.length);
    }

    showLoadingState() {
        const loadingState = document.getElementById('loading-state');
        const emptyState = this.actionsContainer.querySelector('.empty-state');
        
        if (loadingState) {
            loadingState.style.display = 'flex';
        }
        if (emptyState) {
            emptyState.style.display = 'none';
        }
    }

    hideLoadingState() {
        const loadingState = document.getElementById('loading-state');
        if (loadingState) {
            loadingState.style.display = 'none';
        }
    }

    showEmptyState(message = "No current recommendations available.") {
        // Hide loading state first
        this.hideLoadingState();
        
        const emptyState = this.actionsContainer.querySelector('.empty-state');
        if (emptyState) {
            const messageElement = emptyState.querySelector('p');
            if(messageElement) {
                messageElement.textContent = message;
            }
            emptyState.style.display = 'block';
        }
    }

    checkInitialContext() {
        // Check for screenshots and context immediately
        ipcRenderer.invoke('get-screenshot-queue').then(screenshots => {
            if (screenshots.length === 0) {
                // No screenshots taken yet - show appropriate message
                this.showEmptyState("No screenshots have been taken yet.");
            } else {
                // Screenshots exist, render them
                this.renderScreenshots(screenshots);
            }
        }).catch(error => {
            console.error('❌ Error checking initial context:', error);
            this.showEmptyState("No screenshots have been taken yet.");
        });
    }

    checkScreenshotsBeforeLoading() {
        // Check if screenshots exist before showing loading state
        ipcRenderer.invoke('get-screenshot-queue').then(screenshots => {
            if (screenshots.length === 0) {
                // No screenshots - show empty state instead of loading
                this.showEmptyState("Take a screenshot to get AI-powered recommendations.");
            } else {
                // Screenshots exist - show loading while generating actions
                if (this.actions.length === 0) {
                    this.showLoadingState();
                }
                this.renderScreenshots(screenshots);
            }
        }).catch(error => {
            console.error('❌ Error checking screenshots:', error);
            this.showEmptyState("Take a screenshot to get AI-powered recommendations.");
        });
    }

    hideEmptyState() {
        const emptyState = this.actionsContainer.querySelector('.empty-state');
        if (emptyState) {
            emptyState.style.display = 'none';
        }
    }

    createActionButton(action) {
        console.log("Creating button for action:", action);
        
        const button = document.createElement('button');
        button.className = 'action-button action-btn';
        button.setAttribute('aria-label', action.description);
        button.setAttribute('tabindex', '0');
        button.setAttribute('data-action-id', action.id);

        // Create confidence indicator
        const confidenceBar = document.createElement('div');
        confidenceBar.className = 'confidence-indicator';
        
        // Handle confidence values correctly
        let confidenceValue = action.confidence;
        if (typeof confidenceValue === 'number') {
            // Normalize if > 1 (some confidence scores come in as 0-100 range)
            if (confidenceValue > 1) {
                confidenceValue = confidenceValue / 20; // Scale large values reasonably 
            }
            
            // Ensure it's between 0-100%
            confidenceValue = Math.min(Math.max(confidenceValue, 0), 1);
            confidenceBar.style.width = `${confidenceValue * 100}%`;
        } else {
            // Default to 50% if no valid confidence
            confidenceBar.style.width = "50%";
        }

        // Create icon
        const icon = document.createElement('div');
        icon.className = 'action-icon';
        icon.innerHTML = this.getIconForAction(action.icon || 'default');

        // Create content
        const content = document.createElement('div');
        content.className = 'action-content';

        const title = document.createElement('div');
        title.className = 'action-title';
        title.textContent = action.title;

        const description = document.createElement('div');
        description.className = 'action-description';
        description.textContent = action.description;

        content.appendChild(title);
        content.appendChild(description);

        // Assemble button
        button.appendChild(confidenceBar);
        button.appendChild(icon);
        button.appendChild(content);

        // Add click handler
        button.addEventListener('click', (e) => {
            e.preventDefault();
            const actionId = e.currentTarget.getAttribute('data-action-id');
            console.log(`🎯 Button clicked for action: ${actionId}`);
            this.executeAction(actionId);
        });

        // Add keyboard handler
        button.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.executeAction(action.id);
            }
        });

        return button;
    }

    getIconForAction(iconType) {
        const iconMap = {
            'text': `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14,2 14,8 20,8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10,9 9,9 8,9"></polyline>
            </svg>`,
            'analyze': `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="m21 21-4.35-4.35"></path>
            </svg>`,
            'summary': `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 9h.01"></path>
                <path d="M15 9h.01"></path>
                <path d="M9 15h.01"></path>
                <path d="M15 15h.01"></path>
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            </svg>`,
            'link': `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.72"></path>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.72-1.72"></path>
            </svg>`,
            'image': `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <circle cx="9" cy="9" r="2"></circle>
                <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"></path>
            </svg>`,
            'code': `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="16 18 22 12 16 6"></polyline>
                <polyline points="8 6 2 12 8 18"></polyline>
            </svg>`,
            'document': `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14,2 14,8 20,8"></polyline>
            </svg>`,
            'presentation': `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                <line x1="8" y1="21" x2="16" y2="21"></line>
                <line x1="12" y1="17" x2="12" y2="21"></line>
            </svg>`,
            'default': `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
            </svg>`
        };

        return iconMap[iconType] || iconMap['default'];
    }

    async executeAction(actionId) {
        try {
            console.log(`🎯 Executing agentic action: ${actionId}`);
            console.log(`Available actions:`, this.actions);
            
            if (!actionId) {
                console.error("No action ID provided");
                return;
            }
            
            // Verify that this action exists in our current actions
            const actionExists = this.actions.some(a => a.id === actionId);
            console.log(`Action ${actionId} exists in current actions: ${actionExists}`);
            
            if (!actionExists) {
                console.warn("Action ID not found in current actions, will try to execute anyway");
            }
            
            // Show task sequence for agentic execution
            this.showAgenticTaskSequence(actionId);
            
            // Execute agentic action via IPC
            console.log(`Sending execute-agentic-action to main process with ID: ${actionId}`);
            const result = await ipcRenderer.invoke('execute-agentic-action', actionId);
            
            console.log(`Received result for action ${actionId}:`, result);
            
            if (result && result.type === 'success') {
                console.log(`✅ Agentic action completed: ${actionId}`);
                this.displayAgenticResult(actionId, result);
            } else {
                console.error(`❌ Agentic action failed: ${actionId}`, result);
                this.displayAgenticError(actionId, result);
            }

        } catch (error) {
            console.error('❌ Error executing agentic action:', error);
            this.displayAgenticError(actionId, { type: 'error', content: error.message });
        }
    }

    showAgenticTaskSequence(actionId) {
        console.log(`📋 Showing agentic task sequence for: ${actionId}`);
        
        const taskSequence = document.getElementById('task-sequence');
        const sequenceTitle = document.getElementById('sequence-title');
        const sequenceProgress = document.getElementById('sequence-progress');
        const taskList = document.getElementById('task-list');
        const taskOutput = document.getElementById('task-output');
        const statusText = document.getElementById('status-text');
        const statusIndicator = document.getElementById('status-indicator');
        const currentStep = document.getElementById('current-step');
        
        if (!taskSequence) {
            console.error('❌ Task sequence element not found');
            return;
        }
        
        // Initialize agentic task state
        this.currentTaskState = {
            id: actionId,
            status: 'running',
            currentStep: 0,
            isPaused: false,
            isCancelled: false
        };
        
        // Set up task controls
        this.setupTaskControls();
        
        // Define agentic task sequences
        const agenticTasks = [
            'Analyzing context with Claude AI',
            'Matching task to best MCP agents',
            'Initializing Dedalus runner',
            'Executing with selected agents',
            'Processing and formatting results'
        ];
        
        // Set title and show sequence
        sequenceTitle.textContent = 'Running Agentic Task';
        sequenceProgress.textContent = `0/${agenticTasks.length}`;
        taskSequence.classList.add('active');
        
        // Clear and populate task list
        taskList.innerHTML = '';
        agenticTasks.forEach((task, index) => {
            const taskItem = document.createElement('li');
            taskItem.className = 'task-item';
            taskItem.innerHTML = `
                <div class="task-status"></div>
                <span class="task-text">${task}</span>
            `;
            taskList.appendChild(taskItem);
        });
        
        // Update status bar
        statusText.textContent = 'Running';
        statusIndicator.className = 'status-indicator';
        currentStep.textContent = `Step 1 of ${agenticTasks.length}`;
        
        // Clear output
        taskOutput.innerHTML = '<div>🚀 Initializing agentic pipeline...</div>';
        
        // Simulate task execution progress
        this.simulateAgenticExecution(agenticTasks, taskOutput, sequenceProgress);
    }
    
    displayAgenticResult(actionId, result) {
        console.log(`📊 Displaying agentic result for: ${actionId}`);
        
        const taskOutput = document.getElementById('task-output');
        const statusText = document.getElementById('status-text');
        const statusIndicator = document.getElementById('status-indicator');
        const suspendBtn = document.getElementById('suspend-btn');
        const cancelBtn = document.getElementById('cancel-btn');
        const closeTaskBtn = document.getElementById('close-task-btn');
        
        if (!taskOutput) return;
        
        // Update status to completed
        this.currentTaskState.status = 'completed';
        statusText.textContent = 'Completed';
        statusIndicator.className = 'status-indicator completed';
        suspendBtn.disabled = true;
        cancelBtn.disabled = true;
        closeTaskBtn.style.display = 'block';
        
        // Format and display the result
        const formattedResult = this.formatAgenticResult(result);
        
        const resultDiv = document.createElement('div');
        resultDiv.className = 'agentic-result';
        resultDiv.innerHTML = `
            <div class="result-header">
                <strong>✅ Task completed successfully!</strong>
            </div>
            <div class="result-content">
                ${formattedResult.html}
            </div>
        `;
        
        taskOutput.appendChild(resultDiv);
        taskOutput.scrollTop = taskOutput.scrollHeight;
        
        // Expand the overlay if needed to show results
        this.expandForResults();
    }
    
    displayAgenticError(actionId, result) {
        console.log(`❌ Displaying agentic error for: ${actionId}`);
        
        const taskOutput = document.getElementById('task-output');
        const statusText = document.getElementById('status-text');
        const statusIndicator = document.getElementById('status-indicator');
        const suspendBtn = document.getElementById('suspend-btn');
        const cancelBtn = document.getElementById('cancel-btn');
        const closeTaskBtn = document.getElementById('close-task-btn');
        
        if (!taskOutput) return;
        
        // Update status to failed
        this.currentTaskState.status = 'failed';
        statusText.textContent = 'Failed';
        statusIndicator.className = 'status-indicator cancelled';
        suspendBtn.disabled = true;
        cancelBtn.disabled = true;
        closeTaskBtn.style.display = 'block';
        
        const errorDiv = document.createElement('div');
        errorDiv.className = 'agentic-error';
        errorDiv.innerHTML = `
            <div class="error-header">
                <strong>❌ Task failed</strong>
            </div>
            <div class="error-content">
                ${result.content || 'Unknown error occurred'}
            </div>
        `;
        
        taskOutput.appendChild(errorDiv);
        taskOutput.scrollTop = taskOutput.scrollHeight;
    }
    
    formatAgenticResult(result) {
        if (!result || !result.content) {
            return { html: 'No result content available' };
        }
        
        let html = result.content;
        
        // If it's already HTML, use it directly
        if (html.includes('<') && html.includes('>')) {
            return { html };
        }
        
        // Convert plain text to HTML with basic formatting
        html = html.replace(/\n/g, '<br>');
        
        // Make URLs clickable
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        html = html.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
        
        return { html };
    }
    
    expandForResults() {
        // Ensure the overlay panel is expanded to show results
        if (!this.isExpanded) {
            this.expandPanel();
        }
        
        // Add some visual indication that results are ready
        const taskSequence = document.getElementById('task-sequence');
        if (taskSequence) {
            taskSequence.classList.add('results-ready');
        }
    }
    
    async simulateAgenticExecution(tasks, outputElement, progressElement) {
        const taskItems = document.querySelectorAll('.task-item');
        let completedTasks = 0;
        
        for (let i = 0; i < tasks.length; i++) {
            // Check if task is cancelled
            if (this.currentTaskState && this.currentTaskState.isCancelled) {
                break;
            }
            
            // Wait while paused
            while (this.currentTaskState && this.currentTaskState.isPaused) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            // Update current step
            this.currentTaskState.currentStep = i + 1;
            const currentStep = document.getElementById('current-step');
            if (currentStep) {
                currentStep.textContent = `Step ${i + 1} of ${tasks.length}`;
            }
            
            // Mark current task as active
            taskItems[i].classList.add('active');
            
            // Add progress output
            const outputLine = document.createElement('div');
            outputLine.textContent = `🔄 ${tasks[i]}...`;
            outputElement.appendChild(outputLine);
            outputElement.scrollTop = outputElement.scrollHeight;
            
            // Simulate processing time
            const processingTime = 1000 + Math.random() * 2000;
            await new Promise(resolve => setTimeout(resolve, processingTime));
            
            // Mark as completed
            taskItems[i].classList.remove('active');
            taskItems[i].classList.add('completed');
            completedTasks++;
            
            // Update progress
            progressElement.textContent = `${completedTasks}/${tasks.length}`;
            
            // Update output to show completion
            outputLine.textContent = `✅ ${tasks[i]} completed`;
        }
    }

    showTaskSequence(actionId) {
        if (!taskSequence) {
            console.error('❌ Task sequence element not found');
            return;
        }
        
        // Initialize task state
        this.currentTaskState = {
            id: actionId,
            status: 'running',
            currentStep: 0,
            isPaused: false,
            isCancelled: false
        };
        
        // Set up task controls
        this.setupTaskControls();
        
        // Define task sequences for different actions
        const taskSequences = {
            'extract_text': [
                'Analyzing screenshot content',
                'Detecting text regions',
                'Processing OCR extraction',
                'Formatting extracted text',
                'Saving to clipboard'
            ],
            'analyze_content': [
                'Loading screenshot data',
                'Analyzing visual elements',
                'Identifying key components',
                'Generating insights',
                'Preparing analysis report'
            ],
            'create_summary': [
                'Processing visual content',
                'Extracting key information',
                'Analyzing context',
                'Generating summary',
                'Formatting output'
            ]
        };
        
        const tasks = taskSequences[actionId] || taskSequences['analyze_content'];
        const actionTitles = {
            'extract_text': 'Extracting Text',
            'analyze_content': 'Analyzing Content', 
            'create_summary': 'Creating Summary'
        };
        
        // Set title and show sequence
        sequenceTitle.textContent = actionTitles[actionId] || 'Processing';
        sequenceProgress.textContent = `0/${tasks.length}`;
        taskSequence.classList.add('active');
        
        // Clear and populate task list
        taskList.innerHTML = '';
        tasks.forEach((task, index) => {
            const taskItem = document.createElement('li');
            taskItem.className = 'task-item';
            taskItem.innerHTML = `
                <div class="task-status"></div>
                <span class="task-text">${task}</span>
            `;
            taskList.appendChild(taskItem);
        });
        
        // Update status bar
        statusText.textContent = 'Running';
        statusIndicator.className = 'status-indicator';
        currentStep.textContent = `Step 1 of ${tasks.length}`;
        
        // Simulate task execution
        this.simulateTaskExecution(tasks, taskOutput, sequenceProgress);
    }
    
    setupTaskControls() {
        const cancelBtn = document.getElementById('cancel-btn');
        const closeTaskBtn = document.getElementById('close-task-btn');

        // Cancel button
        cancelBtn.addEventListener('click', () => {
            this.cancelTask();
        });

        // Close button (only available when task is complete)
        closeTaskBtn.addEventListener('click', () => {
            this.closeTaskSequence();
        });

        // Initially hide close button
        closeTaskBtn.style.display = 'none';
    }
    
    suspendTask() {
        console.log('⏸️ Suspending task');
        this.currentTaskState.isPaused = true;
        this.currentTaskState.status = 'paused';
        
        // Update UI
        const statusText = document.getElementById('status-text');
        const statusIndicator = document.getElementById('status-indicator');

        statusText.textContent = 'Paused';
        statusIndicator.className = 'status-indicator paused';
        
        // Add output message
        const taskOutput = document.getElementById('task-output');
        const pauseMessage = document.createElement('div');
        pauseMessage.innerHTML = '<strong>⏸️ Task paused by user</strong>';
        pauseMessage.style.color = 'var(--warning)';
        pauseMessage.style.marginTop = 'var(--spacing-sm)';
        taskOutput.appendChild(pauseMessage);
        taskOutput.scrollTop = taskOutput.scrollHeight;
    }
    
    resumeTask() {
        console.log('▶️ Resuming task');
        this.currentTaskState.isPaused = false;
        this.currentTaskState.status = 'running';
        
        // Update UI
        const statusText = document.getElementById('status-text');
        const statusIndicator = document.getElementById('status-indicator');

        statusText.textContent = 'Running';
        statusIndicator.className = 'status-indicator';
        
        // Add output message
        const taskOutput = document.getElementById('task-output');
        const resumeMessage = document.createElement('div');
        resumeMessage.innerHTML = '<strong>▶️ Task resumed</strong>';
        resumeMessage.style.color = 'var(--success)';
        resumeMessage.style.marginTop = 'var(--spacing-sm)';
        taskOutput.appendChild(resumeMessage);
        taskOutput.scrollTop = taskOutput.scrollHeight;
    }
    
    cancelTask() {
        console.log('❌ Cancelling task');
        this.currentTaskState.isCancelled = true;
        this.currentTaskState.status = 'cancelled';
        
        // Update UI
        const statusText = document.getElementById('status-text');
        const statusIndicator = document.getElementById('status-indicator');
        const cancelBtn = document.getElementById('cancel-btn');
        const closeTaskBtn = document.getElementById('close-task-btn');

        statusText.textContent = 'Cancelled';
        statusIndicator.className = 'status-indicator cancelled';
        cancelBtn.disabled = true;
        closeTaskBtn.style.display = 'block';
        
        // Add output message
        const taskOutput = document.getElementById('task-output');
        const cancelMessage = document.createElement('div');
        cancelMessage.innerHTML = '<strong>❌ Task cancelled by user</strong>';
        cancelMessage.style.color = 'var(--danger)';
        cancelMessage.style.marginTop = 'var(--spacing-sm)';
        taskOutput.appendChild(cancelMessage);
        taskOutput.scrollTop = taskOutput.scrollHeight;
        
        // Mark all remaining tasks as cancelled
        const taskItems = document.querySelectorAll('.task-item:not(.completed)');
        taskItems.forEach(item => {
            if (!item.classList.contains('active')) {
                item.style.opacity = '0.5';
                item.style.textDecoration = 'line-through';
            }
        });
    }
    
    closeTaskSequence() {
        const taskSequence = document.getElementById('task-sequence');
        taskSequence.classList.remove('active');
        this.currentTaskState = null;
        
        // Reset controls for next use
        const cancelBtn = document.getElementById('cancel-btn');
        const closeTaskBtn = document.getElementById('close-task-btn');

        cancelBtn.disabled = false;
        closeTaskBtn.style.display = 'none';
    }
    
    async simulateTaskExecution(tasks, outputElement, progressElement) {
        const taskItems = document.querySelectorAll('.task-item');
        let completedTasks = 0;
        
        // Clear output
        outputElement.innerHTML = '<div>Initializing...</div>';
        
        for (let i = 0; i < tasks.length; i++) {
            // Check if task is cancelled
            if (this.currentTaskState && this.currentTaskState.isCancelled) {
                break;
            }
            
            // Wait while paused
            while (this.currentTaskState && this.currentTaskState.isPaused) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            // Update current step
            this.currentTaskState.currentStep = i + 1;
            const currentStep = document.getElementById('current-step');
            if (currentStep) {
                currentStep.textContent = `Step ${i + 1} of ${tasks.length}`;
            }
            
            // Mark current task as active
            taskItems[i].classList.add('active');
            
            // Simulate processing time (with pause checks)
            const processingTime = 800 + Math.random() * 1200;
            const checkInterval = 200;
            let elapsed = 0;
            
            while (elapsed < processingTime) {
                // Check for pause/cancel during processing
                if (this.currentTaskState && this.currentTaskState.isCancelled) {
                    return;
                }
                
                while (this.currentTaskState && this.currentTaskState.isPaused) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
                
                await new Promise(resolve => setTimeout(resolve, checkInterval));
                elapsed += checkInterval;
            }
            
            // Mark as completed
            taskItems[i].classList.remove('active');
            taskItems[i].classList.add('completed');
            completedTasks++;
            
            // Update progress
            progressElement.textContent = `${completedTasks}/${tasks.length}`;
            
            // Add output
            const outputs = [
                `✓ ${tasks[i]} completed`,
                `→ Processing data: ${Math.floor(Math.random() * 100)}% accuracy`,
                `→ Found ${Math.floor(Math.random() * 50) + 10} elements`,
                `→ Confidence: ${Math.floor(Math.random() * 30) + 70}%`
            ];
            
            const outputLine = document.createElement('div');
            outputLine.textContent = outputs[Math.floor(Math.random() * outputs.length)];
            outputElement.appendChild(outputLine);
            
            // Auto-scroll output
            outputElement.scrollTop = outputElement.scrollHeight;
        }
        
        // Final completion message (only if not cancelled)
        if (this.currentTaskState && !this.currentTaskState.isCancelled) {
            setTimeout(() => {
                // Update status to completed
                this.currentTaskState.status = 'completed';
                const statusText = document.getElementById('status-text');
                const statusIndicator = document.getElementById('status-indicator');
                const cancelBtn = document.getElementById('cancel-btn');
                const closeTaskBtn = document.getElementById('close-task-btn');

                statusText.textContent = 'Completed';
                statusIndicator.className = 'status-indicator completed';
                cancelBtn.disabled = true;
                closeTaskBtn.style.display = 'block';
                
                const finalOutput = document.createElement('div');
                finalOutput.innerHTML = '<strong>✅ Task completed successfully!</strong>';
                finalOutput.style.color = 'var(--success)';
                finalOutput.style.marginTop = 'var(--spacing-sm)';
                outputElement.appendChild(finalOutput);
                outputElement.scrollTop = outputElement.scrollHeight;
            }, 500);
        }
    }

    togglePanel() {
        if (this.isExpanded) {
            this.collapsePanel();
        } else {
            this.expandPanel();
        }
    }
    
    expandPanel() {
        if (this.isExpanded) return;

        this.isExpanded = true;
        this.panel.classList.remove('hidden');
        this.indicator.classList.add('active');
        // Removed panel-expanded class - eye stays visible always
        clearTimeout(this.hoverTimeout);

        // Focus the panel for keyboard navigation
        this.panel.setAttribute('aria-expanded', 'true');
        this.panel.focus();
        
        // Check if we have screenshots first before showing loading
        this.checkScreenshotsBeforeLoading();
    }
    
    collapsePanel() {
        if (!this.isExpanded) return;
        
        this.isExpanded = false;
        this.panel.classList.add('hidden');
        this.indicator.classList.remove('active');
        // Removed panel-expanded class removal - eye stays visible always
        
        // Update ARIA attributes
        this.panel.setAttribute('aria-expanded', 'false');
        if (this.indicator) {
            this.indicator.focus();
        }
    }
    
    dismissOverlay() {
        // Don't dismiss if task sequence is active or processing gestures
        const taskSequence = document.getElementById('task-sequence');
        if (taskSequence && taskSequence.classList.contains('active')) {
            console.log('🚫 Cannot dismiss overlay while task is running');
            return;
        }

        // Don't dismiss if currently processing (loading state visible)
        const loadingState = document.getElementById('loading-state');
        if (loadingState && loadingState.style.display !== 'none') {
            console.log('🚫 Cannot dismiss overlay while processing');
            return;
        }

        console.log('👋 Dismissing overlay');
        this.collapsePanel();
        ipcRenderer.send('overlay-dismissed');
    }

    async notifyHover() {
        try {
            await ipcRenderer.invoke('overlay-hover');
        } catch (error) {
            console.error('❌ Error notifying hover:', error);
        }
    }

    setupLiveUpdateListeners() {
        // Make sure we have access to electronAPI
        if (typeof window !== 'undefined' && window.electronAPI) {
            window.electronAPI.onModeChanged((mode) => {
                // update the overlay mode pill / eye tint, etc.
                const el = document.getElementById('overlay-mode');
                if (el) el.textContent = mode.toUpperCase();
            });

            window.electronAPI.onScreenshotCaptured((_evt, payload) => {
                console.log('📸 Screenshot captured, auto-opening overlay');

                // Auto-expand the overlay when screenshot is taken
                if (!this.isExpanded) {
                    this.expandPanel();
                }

                // Show enhanced loading state for screenshot processing
                this.showLoadingState('Processing screenshot...', 'Analyzing content and generating recommendations');

                // prepend new thumbnail into overlay gallery
                const list = document.getElementById('overlay-shots');
                if (!list) return;
                const item = document.createElement('img');
                item.src = `file://${payload.filePath}`;
                item.alt = payload.filename;
                item.className = 'overlay-thumb';
                item.style.width = '60px';
                item.style.height = '40px';
                item.style.objectFit = 'cover';
                item.style.borderRadius = '4px';
                item.style.margin = '2px';
                list.prepend(item);

                // Update screenshot count
                const count = list.children.length;
                const countEl = document.getElementById('screenshot-count');
                if (countEl) {
                    countEl.textContent = `${count} screenshot${count !== 1 ? 's' : ''}`;
                }

                // Request analysis of the new screenshot
                setTimeout(() => {
                    this.updateScreenshotGallery();
                }, 500);
            });

            window.electronAPI.onSessionUpdated((_data) => {
                // (Optional) flash a subtle "saved" indicator on the overlay
                const tick = document.getElementById('overlay-saved');
                if (!tick) return;
                tick.classList.add('show');
                setTimeout(() => tick.classList.remove('show'), 1200);
            });
        } else {
            // Fallback to direct IPC if electronAPI not available
            ipcRenderer.on('mode-changed', (_event, mode) => {
                const el = document.getElementById('overlay-mode');
                if (el) el.textContent = mode.toUpperCase();
            });

            ipcRenderer.on('screenshot-captured', (_event, payload) => {
                console.log('📸 Screenshot captured via IPC, auto-opening overlay');

                // Auto-expand the overlay when screenshot is taken
                if (!this.isExpanded) {
                    this.expandPanel();
                }

                // Show enhanced loading state for screenshot processing
                this.showLoadingState('Processing screenshot...', 'Analyzing content and generating recommendations');

                const list = document.getElementById('overlay-shots');
                if (!list) return;
                const item = document.createElement('img');
                item.src = `file://${payload.filePath}`;
                item.alt = payload.filename;
                item.className = 'overlay-thumb';
                item.style.width = '60px';
                item.style.height = '40px';
                item.style.objectFit = 'cover';
                item.style.borderRadius = '4px';
                item.style.margin = '2px';
                list.prepend(item);

                // Update screenshot count
                const count = list.children.length;
                const countEl = document.getElementById('screenshot-count');
                if (countEl) {
                    countEl.textContent = `${count} screenshot${count !== 1 ? 's' : ''}`;
                }

                // Request analysis of the new screenshot
                setTimeout(() => {
                    this.updateScreenshotGallery();
                }, 500);
            });

            ipcRenderer.on('session-updated', (_event, _data) => {
                const tick = document.getElementById('overlay-saved');
                if (!tick) return;
                tick.classList.add('show');
                setTimeout(() => tick.classList.remove('show'), 1200);
            });
        }
    }
}

// Initialize overlay UI when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new OverlayUI();
});

// Handle window focus/blur for auto-dismiss
window.addEventListener('blur', () => {
    // Don't dismiss if task sequence is active
    const taskSequence = document.getElementById('task-sequence');
    if (taskSequence && taskSequence.classList.contains('active')) {
        return;
    }

    // Don't dismiss if currently processing
    const overlay = document.querySelector('.overlay-container');
    if (overlay && overlay.isProcessing) {
        return;
    }

    // Don't dismiss if loading state is visible
    const loadingState = document.getElementById('loading-state');
    if (loadingState && loadingState.style.display !== 'none') {
        return;
    }

    // Dismiss overlay when window loses focus
    setTimeout(() => {
        if (document.hasFocus()) return;

        ipcRenderer.invoke('dismiss-overlay').catch(console.error);
    }, 1000);
});


// Prevent context menu
document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
});

// Prevent text selection
document.addEventListener('selectstart', (e) => {
    e.preventDefault();
});
