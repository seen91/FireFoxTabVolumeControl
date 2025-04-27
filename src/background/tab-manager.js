/**
 * Tab Manager for Tab Volume Control popup
 * Handles tab detection, tracking, and information retrieval
 */

// Create namespace to avoid global pollution
const TabManager = {};

// Constants
TabManager.DEFAULT_VOLUME = 1.0;      // Default volume (100%)
TabManager.AUDIO_DETECTION_TIMEOUT = 5000; // Timeout for detecting audio in a tab
TabManager.UPDATE_DEBOUNCE_TIME = 300;  // Debounce time for updates in ms
TabManager.EMPTY_LIST_RETRY_DELAY = 1000; // Delay before retrying if list is empty
TabManager.MAX_RETRY_ATTEMPTS = 3;      // Maximum number of retry attempts

/**
 * Get all tabs and filter for audio tabs
 * @param {Object} state - Application state
 * @param {Object} elements - UI elements
 * @param {Function} createTabUI - Function to create tab UI
 * @param {Function} UIManager.autoExpandTabs - Function to auto-expand tabs
 * @returns {Promise<boolean>} - True if tabs were loaded successfully
 */
TabManager.loadTabs = async function(state, elements, createTabUI, autoExpandTabs) {
  // Mark as not loaded during refresh
  state.initialLoadComplete = false;
  
  // Clear existing timer and pending updates
  if (state.pendingUpdateTimer) {
    clearTimeout(state.pendingUpdateTimer);
    state.pendingUpdateTimer = null;
  }
  state.pendingUpdates.clear();
  
  // Clear retry timer if it exists
  if (state.loadRetryTimer) {
    clearTimeout(state.loadRetryTimer);
    state.loadRetryTimer = null;
  }
  
  // Clear current tabs
  state.currentTabs = [];
  elements.tabsContainer.innerHTML = '';
  
  // First get all tabs
  try {
    const allTabs = await browser.tabs.query({});
    
    // Request an immediate scan for audio tabs
    await browser.runtime.sendMessage({ action: "scanTabsForAudio" });
    
    // Then get audio status info from the background script
    const audioStatusResponse = await browser.runtime.sendMessage({
      action: "getTabAudioStatus"
    });
    const tabAudioStatus = audioStatusResponse.tabAudioStatus || {};
    
    // If a browser-reported audible tab doesn't have a volume yet,
    // we need to get or set the volume (and detect if it really has audio elements)
    const audioTabPromises = allTabs
      .filter(tab => {
        // Keep tabs that are audible or have audio detected
        return tab.audible || tabAudioStatus[tab.id];
      })
      .map(tab => TabManager.getTabVolumeInfo(tab, state));
    
    // Process all potential audio tabs
    const resolvedTabs = await Promise.all(audioTabPromises);
    
    // Filter to tabs that actually have audio
    const audioTabs = resolvedTabs.filter(tab => tab.hasAudio);
    
    // Save tabs and rebuild UI only if the list actually changed
    const needsRebuild = !TabManager.tabListsEqual(state.currentTabs, audioTabs);
    
    if (needsRebuild) {
      elements.tabsContainer.innerHTML = '';
      state.currentTabs = audioTabs;
      
      if (audioTabs.length === 0) {
        // No audio tabs found
        elements.noTabsMessage.style.display = 'block';
        
        // Schedule a retry if this is the initial load and we haven't exceeded max retries
        if (state.loadRetryCount < TabManager.MAX_RETRY_ATTEMPTS) {
          state.loadRetryCount++;
          state.loadRetryTimer = setTimeout(() => {
            console.log(`No audio tabs found. Retry attempt ${state.loadRetryCount}...`);
            TabManager.loadTabs(state, elements, createTabUI, autoExpandTabs);
          }, TabManager.EMPTY_LIST_RETRY_DELAY);
        }
      } else {
        // Create UI for each audio tab
        elements.noTabsMessage.style.display = 'none';
        audioTabs.forEach(tab => {
          const tabElement = createTabUI(tab);
          elements.tabsContainer.appendChild(tabElement);
        });
        
        // Auto-expand tabs if there are few of them
        autoExpandTabs(document.querySelectorAll('.tab-header'), audioTabs.length);
        
        // Reset retry count as we found tabs
        state.loadRetryCount = 0;
      }
    }
    
    // Mark as loaded
    state.initialLoadComplete = true;
    return true;
  } catch (error) {
    console.error('Error loading tabs:', error);
    state.initialLoadComplete = true; // Still mark as loaded to enable updates
    
    // If error occurred and we haven't exceeded max retries, try again
    if (state.loadRetryCount < TabManager.MAX_RETRY_ATTEMPTS) {
      state.loadRetryCount++;
      state.loadRetryTimer = setTimeout(() => {
        console.log(`Error loading tabs. Retry attempt ${state.loadRetryCount}...`);
        TabManager.loadTabs(state, elements, createTabUI, autoExpandTabs);
      }, TabManager.EMPTY_LIST_RETRY_DELAY);
    }
    return false;
  }
};

/**
 * Compare two tab lists to see if they're equal (by id)
 * @param {Array} list1 - First list of tabs
 * @param {Array} list2 - Second list of tabs
 * @returns {boolean} - True if lists are equal
 */
TabManager.tabListsEqual = function(list1, list2) {
  if (list1.length !== list2.length) return false;
  
  // Convert both lists to sets of tab IDs and compare
  const ids1 = new Set(list1.map(tab => tab.id));
  const ids2 = new Set(list2.map(tab => tab.id));
  
  if (ids1.size !== ids2.size) return false;
  
  // Check if all IDs in ids1 are also in ids2
  for (const id of ids1) {
    if (!ids2.has(id)) return false;
  }
  
  return true;
};

/**
 * Update titles for all current tabs from the browser
 * @param {Array} currentTabs - List of current tabs
 * @param {Function} updateTabTitle - Function to update tab title in UI
 * @returns {Promise<boolean>} - True if titles were updated successfully
 */
TabManager.updateAllTabTitles = async function(currentTabs, updateTabTitle) {
  if (currentTabs.length === 0) return false;
  
  try {
    // Get fresh info for all tabs
    const tabPromises = currentTabs.map(tab => 
      browser.tabs.get(tab.id).catch(() => null)  // Return null if tab doesn't exist anymore
    );
    
    const updatedTabs = await Promise.all(tabPromises);
    
    // Update titles for tabs that still exist
    updatedTabs.forEach(updatedTab => {
      if (updatedTab && updatedTab.title) {
        updateTabTitle(updatedTab.id, updatedTab.title);
        
        // Also update the currentTabs array
        const tabIndex = currentTabs.findIndex(tab => tab.id === updatedTab.id);
        if (tabIndex !== -1) {
          currentTabs[tabIndex].title = updatedTab.title;
        }
      }
    });
    
    return true;
  } catch (error) {
    console.error('Error updating tab titles:', error);
    return false;
  }
};

/**
 * Get volume information for a tab - returns a Promise
 * @param {Object} tab - Tab object
 * @param {Object} state - Application state
 * @returns {Promise<Object>} - Tab object with volume information
 */
TabManager.getTabVolumeInfo = function(tab, state) {
  return new Promise(resolve => {
    // Always get the most current tab information first
    browser.tabs.get(tab.id).then(updatedTab => {
      // Use the most up-to-date tab info (especially the title)
      tab = updatedTab;
      
      // Special case for 9GAG - always treat as having audio
      if (tab.url && tab.url.includes('9gag.com')) {
        tab.hasAudio = true;
        tab.volume = TabManager.DEFAULT_VOLUME; // Default volume
        state.tabVolumes[tab.id] = TabManager.DEFAULT_VOLUME;
        resolve(tab);
        return;
      }
      
      // Regular flow for other tabs
      browser.tabs.sendMessage(tab.id, { action: "getVolume" })
        .then(response => {
          if (response && response.volume !== undefined) {
            // Tab has volume control
            tab.volume = response.volume;
            tab.hasAudio = true;
            state.tabVolumes[tab.id] = response.volume;
            resolve(tab);
          } else {
            // Tab doesn't have volume control or couldn't get it
            tab.hasAudio = false;
            resolve(tab);
          }
        })
        .catch(() => {
          // Error fetching volume, tab probably doesn't have audio
          tab.hasAudio = false;
          resolve(tab);
        });
    }).catch(() => {
      // If we can't get the updated tab info, proceed with what we have
      // Special case for 9GAG - always treat as having audio
      if (tab.url && tab.url.includes('9gag.com')) {
        tab.hasAudio = true;
        tab.volume = TabManager.DEFAULT_VOLUME; // Default volume
        state.tabVolumes[tab.id] = TabManager.DEFAULT_VOLUME;
      } else {
        // For other tabs, mark as not having audio if we can't verify
        tab.hasAudio = false;
      }
      resolve(tab);
    });
  });
};

/**
 * Queue a tab update to avoid multiple rapid UI changes
 * @param {Object} state - Application state
 * @param {number} tabId - Tab ID
 * @param {string} action - Action to perform (add or remove)
 */
TabManager.queueTabUpdate = function(state, tabId, action) {
  // Store the action with the tab ID
  state.pendingUpdates.add({ tabId, action });
  
  // Debounce the updates
  if (state.pendingUpdateTimer) {
    clearTimeout(state.pendingUpdateTimer);
  }
  
  state.pendingUpdateTimer = setTimeout(() => {
    TabManager.processPendingUpdates(state);
  }, TabManager.UPDATE_DEBOUNCE_TIME);
};

/**
 * Process all pending tab updates
 * @param {Object} state - Application state
 * @param {Object} handlers - Object containing handler functions
 */
TabManager.processPendingUpdates = function(state, handlers) {
  if (state.pendingUpdates.size === 0) return;
  
  const updates = [...state.pendingUpdates];
  state.pendingUpdates.clear();
  
  // Process removals first to avoid flickering
  const removals = updates.filter(update => update.action === 'remove');
  const additions = updates.filter(update => update.action === 'add');
  
  // Handle removals
  for (const update of removals) {
    handlers.handleTabAudioStopped(update.tabId);
  }
  
  // Handle additions - always process these, regardless of current state
  if (additions.length > 0) {
    Promise.all(additions.map(update => 
      handlers.handleTabAudioStartedAsync(update.tabId)
    )).catch(error => {
      console.error('Error processing tab additions:', error);
    });
  }
};

/**
 * Handle when the active tab is detected
 * @param {number} tabId - ID of the active tab
 * @param {Object} state - Application state
 * @param {Object} elements - UI elements
 * @param {Function} createTabUI - Function to create tab UI
 * @returns {Promise<boolean>} - True if tab was handled successfully
 */
TabManager.handleTabActive = async function(tabId, state, elements, createTabUI) {
  // Check if the active tab is already in our list
  const tabExists = state.currentTabs.some(tab => tab.id === tabId);
  if (tabExists) return true; // Tab is already in the list, nothing to do

  try {
    // Get the tab info and add it to our list
    const tab = await browser.tabs.get(tabId);
    
    // We'll always try to add the active tab, even if it doesn't have audio yet
    // This ensures the current tab is always in the list
    tab.hasAudio = true; // Force it to be treated as having audio
    tab.volume = TabManager.DEFAULT_VOLUME; // Set default volume
    state.tabVolumes[tabId] = TabManager.DEFAULT_VOLUME;
    
    // Add the tab to our list and create UI for it
    state.currentTabs.push(tab);
    const tabElement = createTabUI(tab);
    elements.tabsContainer.appendChild(tabElement);
    
    // Update no tabs message
    if (state.currentTabs.length > 0) {
      elements.noTabsMessage.style.display = 'none';
    }

    console.log(`Active tab ${tabId} added to the list`);
    return true;
  } catch (error) {
    console.error(`Error adding active tab ${tabId}:`, error);
    return false;
  }
};