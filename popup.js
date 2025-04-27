/**
 * Popup Script for Tab Volume Control
 * Uses modular approach to handle different aspects of functionality
 */
document.addEventListener('DOMContentLoaded', function() {
  // Initialize application state
  const state = {
    currentTabs: [],
    tabVolumes: {}, // Store volume values by tab ID
    audioStatusListener: null,
    isPopupActive: true,
    pendingUpdates: new Set(), // Store pending tab updates
    pendingUpdateTimer: null,  // For debouncing updates
    initialLoadComplete: false, // Flag to track initial load
    loadRetryCount: 0,         // Counter for load retry attempts
    loadRetryTimer: null,      // Timer for retry attempts
    activeTabId: null,         // Store the ID of the active tab
    visibilityChangeHandler: null // Handler for visibility changes
  };
  
  // Initialize UI elements
  const elements = UIManager.initializeElements();
  
  // Initialize application
  function initialize() {
    // Set up event handlers
    setupEventHandlers();
    
    // Get the current active tab
    browser.tabs.query({active: true, currentWindow: true})
      .then(tabs => {
        if (tabs && tabs.length > 0) {
          state.activeTabId = tabs[0].id;
          console.log('Active tab detected:', state.activeTabId);
        }
      })
      .catch(error => {
        console.error('Error getting active tab:', error);
      });
    
    // Request an immediate scan for audio tabs
    browser.runtime.sendMessage({ action: "scanTabsForAudio" }).catch(error => {
      console.error('Error requesting tab scan:', error);
    });
    
    // Load tabs on popup open
    loadTabs();
  }
  
  // Set up all event handlers
  function setupEventHandlers() {
    // Set up master volume and button listeners
    EventManager.setupMasterVolumeListeners(
      elements, 
      updateMasterVolumeDisplay, 
      updateMasterSlider, 
      applyMasterVolumeToAllTabs
    );
    
    EventManager.setupButtonListeners(
      elements,
      refreshTabList,
      resetAllTabs,
      showStatus
    );
    
    // Set up audio status listener
    EventManager.setupAudioStatusListener(state, {
      queueTabUpdate: queueTabUpdate,
      refreshTabList: refreshTabList,
      updateTabTitle: updateTabTitle,
      handleTabActive: handleTabActive,
      processPendingUpdates: processPendingUpdates
    });
    
    // Add visibility change listener to handle popup being hidden/shown
    state.visibilityChangeHandler = () => {
      EventManager.handleVisibilityChange(state, updateAllTabTitles, loadTabs);
    };
    document.addEventListener('visibilitychange', state.visibilityChangeHandler);
  }
  
  // Load tabs from browser
  function loadTabs() {
    return TabManager.loadTabs(state, elements, createTabUI, UIManager.autoExpandTabs);
  }
  
  // Update all tab titles
  function updateAllTabTitles() {
    return TabManager.updateAllTabTitles(state.currentTabs, updateTabTitle);
  }
  
  // Create UI for a tab
  function createTabUI(tab) {
    return UIManager.createTabUI(tab, handlePresetClick, applyVolumeToTab, showStatus);
  }
  
  // Show status message
  function showStatus(message, duration) {
    UIManager.showStatus(message, elements.statusMessage, duration);
  }
  
  // Queue a tab update
  function queueTabUpdate(tabId, action) {
    TabManager.queueTabUpdate(state, tabId, action);
  }
  
  // Process pending tab updates
  function processPendingUpdates() {
    TabManager.processPendingUpdates(state, {
      handleTabAudioStopped: handleTabAudioStopped,
      handleTabAudioStartedAsync: handleTabAudioStartedAsync
    });
  }
  
  // Update tab title
  function updateTabTitle(tabId, newTitle) {
    UIManager.updateTabTitle(tabId, newTitle);
    
    // Also update the currentTabs array
    const tabIndex = state.currentTabs.findIndex(tab => tab.id === tabId);
    if (tabIndex !== -1) {
      state.currentTabs[tabIndex].title = newTitle;
    }
  }
  
  // Update master volume display
  function updateMasterVolumeDisplay(value) {
    UIManager.updateMasterVolumeDisplay(value, elements.masterValue);
  }
  
  // Update master slider
  function updateMasterSlider(valuePercent) {
    VolumeController.updateMasterSlider(
      valuePercent, 
      elements.masterSlider, 
      (value) => updateMasterVolumeDisplay(value)
    );
  }
  
  // Apply volume to a tab
  function applyVolumeToTab(tabId, volume) {
    VolumeController.applyVolumeToTab(tabId, volume);
    state.tabVolumes[tabId] = volume;
  }
  
  // Apply master volume to all tabs
  function applyMasterVolumeToAllTabs() {
    const volume = elements.masterSlider.value / 100;
    const count = VolumeController.applyMasterVolumeToAllTabs(
      state.currentTabs, 
      volume, 
      (tabId, volumePercent) => UIManager.updateTabVolumeUI(tabId, volumePercent),
      state.tabVolumes
    );
    
    showStatus(`Volume set to ${elements.masterSlider.value}% for ${count} tabs`);
  }
  
  // Reset all tabs to default volume
  function resetAllTabs() {
    const count = VolumeController.resetAllTabs(state.currentTabs, state.tabVolumes);
    
    // Update UI for all tabs
    state.currentTabs.forEach(tab => {
      UIManager.updateTabVolumeUI(tab.id, 100);
    });
    
    showStatus(`Reset ${count} tabs to 100% volume`);
  }
  
  // Handle preset button click
  function handlePresetClick(event) {
    const tabId = parseInt(event.target.dataset.tabId);
    const valuePercent = parseInt(event.target.dataset.value);
    
    VolumeController.handleVolumePreset(
      tabId, 
      valuePercent, 
      state.tabVolumes,
      (tabId, volumePercent) => UIManager.updateTabVolumeUI(tabId, volumePercent)
    );
    
    showStatus(`Tab volume set to ${valuePercent}%`);
  }
  
  // Handle when a tab stops playing audio
  function handleTabAudioStopped(tabId) {
    // If this is the active tab, don't remove it
    if (tabId === state.activeTabId) {
      console.log(`Tab ${tabId} is the active tab - keeping it in the list even though audio stopped`);
      return;
    }
    
    // Find the tab in our list
    const tabIndex = state.currentTabs.findIndex(tab => tab.id === tabId);
    if (tabIndex === -1) return;
    
    // Remove the tab from our state
    state.currentTabs.splice(tabIndex, 1);
    
    // Remove the tab UI with fade effect
    UIManager.removeTabFromUI(tabId, elements.noTabsMessage, () => {
      // Show no tabs message if needed
      if (state.currentTabs.length === 0) {
        elements.noTabsMessage.style.display = 'block';
      }
    });
  }
  
  // Handle when a tab starts playing audio (async version)
  async function handleTabAudioStartedAsync(tabId) {
    // Check if this tab is already in our list
    const tabExists = state.currentTabs.some(tab => tab.id === tabId);
    
    // Always proceed with fetching info, even if the tab exists
    // This ensures we get updated audio status
    try {
      // Get tab info
      const tab = await browser.tabs.get(tabId);
      const tabInfo = await TabManager.getTabVolumeInfo(tab, state);
      
      // Only add if it actually has audio and isn't already in our list
      if (tabInfo.hasAudio) {
        if (!tabExists) {
          state.currentTabs.push(tabInfo);
          const tabElement = createTabUI(tabInfo);
          elements.tabsContainer.appendChild(tabElement);
          
          // Update no tabs message
          elements.noTabsMessage.style.display = 'none';
          
          // Auto-expand if needed
          if (state.currentTabs.length <= UIManager.AUTO_EXPAND_THRESHOLD) {
            const header = document.querySelector(`.tab-item[data-tab-id="${tabId}"] .tab-header`);
            if (header) header.click();
          }
        } else {
          // Update the existing tab info
          updateExistingTab(tabInfo);
        }
      }
    } catch (error) {
      console.error(`Error adding new audio tab ${tabId}:`, error);
    }
  }
  
  // Update an existing tab's info
  function updateExistingTab(tabInfo) {
    // Find the tab in our list
    const index = state.currentTabs.findIndex(tab => tab.id === tabInfo.id);
    if (index !== -1) {
      // Update our stored tab info
      state.currentTabs[index] = tabInfo;
      
      // Update the UI if needed (title, favicon, etc.)
      updateTabTitle(tabInfo.id, tabInfo.title);
      
      // If it's a tab that was previously removed from the UI but still in state,
      // make sure it's visible in the UI
      const tabElement = document.querySelector(`.tab-item[data-tab-id="${tabInfo.id}"]`);
      if (!tabElement) {
        const newTabElement = createTabUI(tabInfo);
        elements.tabsContainer.appendChild(newTabElement);
        elements.noTabsMessage.style.display = 'none';
      }
    }
  }
  
  // Handle when the active tab is detected
  function handleTabActive(tabId) {
    TabManager.handleTabActive(tabId, state, elements, createTabUI)
      .catch(error => {
        console.error(`Error handling active tab ${tabId}:`, error);
      });
  }
  
  // Refresh the tab list completely
  async function refreshTabList() {
    // Cancel any pending updates
    if (state.pendingUpdateTimer) {
      clearTimeout(state.pendingUpdateTimer);
      state.pendingUpdateTimer = null;
    }
    state.pendingUpdates.clear();
    
    // Clear current tabs first
    state.currentTabs = [];
    elements.tabsContainer.innerHTML = '';
    
    // Reset the state and load tabs again
    await loadTabs();
    
    // Show a status message
    showStatus("Tab list refreshed with latest information");
  }
  
  // Initialize the popup
  initialize();
});