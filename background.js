/**
 * Background script for Tab Volume Control - Service Worker Version
 * Manages tab state, volume settings, and persistent storage
 */

// Constants
const SCAN_INTERVAL = 15000;   // Scan for audio tabs every 15 seconds
const DETECTION_DELAY = 2000;  // Delay for audio detection after tab loads
const VOLUME_APPLY_DELAY = 1500; // Delay for applying volume settings

// State
// Note: In service workers, you must explicitly persist state,
// as the worker can be terminated and restarted
let state = {
  tabVolumes: {},       // Volume settings per tab
  domainVolumes: {},    // Volume settings per domain
  tabAudioStatus: {},   // Which tabs have audio
  tabMediaStatus: {},   // Tabs with media elements (but might not be playing)
  audibleTabs: new Set() // Set of tabs that are currently audible
};

// Convert Set to array for serialization
function getSerializableState() {
  return {
    ...state,
    audibleTabs: Array.from(state.audibleTabs)
  };
}

// Restore Set from array after deserialization
function restoreState(savedState) {
  if (!savedState) return;
  
  state = {
    ...savedState,
    audibleTabs: new Set(savedState.audibleTabs || [])
  };
}

/**
 * Initialize the extension
 */
async function initializeExtension() {
  console.log("Tab Volume Control: Extension initialized (Service Worker)");
  
  // Load state from storage if available
  await loadState();
  
  // Load settings
  await loadSettings();
  
  // Initial scan for tabs with audio
  await scanTabsForAudio();
  
  // Set up periodic scanning
  createScanInterval();
}

/**
 * Load state from storage
 */
async function loadState() {
  try {
    const result = await browser.storage.local.get(['extensionState']);
    if (result.extensionState) {
      restoreState(result.extensionState);
      console.log("Tab Volume Control: State loaded");
    }
  } catch (error) {
    console.error("Tab Volume Control: Error loading state", error);
  }
}

/**
 * Save state to storage
 */
async function saveState() {
  try {
    await browser.storage.local.set({
      extensionState: getSerializableState()
    });
  } catch (err) {
    console.error("Error saving state:", err);
  }
}

/**
 * Load settings from storage
 */
async function loadSettings() {
  try {
    const result = await browser.storage.local.get(['domainVolumes']);
    if (result.domainVolumes) {
      state.domainVolumes = result.domainVolumes;
    }
    console.log("Tab Volume Control: Settings loaded");
  } catch (error) {
    console.error("Tab Volume Control: Error loading settings", error);
  }
}

/**
 * Save domain volume settings to storage
 */
async function saveDomainVolumes() {
  try {
    await browser.storage.local.set({
      domainVolumes: state.domainVolumes
    });
  } catch (err) {
    console.error("Error saving domain volumes:", err);
  }
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
 * Create interval for scanning tabs
 */
function createScanInterval() {
  // Service workers don't support setInterval directly
  // Use an alarm instead
  browser.alarms.create('scanTabs', {
    periodInMinutes: SCAN_INTERVAL / 60000
  });
  
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'scanTabs') {
      scanTabsForAudio();
    }
  });
}

/**
 * Scan all tabs to find ones with audio
 */
async function scanTabsForAudio() {
  try {
    const tabs = await browser.tabs.query({});
    
    // Reset audible tabs
    state.audibleTabs.clear();
    
    for (const tab of tabs) {
      // Update audible status from browser
      if (tab.audible) {
        state.audibleTabs.add(tab.id);
        state.tabAudioStatus[tab.id] = true;
      }
      
      // Try to detect audio elements
      tryDetectAudio(tab.id);
    }
    
    // Save updated state
    await saveState();
  } catch (error) {
    console.error("Error scanning tabs:", error);
  }
}

function is9GAGTab(tab) {
  try {
    return tab.url && tab.url.includes('9gag.com');
  } catch (e) {
    return false;
  }
}

/**
 * Try to detect audio in a tab
 * @param {number} tabId - Tab ID to check
 */
function tryDetectAudio(tabId) {
  browser.tabs.get(tabId).then(tab => {
    // Special case for 9GAG
    if (is9GAGTab(tab)) {
      state.tabAudioStatus[tabId] = true;
      return;
    }
    
    // Normal detection for other sites
    browser.tabs.sendMessage(tabId, { action: "checkForAudio" })
      .then(response => {
        if (response && response.hasAudio) {
          state.tabAudioStatus[tabId] = true;
        }
      })
      .catch(() => {
        // Ignore errors - content script may not be loaded yet
      });
  }).catch(() => {
    // Tab might not exist anymore
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
 * Handle tab updated event
 * @param {number} tabId - ID of the updated tab
 * @param {object} changeInfo - Information about the change
 * @param {object} tab - Tab object
 */
async function handleTabUpdated(tabId, changeInfo, tab) {
  // Track if tab becomes audible
  if (changeInfo.audible !== undefined) {
    if (changeInfo.audible) {
      state.audibleTabs.add(tabId);
      state.tabAudioStatus[tabId] = true;
    } else {
      state.audibleTabs.delete(tabId);
      // Don't clear tabAudioStatus here, as it's used for tab listing
    }
    
    // Save updated state
    await saveState();
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
async function handleTabRemoved(tabId) {
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
  
  // Save updated state
  await saveState();
}

/**
 * Handle messages from content scripts and popup
 * @param {object} message - Message object
 * @param {object} sender - Sender information
 * @returns {Promise} Promise that resolves with a response
 */
async function handleMessage(message, sender) {
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
        await saveDomainVolumes();
      }
    }
    
    // Save updated state
    await saveState();
    return;
  }
  
  // Handle request for domain volume
  else if (message.action === "getDomainVolume" && sender.tab && sender.tab.url) {
    const domain = getDomainFromUrl(sender.tab.url);
    if (domain && state.domainVolumes[domain]) {
      return { volume: state.domainVolumes[domain] };
    } else {
      return { volume: null };
    }
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
    
    return { tabAudioStatus: audiblTabsObj };
  }
  
  // Handle request to save domain volume
  else if (message.action === "saveDomainVolume" && sender.tab && sender.tab.url) {
    const domain = getDomainFromUrl(sender.tab.url);
    if (domain) {
      state.domainVolumes[domain] = message.volume;
      await saveDomainVolumes();
      return { success: true };
    } else {
      return { success: false };
    }
  }
  
  // Handle request to get volume for a tab
  else if (message.action === "getTabVolume") {
    const tabId = message.tabId;
    if (state.tabVolumes[tabId]) {
      return { volume: state.tabVolumes[tabId] };
    } else {
      return { volume: null };
    }
  }
  
  // Handle notification that a tab has audio
  else if (message.action === "notifyAudio" && sender.tab) {
    const tabId = sender.tab.id;
    state.tabAudioStatus[tabId] = true;
    
    // If it's actively playing audio, add to audible tabs
    if (message.hasActiveAudio) {
      state.audibleTabs.add(tabId);
    }
    
    // Save updated state
    await saveState();
    return { success: true };
  }
}

// Set up event listeners
browser.tabs.onUpdated.addListener(handleTabUpdated);
browser.tabs.onRemoved.addListener(handleTabRemoved);
browser.runtime.onMessage.addListener(handleMessage);

// Initialize the extension
initializeExtension();