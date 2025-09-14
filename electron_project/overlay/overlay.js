// VIPR Overlay JavaScript
const { ipcRenderer } = require('electron');

class OverlayUI {
    constructor() {
        this.indicator = null;
        this.panel = null;
        this.actionsContainer = null;
        this.isExpanded = false;
        this.hoverTimeout = null;
        this.actions = [];
        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartLeft = 0;
        
        this.init();
    }

    init() {
        // Get DOM elements
        this.indicator = document.getElementById('vipr-indicator');
        this.panel = document.getElementById('vipr-panel');
        this.actionsContainer = document.getElementById('actions-container');
        this.closeBtn = document.getElementById('close-btn');
        this.overlayContainer = document.querySelector('.overlay-container');
        this.screenshotGallery = document.getElementById('screenshot-gallery');
        this.screenshotScroll = document.getElementById('screenshot-scroll');
        this.screenshotCount = document.getElementById('screenshot-count');

        // Set up event listeners
        this.setupEventListeners();
        
        // Set up drag functionality
        this.setupDragFunctionality();
        
        // Listen for IPC messages
        this.setupIPCListeners();
        
        console.log('✅ Overlay UI initialized');
    }

    setupEventListeners() {
        // Indicator hover events
        this.indicator.addEventListener('mouseenter', () => {
            this.handleIndicatorHover();
        });

        this.indicator.addEventListener('mouseleave', () => {
            this.handleIndicatorLeave();
        });

        // Panel hover events
        this.panel.addEventListener('mouseenter', () => {
            this.handlePanelHover();
        });

        this.panel.addEventListener('mouseleave', () => {
            this.handlePanelLeave();
        });

        // Close button
        this.closeBtn.addEventListener('click', () => {
            this.dismissOverlay();
        });

        // Keyboard events
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.dismissOverlay();
            }
        });

        // Click outside to dismiss (only when not in task sequence)
        document.addEventListener('click', (e) => {
            const taskSequence = document.getElementById('task-sequence');
            if (taskSequence && taskSequence.classList.contains('active')) {
                // Don't dismiss when task sequence is active
                return;
            }
            if (!this.panel.contains(e.target) && !this.indicator.contains(e.target)) {
                this.dismissOverlay();
            }
        });
    }

    setupDragFunctionality() {
        // Mouse events for dragging
        this.indicator.addEventListener('mousedown', (e) => {
            if (this.isExpanded) return; // Don't drag when expanded
            
            this.isDragging = true;
            this.dragStartX = e.clientX;
            this.dragStartLeft = parseInt(window.getComputedStyle(this.overlayContainer).right);
            
            this.overlayContainer.classList.add('dragging');
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!this.isDragging) return;
            
            const deltaX = this.dragStartX - e.clientX; // Reverse for right positioning
            const newRight = this.dragStartLeft + deltaX;
            
            // Constrain to screen bounds (with some padding)
            const minRight = 20;
            const maxRight = window.innerWidth - 92; // 72px width + 20px padding
            
            const constrainedRight = Math.max(minRight, Math.min(maxRight, newRight));
            this.overlayContainer.style.right = constrainedRight + 'px';
        });

        document.addEventListener('mouseup', () => {
            if (this.isDragging) {
                this.isDragging = false;
                this.overlayContainer.classList.remove('dragging');
            }
        });

        // Touch events for mobile support
        this.indicator.addEventListener('touchstart', (e) => {
            if (this.isExpanded) return;
            
            this.isDragging = true;
            this.dragStartX = e.touches[0].clientX;
            this.dragStartLeft = parseInt(window.getComputedStyle(this.overlayContainer).right);
            
            this.overlayContainer.classList.add('dragging');
            e.preventDefault();
        });

        document.addEventListener('touchmove', (e) => {
            if (!this.isDragging) return;
            
            const deltaX = this.dragStartX - e.touches[0].clientX;
            const newRight = this.dragStartLeft + deltaX;
            
            const minRight = 20;
            const maxRight = window.innerWidth - 92;
            
            const constrainedRight = Math.max(minRight, Math.min(maxRight, newRight));
            this.overlayContainer.style.right = constrainedRight + 'px';
            
            e.preventDefault();
        });

        document.addEventListener('touchend', () => {
            if (this.isDragging) {
                this.isDragging = false;
                this.overlayContainer.classList.remove('dragging');
            }
        });
    }

    setupIPCListeners() {
        // Listen for actions from main process
        ipcRenderer.on('show-actions', (event, actions) => {
            this.showActions(actions);
        });
    }

    handleIndicatorHover() {
        if (!this.isExpanded && this.actions.length > 0) {
            this.expandPanel();
        }
        this.notifyHover();
    }

    handleIndicatorLeave() {
        // Set timeout to collapse if not hovering over panel
        this.hoverTimeout = setTimeout(() => {
            if (!this.isExpanded) return;
            this.collapsePanel();
        }, 300);
    }

    handlePanelHover() {
        // Clear collapse timeout
        if (this.hoverTimeout) {
            clearTimeout(this.hoverTimeout);
            this.hoverTimeout = null;
        }
        this.notifyHover();
    }

    handlePanelLeave() {
        // Don't collapse if task sequence is active
        const taskSequence = document.getElementById('task-sequence');
        if (taskSequence && taskSequence.classList.contains('active')) {
            return;
        }
        
        // Set timeout to collapse
        this.hoverTimeout = setTimeout(() => {
            this.collapsePanel();
        }, 300);
    }

    expandPanel() {
        if (this.isExpanded) return;

        this.panel.classList.remove('hidden');
        this.indicator.style.opacity = '0';
        this.isExpanded = true;

        // Clear any collapse timeout
        if (this.hoverTimeout) {
            clearTimeout(this.hoverTimeout);
            this.hoverTimeout = null;
        }

        console.log('📖 Panel expanded');
    }

    collapsePanel() {
        if (!this.isExpanded) return;

        this.panel.classList.add('hidden');
        this.indicator.style.opacity = '1';
        this.isExpanded = false;

        console.log('📕 Panel collapsed');
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
        // Clear existing actions
        this.actionsContainer.innerHTML = '';

        // Create action buttons
        this.actions.forEach((action, index) => {
            const actionButton = this.createActionButton(action, index);
            this.actionsContainer.appendChild(actionButton);
        });
    }

    createActionButton(action, index) {
        const button = document.createElement('button');
        button.className = 'action-button';
        button.setAttribute('aria-label', action.description);
        button.setAttribute('tabindex', index);

        // Create confidence indicator
        const confidenceBar = document.createElement('div');
        confidenceBar.className = 'confidence-indicator';
        confidenceBar.style.width = `${action.confidence * 100}%`;

        // Create icon
        const icon = document.createElement('div');
        icon.className = 'action-icon';
        icon.textContent = this.getIconForAction(action.icon);

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
            'text': '📝',
            'analyze': '🔍',
            'summary': '📋',
            'link': '🔗',
            'image': '🖼️',
            'code': '💻',
            'document': '📄',
            'presentation': '📊',
            'default': '⚡'
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
        const suspendBtn = document.getElementById('suspend-btn');
        const cancelBtn = document.getElementById('cancel-btn');
        const closeTaskBtn = document.getElementById('close-task-btn');
        
        // Suspend/Resume button
        suspendBtn.addEventListener('click', () => {
            if (this.currentTaskState.isPaused) {
                this.resumeTask();
            } else {
                this.suspendTask();
            }
        });
        
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
        const suspendBtn = document.getElementById('suspend-btn');
        
        statusText.textContent = 'Paused';
        statusIndicator.className = 'status-indicator paused';
        suspendBtn.innerHTML = '<span>▶️</span> Resume';
        
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
        const suspendBtn = document.getElementById('suspend-btn');
        
        statusText.textContent = 'Running';
        statusIndicator.className = 'status-indicator';
        suspendBtn.innerHTML = '<span>⏸️</span> Suspend';
        
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
        const suspendBtn = document.getElementById('suspend-btn');
        const cancelBtn = document.getElementById('cancel-btn');
        const closeTaskBtn = document.getElementById('close-task-btn');
        
        statusText.textContent = 'Cancelled';
        statusIndicator.className = 'status-indicator cancelled';
        suspendBtn.disabled = true;
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
        const suspendBtn = document.getElementById('suspend-btn');
        const cancelBtn = document.getElementById('cancel-btn');
        const closeTaskBtn = document.getElementById('close-task-btn');
        
        suspendBtn.disabled = false;
        cancelBtn.disabled = false;
        closeTaskBtn.style.display = 'none';
        suspendBtn.innerHTML = '<span>⏸️</span> Suspend';
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
                const suspendBtn = document.getElementById('suspend-btn');
                const cancelBtn = document.getElementById('cancel-btn');
                const closeTaskBtn = document.getElementById('close-task-btn');
                
                statusText.textContent = 'Completed';
                statusIndicator.className = 'status-indicator completed';
                suspendBtn.disabled = true;
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

    dismissOverlay() {
        // Don't dismiss if task sequence is active
        const taskSequence = document.getElementById('task-sequence');
        if (taskSequence && taskSequence.classList.contains('active')) {
            console.log('🚫 Cannot dismiss overlay while task is running');
            return;
        }
        
        console.log('👋 Dismissing overlay');
        ipcRenderer.invoke('dismiss-overlay').catch(console.error);
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
