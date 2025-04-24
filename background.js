/**
 * Background script for Tab Volume Control - Service Worker Version
 * Manages tab state, volume settings, and persistent storage
 */

// Constants
const SCAN_INTERVAL = 15000;   // Scan for audio tabs every 15 seconds
const DETECTION_DELAY = 2000;  // Delay for audio detection after tab loads
const VOLUME_APPLY_DELAY = 1500; // Delay for applying volume settings
const INITIAL_SCAN_DELAY = 500; // Shorter delay for initial scan after popup opens

// State
// Note: In service workers, you must explicitly persist state,
// as the worker can be terminated and restarted
let state = {
  tabVolumes: {},       // Volume settings per tab
  domainVolumes: {},    // Volume settings per domain
  tabAudioStatus: {},   // Which tabs have audio
  tabMediaStatus: {},   // Tabs with media elements (but might not be playing)
  audibleTabs: new Set(), // Set of tabs that are currently audible
  activeTabId: null     // Track the currently active tab
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
    audibleTabs: new Set(savedState.audibleTabs || []),
    activeTabId: savedState.activeTabId || null
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
  
  // Get current active tab
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (tabs.length > 0) {
      state.activeTabId = tabs[0].id;
      console.log("Tab Volume Control: Active tab detected:", state.activeTabId);
    }
  } catch (error) {
    console.error("Tab Volume Control: Error getting active tab", error);
  }
  
  // Initial scan for tabs with audio
  await scanTabsForAudio();
  
  // Set up periodic scanning
  createScanInterval();
  
  // Listen for popup connections to trigger immediate scans
  browser.runtime.onConnect.addListener(handlePopupConnection);
  
  // Set up tab activated listener to track active tab
  browser.tabs.onActivated.addListener(handleTabActivated);
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
  // Use setTimeout for periodic scanning instead of alarms
  function scheduleNextScan() {
    setTimeout(() => {
      scanTabsForAudio().then(() => {
        scheduleNextScan();
      }).catch(error => {
        console.error("Error during tab scan:", error);
        scheduleNextScan(); // Still schedule next scan even if there was an error
      });
    }, SCAN_INTERVAL);
  }
  
  // Start the first scan
  scheduleNextScan();
  
  // Also do an immediate scan
  scanTabsForAudio().catch(error => {
    console.error("Error during initial tab scan:", error);
  });
}

/**
 * Scan all tabs to find ones with audio
 */
async function scanTabsForAudio() {
  try {
    const tabs = await browser.tabs.query({});
    
    // Keep track of previous audible tabs to detect changes
    const previousAudibleTabs = new Set(state.audibleTabs);
    let audioStatusChanged = false;
    
    // Track current tabs with audio for comparison
    const currentAudibleTabs = new Set();
    
    for (const tab of tabs) {
      // Update audible status from browser
      if (tab.audible) {
        currentAudibleTabs.add(tab.id);
        state.tabAudioStatus[tab.id] = true;
        
        // Notify if this is a newly audible tab or one that was previously audible
        // but might have been removed from the popup
        if (!state.audibleTabs.has(tab.id)) {
          notifyTabAudioStarted(tab.id);
          audioStatusChanged = true;
        }
      }
      
      // Try to detect audio elements even if the tab is not currently audible
      // This helps identify tabs that have audio capability but aren't playing
      tryDetectAudio(tab.id);
    }
    
    // Update the audible tabs set
    state.audibleTabs = currentAudibleTabs;
    
    // Notify about tabs that stopped being audible
    for (const tabId of previousAudibleTabs) {
      if (!currentAudibleTabs.has(tabId)) {
        // Tab is no longer audible
        notifyTabAudioStopped(tabId);
        audioStatusChanged = true;
      }
    }
    
    // Only notify that the list has been updated if there were actual changes
    if (audioStatusChanged) {
      notifyTabAudioListUpdated();
    }
    
    // Save updated state
    await saveState();
  } catch (error) {
    console.error("Error scanning tabs:", error);
  }
}

/**
 * Notify that a tab has started playing audio
 * @param {number} tabId - ID of the tab
 */
function notifyTabAudioStarted(tabId) {
  browser.runtime.sendMessage({
    action: "tabAudioStarted",
    tabId: tabId
  }).catch(() => {
    // Popup might not be open, which is fine
  });
}

/**
 * Notify that a tab has stopped playing audio
 * @param {number} tabId - ID of the tab
 */
function notifyTabAudioStopped(tabId) {
  browser.runtime.sendMessage({
    action: "tabAudioStopped",
    tabId: tabId
  }).catch(() => {
    // Popup might not be open, which is fine
  });
}

// Use a debouncer for tab list updates to avoid excessive notifications
let tabListUpdateTimer = null;
const TAB_LIST_UPDATE_DEBOUNCE = 500; // ms

/**
 * Notify that the tab audio list has been updated
 */
function notifyTabAudioListUpdated() {
  // Debounce this notification
  if (tabListUpdateTimer) {
    clearTimeout(tabListUpdateTimer);
  }
  
  tabListUpdateTimer = setTimeout(() => {
    browser.runtime.sendMessage({
      action: "tabAudioListUpdated"
    }).catch(() => {
      // Popup might not be open, which is fine
    });
    tabListUpdateTimer = null;
  }, TAB_LIST_UPDATE_DEBOUNCE);
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
      
      // If a tab was previously audible and now has audio content again
      // make sure to notify the popup
      if (tab.audible && !state.audibleTabs.has(tabId)) {
        state.audibleTabs.add(tabId);
        notifyTabAudioStarted(tabId);
      }
      return;
    }
    
    // Normal detection for other sites
    browser.tabs.sendMessage(tabId, { action: "checkForAudio" })
      .then(response => {
        const previouslyHadAudio = state.tabAudioStatus[tabId];
        
        if (response && response.hasAudio) {
          state.tabAudioStatus[tabId] = true;
          
          // If the tab has audio elements and is audible, but wasn't previously tracked
          // as audible, make sure to notify the popup
          if (tab.audible && !state.audibleTabs.has(tabId)) {
            state.audibleTabs.add(tabId);
            notifyTabAudioStarted(tabId);
          }
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
    const wasAudible = state.audibleTabs.has(tabId);
    
    if (changeInfo.audible) {
      state.audibleTabs.add(tabId);
      state.tabAudioStatus[tabId] = true;
      
      // Always notify when a tab becomes audible
      // This ensures that tabs that start playing again are added back to the popup
      notifyTabAudioStarted(tabId);
    } else if (wasAudible) {
      state.audibleTabs.delete(tabId);
      
      // Notify if the tab is no longer audible
      notifyTabAudioStopped(tabId);
    }
    
    // Save updated state
    await saveState();
  }
  
  // Add notification for title changes if the tab has audio status or is audible
  if (changeInfo.title) {
    // Send title updates for any tab that either has audio or is marked as having audio capabilities
    if (state.audibleTabs.has(tabId) || state.tabAudioStatus[tabId] || tab.audible) {
      notifyTabTitleChanged(tabId, changeInfo.title);
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
 * Notify that a tab's title has changed
 * @param {number} tabId - ID of the tab
 * @param {string} title - New title
 */
function notifyTabTitleChanged(tabId, title) {
  browser.runtime.sendMessage({
    action: "tabTitleChanged",
    tabId: tabId,
    title: title
  }).catch(() => {
    // Popup might not be open, which is fine
  });
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
    
    // If it's actively playing audio, add to audible tabs and notify the popup
    if (message.hasActiveAudio) {
      const wasAudible = state.audibleTabs.has(tabId);
      state.audibleTabs.add(tabId);
      
      // Notify the popup if this is a newly audible tab
      if (!wasAudible) {
        notifyTabAudioStarted(tabId);
      }
    }
    
    // Save updated state
    await saveState();
    return { success: true };
  }
  
  // Handle request to scan for audio tabs
  else if (message.action === "scanTabsForAudio") {
    // Connect back to the popup to let it know when scan is complete
    if (sender.id === browser.runtime.id && !sender.tab) {
      // This is from our popup, establish a connection if possible
      try {
        const port = browser.runtime.connect({ name: "popup" });
        port.onDisconnect.addListener(() => {
          // Handle popup disconnect if needed
        });
      } catch (err) {
        // Connection failed, popup might have closed already
      }
    }
    
    await scanTabsForAudio();
    return { success: true };
  }
}

/**
 * Handle popup connection to trigger immediate audio scan
 * @param {Port} port - The connection port
 */
function handlePopupConnection(port) {
  if (port.name === "popup") {
    // Run an immediate scan when popup connects
    setTimeout(() => {
      scanTabsForAudio().catch(error => {
        console.error("Error during popup-triggered scan:", error);
      });
    }, INITIAL_SCAN_DELAY);
    
    port.onDisconnect.addListener(() => {
      // Cleanup if needed when popup closes
    });
  }
}

/**
 * Handle tab activated event - track the currently active tab
 * @param {object} activeInfo - Object containing tabId and windowId
 */
async function handleTabActivated(activeInfo) {
  const previousActiveTab = state.activeTabId;
  state.activeTabId = activeInfo.tabId;
  
  console.log("Tab Volume Control: Active tab changed:", state.activeTabId);
  
  // Save updated state
  await saveState();
  
  // If the active tab was not in the audio list, notify the popup to add it
  try {
    const tab = await browser.tabs.get(state.activeTabId);
    if (tab && !state.audibleTabs.has(tab.id) && !state.tabAudioStatus[tab.id]) {
      // Notify the popup that it should keep this tab in the list
      browser.runtime.sendMessage({
        action: "activeTabChanged",
        tabId: tab.id
      }).catch(() => {
        // Popup might not be open, which is fine
      });
    }
  } catch (error) {
    console.error("Tab Volume Control: Error getting active tab info", error);
  }
}

// Set up event listeners
browser.tabs.onUpdated.addListener(handleTabUpdated);
browser.tabs.onRemoved.addListener(handleTabRemoved);
browser.runtime.onMessage.addListener(handleMessage);

// Initialize the extension
initializeExtension();