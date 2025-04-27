/**
 * Event Manager for Tab Volume Control popup
 * Handles event listeners, message handling, and lifecycle management
 */

// Create namespace to avoid global pollution
const EventManager = {};

/**
 * Set up listener for audio status changes
 * @param {Object} state - Application state
 * @param {Object} handlers - Object with event handlers
 * @returns {Function} - Listener function that was added
 */
EventManager.setupAudioStatusListener = function(state, handlers) {
  // Set up message listener for tab audio status changes
  const listener = (message) => {
    if (!state.isPopupActive) return;
    
    // Handle tab audio started
    if (message.action === "tabAudioStarted" && message.tabId) {
      // Always queue the tab for adding regardless of initialLoadComplete state
      handlers.queueTabUpdate(message.tabId, 'add');
      
      // If initial load didn't find any tabs, refresh the full list
      if (state.currentTabs.length === 0 && state.initialLoadComplete) {
        console.log("Audio detected but tab list is empty. Refreshing tab list.");
        handlers.refreshTabList();
      }
    }
    
    // Handle tab audio stopped
    if (message.action === "tabAudioStopped" && message.tabId) {
      handlers.queueTabUpdate(message.tabId, 'remove');
    }
    
    // Handle active tab changed
    if (message.action === "activeTabChanged" && message.tabId) {
      state.activeTabId = message.tabId;
      console.log("Active tab changed to:", message.tabId);
      
      // Try to add this tab to the list if it's not already there
      handlers.handleTabActive(message.tabId);
    }
    
    // Handle tab title changed
    if (message.action === "tabTitleChanged" && message.tabId && message.title) {
      handlers.updateTabTitle(message.tabId, message.title);
    }
    
    // Handle tab audio list update (reduce frequency by ignoring if we have pending updates)
    if (message.action === "tabAudioListUpdated") {
      // If we have no tabs and initial load is complete, try refreshing
      if (state.currentTabs.length === 0 && state.initialLoadComplete) {
        console.log("Audio list updated but tab list is empty. Refreshing tab list.");
        handlers.refreshTabList();
      } else if (state.pendingUpdates.size === 0) {
        // We'll only do incremental updates, not full reloads
        handlers.processPendingUpdates();
      }
    }
  };
  
  // Add the listener
  browser.runtime.onMessage.addListener(listener);
  
  // Store for cleanup
  state.audioStatusListener = listener;
  
  return listener;
};

/**
 * Handle visibility change for the popup
 * @param {Object} state - Application state
 * @param {Function} updateAllTabTitles - Function to update all tab titles
 * @param {Function} loadTabs - Function to load tabs
 */
EventManager.handleVisibilityChange = function(state, updateAllTabTitles, loadTabs) {
  state.isPopupActive = document.visibilityState === 'visible';
  
  // Refresh tabs when popup becomes visible again
  if (state.isPopupActive) {
    // Update tab titles for existing tabs before doing a full reload
    updateAllTabTitles().then(() => {
      // Only do a full reload if we've been hidden for a while
      loadTabs();
    }).catch(error => {
      console.error('Error updating tab titles:', error);
      // Fall back to full reload
      loadTabs();
    });
  }
};

/**
 * Set up master volume control listeners
 * @param {Object} elements - UI elements
 * @param {Function} updateMasterVolumeDisplay - Function to update master volume display
 * @param {Function} updateMasterSlider - Function to update master slider
 * @param {Function} applyMasterVolumeToAllTabs - Function to apply master volume to all tabs
 */
EventManager.setupMasterVolumeListeners = function(elements, updateMasterVolumeDisplay, updateMasterSlider, applyMasterVolumeToAllTabs) {
  // Master volume slider
  elements.masterSlider.addEventListener('input', function() {
    updateMasterVolumeDisplay(parseInt(this.value));
  });
  
  // Master presets
  elements.masterPresets['0'].addEventListener('click', () => updateMasterSlider(0));
  elements.masterPresets['100'].addEventListener('click', () => updateMasterSlider(100));
  elements.masterPresets['200'].addEventListener('click', () => updateMasterSlider(200));
  elements.masterPresets['500'].addEventListener('click', () => updateMasterSlider(500));
  
  // Apply to all tabs button
  elements.applyMasterButton.addEventListener('click', applyMasterVolumeToAllTabs);
};

/**
 * Set up global button listeners
 * @param {Object} elements - UI elements
 * @param {Function} refreshTabList - Function to refresh tab list
 * @param {Function} resetAllTabs - Function to reset all tabs
 * @param {Function} showStatus - Function to show status messages
 */
EventManager.setupButtonListeners = function(elements, refreshTabList, resetAllTabs, showStatus) {
  // Refresh tabs button
  elements.refreshButton.addEventListener('click', function() {
    refreshTabList();
    showStatus('Tab list refreshed');
  });
  
  // Reset all tabs button
  elements.resetButton.addEventListener('click', function() {
    resetAllTabs();
    showStatus('All tabs reset to 100% volume');
  });
};

/**
 * Clean up event listeners
 * @param {Object} state - Application state
 */
EventManager.cleanupEventListeners = function(state) {
  if (state.pendingUpdateTimer) {
    clearTimeout(state.pendingUpdateTimer);
  }
  if (state.audioStatusListener) {
    browser.runtime.onMessage.removeListener(state.audioStatusListener);
  }
  document.removeEventListener('visibilitychange', state.visibilityChangeHandler);
};