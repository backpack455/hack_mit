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
        
        this.init();
    }

    init() {
        // Get DOM elements
        this.indicator = document.getElementById('vipr-indicator');
        this.panel = document.getElementById('vipr-panel');
        this.actionsContainer = document.getElementById('actions-container');
        this.closeBtn = document.getElementById('close-btn');

        // Set up event listeners
        this.setupEventListeners();
        
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

        // Click outside to dismiss
        document.addEventListener('click', (e) => {
            if (!this.panel.contains(e.target) && !this.indicator.contains(e.target)) {
                this.dismissOverlay();
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
        
        // Show indicator initially
        this.indicator.style.display = 'flex';
        
        console.log('🎯 Actions received:', actions.length);
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
        button.addEventListener('click', () => {
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
            
            // Add loading state to button
            const button = event.target.closest('.action-button');
            if (button) {
                button.style.opacity = '0.6';
                button.style.pointerEvents = 'none';
            }

            // Send to main process
            const result = await ipcRenderer.invoke('execute-overlay-action', actionId);
            
            if (result.success) {
                console.log(`✅ Action executed successfully: ${actionId}`);
            } else {
                console.error(`❌ Action failed: ${actionId}`);
            }

        } catch (error) {
            console.error('❌ Error executing action:', error);
        }
    }

    async dismissOverlay() {
        try {
            // Don't auto-dismiss - only dismiss via shortcut toggle
            console.log('⚠️ Overlay is sticky - use shortcut to toggle');
        } catch (error) {
            console.error('❌ Error dismissing overlay:', error);
        }
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
