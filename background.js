/**
 * Background script for Tab Volume Control
 * Manages tab state, volume settings, and persistent storage
 */

// Constants
const SCAN_INTERVAL = 15000;   // Scan for audio tabs every 15 seconds
const DETECTION_DELAY = 2000;  // Delay for audio detection after tab loads
const VOLUME_APPLY_DELAY = 1500; // Delay for applying volume settings

// State
const state = {
  tabVolumes: {},       // Volume settings per tab
  domainVolumes: {},    // Volume settings per domain
  tabAudioStatus: {},   // Which tabs have audio
  tabMediaStatus: {},   // Tabs with media elements (but might not be playing)
  audibleTabs: new Set() // Set of tabs that are currently audible according to browser
};

/**
 * Initialize the extension
 */
function initializeExtension() {
  console.log("Tab Volume Control: Extension initialized");
  
  // Load saved settings
  loadSettings();
  
  // Initial scan for tabs with audio
  scanTabsForAudio();
  
  // Set up periodic scanning
  setInterval(scanTabsForAudio, SCAN_INTERVAL);
}

/**
 * Load settings from storage
 */
function loadSettings() {
  browser.storage.local.get(['domainVolumes'])
    .then((result) => {
      if (result.domainVolumes) {
        state.domainVolumes = result.domainVolumes;
      }
      console.log("Tab Volume Control: Settings loaded");
    })
    .catch((error) => {
      console.error("Tab Volume Control: Error loading settings", error);
    });
}

/**
 * Save domain volume settings to storage
 */
function saveDomainVolumes() {
  browser.storage.local.set({
    domainVolumes: state.domainVolumes
  }).catch(err => console.error("Error saving domain volumes:", err));
}

/**
 * Get domain from URL
 * @param {string} url - The URL to extract domain from
 * @returns {string|null} Domain or null if invalid URL
 */
function getDomainFromUrl(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (e) {
    return null;
  }
}

/**
 * Scan all tabs to find ones with audio
 */
function scanTabsForAudio() {
  browser.tabs.query({})
    .then(tabs => {
      // Reset audible tabs
      state.audibleTabs.clear();
      
      tabs.forEach(tab => {
        // Update audible status from browser
        if (tab.audible) {
          state.audibleTabs.add(tab.id);
          state.tabAudioStatus[tab.id] = true;
        }
        
        // Try to detect audio elements
        tryDetectAudio(tab.id);
      });
    });
}

/**
 * Try to detect audio in a tab
 * @param {number} tabId - Tab ID to check
 */
function tryDetectAudio(tabId) {
  browser.tabs.sendMessage(tabId, { action: "checkForAudio" })
    .then(response => {
      if (response) {
        // Update our knowledge of this tab's audio status
        if (response.hasAudio) {
          state.tabAudioStatus[tabId] = true;
        }
        
        // Track media elements separately
        if (response.hasMediaElements) {
          state.tabMediaStatus[tabId] = true;
        }
        
        // If the tab reports active audio, make sure it's in our audible list
        if (response.hasActiveAudio) {
          state.audibleTabs.add(tabId);
          state.tabAudioStatus[tabId] = true;
        }
      }
    })
    .catch(() => {
      // Ignore errors - content script may not be loaded yet
    });
}

/**
 * Apply volume to a tab
 * @param {number} tabId - Tab ID to apply volume to
 * @param {number} volume - Volume level (0.0 to 5.0)
 */
function applyVolumeToTab(tabId, volume) {
  setTimeout(() => {
    browser.tabs.sendMessage(tabId, {
      action: "setVolume",
      volume: volume
    }).catch(() => {
      // Content script might not be loaded yet, which is fine
    });
  }, VOLUME_APPLY_DELAY);
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
  // Tab updates
  browser.tabs.onUpdated.addListener(handleTabUpdated);
  
  // Tab removal
  browser.tabs.onRemoved.addListener(handleTabRemoved);
  
  // Messages from content scripts and popup
  browser.runtime.onMessage.addListener(handleMessage);
}

/**
 * Handle tab updated event
 * @param {number} tabId - ID of the updated tab
 * @param {object} changeInfo - Information about the change
 * @param {object} tab - Tab object
 */
function handleTabUpdated(tabId, changeInfo, tab) {
  // Track if tab becomes audible
  if (changeInfo.audible !== undefined) {
    if (changeInfo.audible) {
      state.audibleTabs.add(tabId);
      state.tabAudioStatus[tabId] = true;
    } else {
      state.audibleTabs.delete(tabId);
      // Don't clear tabAudioStatus here, as it's used for tab listing
    }
  }
  
  if (changeInfo.status === 'complete' && tab.url) {
    // Check for domain-specific volume setting
    const domain = getDomainFromUrl(tab.url);
    if (domain && state.domainVolumes[domain]) {
      applyVolumeToTab(tabId, state.domainVolumes[domain]);
    }
    
    // Try to detect audio after a short delay
    setTimeout(() => {
      tryDetectAudio(tabId);
    }, DETECTION_DELAY);
  }
}

/**
 * Handle tab removed event
 * @param {number} tabId - ID of the removed tab
 */
function handleTabRemoved(tabId) {
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
}

/**
 * Handle messages from content scripts and popup
 * @param {object} message - Message object
 * @param {object} sender - Sender information
 * @param {function} sendResponse - Function to send response
 * @returns {boolean} True if response will be sent asynchronously
 */
function handleMessage(message, sender, sendResponse) {
  // Handle volume change notification from content script
  if (message.action === "volumeChanged" && sender.tab) {
    const tabId = sender.tab.id;
    const volume = message.volume;
    
    // Store in tab-specific settings
    state.tabVolumes[tabId] = volume;
    
    // Mark this tab as having audio
    state.tabAudioStatus[tabId] = true;
    
    // Apply to domain if requested
    if (message.applyToDomain && sender.tab.url) {
      const domain = getDomainFromUrl(sender.tab.url);
      if (domain) {
        state.domainVolumes[domain] = volume;
        saveDomainVolumes();
      }
    }
  }
  
  // Handle request for domain volume
  else if (message.action === "getDomainVolume" && sender.tab && sender.tab.url) {
    const domain = getDomainFromUrl(sender.tab.url);
    if (domain && state.domainVolumes[domain]) {
      sendResponse({ volume: state.domainVolumes[domain] });
    } else {
      sendResponse({ volume: null });
    }
    return true;
  }
  
  // Handle request for tab audio status
  else if (message.action === "getTabAudioStatus") {
    // Create filtered copy to only return tabs that are actually audible
    const audiblTabsObj = {};
    
    // First check browser's audible status
    state.audibleTabs.forEach(tabId => {
      audiblTabsObj[tabId] = true;
    });
    
    // Then check our own tracking
    for (const [tabId, hasAudio] of Object.entries(state.tabAudioStatus)) {
      if (hasAudio && (state.audibleTabs.has(parseInt(tabId)))) {
        audiblTabsObj[tabId] = true;
      }
    }
    
    sendResponse({ tabAudioStatus: audiblTabsObj });
    return true;
  }
  
  // Handle request to save domain volume
  else if (message.action === "saveDomainVolume" && sender.tab && sender.tab.url) {
    const domain = getDomainFromUrl(sender.tab.url);
    if (domain) {
      state.domainVolumes[domain] = message.volume;
      saveDomainVolumes();
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false });
    }
    return true;
  }
  
  // Handle request to get volume for a tab
  else if (message.action === "getTabVolume") {
    const tabId = message.tabId;
    if (state.tabVolumes[tabId]) {
      sendResponse({ volume: state.tabVolumes[tabId] });
    } else {
      sendResponse({ volume: null });
    }
    return true;
  }
  
  // Handle notification that a tab has audio
  else if (message.action === "notifyAudio" && sender.tab) {
    const tabId = sender.tab.id;
    state.tabAudioStatus[tabId] = true;
    
    // If it's actively playing audio, add to audible tabs
    if (message.hasActiveAudio) {
      state.audibleTabs.add(tabId);
    }
    
    sendResponse({ success: true });
    return true;
  }
}

// Set up event listeners
setupEventListeners();

// Initialize the extension
initializeExtension();