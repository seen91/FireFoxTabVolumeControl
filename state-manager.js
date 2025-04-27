/**
 * State Manager for Tab Volume Control
 * Handles state persistence, retrieval, and management
 */

// Create namespace to avoid global pollution
const StateManager = {};

/**
 * Create a new state object with default values
 * @returns {Object} New state object with default values
 */
StateManager.createDefaultState = function() {
  return {
    tabVolumes: {},       // Volume settings per tab
    domainVolumes: {},    // Volume settings per domain
    tabAudioStatus: {},   // Which tabs have audio
    tabMediaStatus: {},   // Tabs with media elements (but might not be playing)
    audibleTabs: new Set(), // Set of tabs that are currently audible
    activeTabId: null     // Track the currently active tab
  };
};

/**
 * Convert state to a serializable object for storage
 * @param {Object} state - State object to serialize
 * @returns {Object} Serializable state object
 */
StateManager.getSerializableState = function(state) {
  return {
    ...state,
    audibleTabs: Array.from(state.audibleTabs)
  };
};

/**
 * Restore state from serialized form
 * @param {Object} savedState - Serialized state from storage
 * @returns {Object} Restored state object
 */
StateManager.restoreState = function(savedState) {
  if (!savedState) return StateManager.createDefaultState();
  
  return {
    ...savedState,
    audibleTabs: new Set(savedState.audibleTabs || []),
    activeTabId: savedState.activeTabId || null
  };
};

/**
 * Load state from browser storage
 * @returns {Promise<Object>} Promise resolving to the loaded state
 */
StateManager.loadState = async function() {
  try {
    const result = await browser.storage.local.get(['extensionState']);
    if (result.extensionState) {
      const restoredState = StateManager.restoreState(result.extensionState);
      console.log("Tab Volume Control: State loaded");
      return restoredState;
    } else {
      return StateManager.createDefaultState();
    }
  } catch (error) {
    console.error("Tab Volume Control: Error loading state", error);
    return StateManager.createDefaultState();
  }
};

/**
 * Save state to browser storage
 * @param {Object} state - State object to save
 * @returns {Promise<void>}
 */
StateManager.saveState = async function(state) {
  try {
    await browser.storage.local.set({
      extensionState: StateManager.getSerializableState(state)
    });
    return true;
  } catch (err) {
    console.error("Error saving state:", err);
    return false;
  }
};

/**
 * Load domain-specific volume settings from storage
 * @param {Object} state - State object to update with loaded settings
 * @returns {Promise<Object>} Promise resolving to the updated state
 */
StateManager.loadDomainVolumes = async function(state) {
  try {
    const result = await browser.storage.local.get(['domainVolumes']);
    if (result.domainVolumes) {
      state.domainVolumes = result.domainVolumes;
    }
    console.log("Tab Volume Control: Domain volumes loaded");
    return state;
  } catch (error) {
    console.error("Tab Volume Control: Error loading domain volumes", error);
    return state;
  }
};

/**
 * Save domain-specific volume settings to storage
 * @param {Object} domainVolumes - Domain volume settings to save
 * @returns {Promise<boolean>} Promise resolving to success status
 */
StateManager.saveDomainVolumes = async function(domainVolumes) {
  try {
    await browser.storage.local.set({
      domainVolumes: domainVolumes
    });
    return true;
  } catch (err) {
    console.error("Error saving domain volumes:", err);
    return false;
  }
};

/**
 * Extract domain from URL
 * @param {string} url - URL to extract domain from
 * @returns {string|null} Extracted domain or null if invalid URL
 */
StateManager.getDomainFromUrl = function(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (e) {
    return null;
  }
};

/**
 * Add tab to audible tabs and update status
 * @param {Object} state - State object to update
 * @param {number} tabId - ID of the tab to add
 * @returns {boolean} True if this is a newly audible tab
 */
StateManager.addAudibleTab = function(state, tabId) {
  const wasAudible = state.audibleTabs.has(tabId);
  state.audibleTabs.add(tabId);
  state.tabAudioStatus[tabId] = true;
  return !wasAudible;
};

/**
 * Remove tab from audible tabs
 * @param {Object} state - State object to update
 * @param {number} tabId - ID of the tab to remove
 * @returns {boolean} True if tab was previously audible
 */
StateManager.removeAudibleTab = function(state, tabId) {
  const wasAudible = state.audibleTabs.has(tabId);
  state.audibleTabs.delete(tabId);
  return wasAudible;
};

/**
 * Update volume for a specific tab
 * @param {Object} state - State object to update
 * @param {number} tabId - Tab ID to update
 * @param {number} volume - Volume level (0.0 to 5.0)
 * @returns {Object} Updated state
 */
StateManager.updateTabVolume = function(state, tabId, volume) {
  state.tabVolumes[tabId] = volume;
  state.tabAudioStatus[tabId] = true;
  return state;
};

/**
 * Update volume for a specific domain
 * @param {Object} state - State object to update
 * @param {string} domain - Domain to update
 * @param {number} volume - Volume level (0.0 to 5.0)
 * @returns {Object} Updated state
 */
StateManager.updateDomainVolume = function(state, domain, volume) {
  if (domain) {
    state.domainVolumes[domain] = volume;
  }
  return state;
};

/**
 * Clean up tab data when a tab is removed
 * @param {Object} state - State object to update
 * @param {number} tabId - ID of the tab being removed
 * @returns {Object} Updated state
 */
StateManager.cleanupTabData = function(state, tabId) {
  // Clean up storage
  if (state.tabVolumes[tabId]) {
    delete state.tabVolumes[tabId];
  }
  
  if (state.tabAudioStatus[tabId]) {
    delete state.tabAudioStatus[tabId];
  }
  
  if (state.tabMediaStatus[tabId]) {
    delete state.tabMediaStatus[tabId];
  }
  
  state.audibleTabs.delete(tabId);
  
  return state;
};

/**
 * Update active tab ID
 * @param {Object} state - State object to update
 * @param {number} tabId - New active tab ID
 * @returns {Object} Updated state with previous and current active tab IDs
 */
StateManager.updateActiveTab = function(state, tabId) {
  const previousActiveTab = state.activeTabId;
  state.activeTabId = tabId;
  
  return {
    ...state,
    previousActiveTab
  };
};