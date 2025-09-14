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
        
        // Set initial position class
        this.updatePositionClass();

        // Set up event listeners
        this.setupEventListeners();
        
        // Set up drag functionality
        this.setupDragFunctionality();
        
        // Listen for IPC messages
        this.setupIPCListeners();
        
        // Request current position from main process
        this.currentPosition = ipcRenderer.sendSync('request-position');
        this.updatePositionClass();
        
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

        this.panel.addEventListener('mouseleave', () => {
            if (!this.isExpanded) {
                this.hoverTimeout = setTimeout(() => {
                    this.collapsePanel();
                }, 300);
            }
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

        // Click outside to dismiss
        document.addEventListener('click', (e) => {
            if (!this.panel.contains(e.target) && !this.indicator.contains(e.target)) {
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
        // Listen for actions from main process
        ipcRenderer.on('show-actions', (_, actions) => {
            this.actions = actions;
            this.renderActions();
            
            // Expand the panel when actions are received
            if (!this.isExpanded) {
                this.togglePanel();
            }
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
        
        // Handle action execution
        this.actionsContainer.addEventListener('click', (e) => {
            const actionBtn = e.target.closest('.action-btn');
            if (actionBtn) {
                const actionId = actionBtn.dataset.actionId;
                if (actionId) {
                    ipcRenderer.send('execute-overlay-action', actionId);
                }
            }
        });
        
        // Handle close button
        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                ipcRenderer.send('request-close');
            });
        }
    }

    showActions(actions) {
        this.actions = actions;
        this.renderActions();
        
        // Show indicator initially
        this.indicator.style.display = 'flex';
        
        console.log('🎯 Actions received:', actions.length);
    }

    renderActions() {
        // Clear existing actions
        this.actionsContainer.innerHTML = '';

        // Create action buttons
        this.actions.forEach((action) => {
            const actionButton = this.createActionButton(action);
            this.actionsContainer.appendChild(actionButton);
        });
    }

    createActionButton(action) {
        const button = document.createElement('button');
        button.className = 'action-button';
        button.setAttribute('aria-label', action.description);
        button.setAttribute('tabindex', '0');

        // Create confidence indicator
        const confidenceBar = document.createElement('div');
        confidenceBar.className = 'confidence-indicator';
        confidenceBar.style.width = `${action.confidence * 100}%`;

        // Create icon
        const icon = document.createElement('div');
        icon.className = 'action-icon';
        icon.innerHTML = this.getIconForAction(action.icon);

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
            console.log(`🎯 Button clicked for action: ${action.id}`);
            this.executeAction(action.id);
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
            console.log(`🎯 Executing action: ${actionId}`);
            
            // Show task sequence instead of dismissing overlay
            this.showTaskSequence(actionId);
            
            // Mock execution for now
            const success = await ipcRenderer.invoke('execute-overlay-action', actionId);
            
            if (success) {
                console.log(`✅ Action completed: ${actionId}`);
            } else {
                console.error(`❌ Action failed: ${actionId}`);
            }

        } catch (error) {
            console.error('❌ Error executing action:', error);
        }
    }

    showTaskSequence(actionId) {
        console.log(`📋 Showing task sequence for: ${actionId}`);
        
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
        clearTimeout(this.hoverTimeout);
        
        // Focus the panel for keyboard navigation
        this.panel.setAttribute('aria-expanded', 'true');
        this.panel.focus();
        
        // Actions are loaded via IPC from the main process
        // No need to call loadActions() here
    }
    
    collapsePanel() {
        if (!this.isExpanded) return;
        
        this.isExpanded = false;
        this.panel.classList.add('hidden');
        this.indicator.classList.remove('active');
        
        // Update ARIA attributes
        this.panel.setAttribute('aria-expanded', 'false');
        if (this.indicator) {
            this.indicator.focus();
        }
    }
    
    dismissOverlay() {
        // Don't dismiss if task sequence is active
        const taskSequence = document.getElementById('task-sequence');
        if (taskSequence && taskSequence.classList.contains('active')) {
            console.log('🚫 Cannot dismiss overlay while task is running');
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
