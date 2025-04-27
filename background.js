/**
 * Background script for Tab Volume Control - Service Worker Version
 * Manages tab state, volume settings, and persistent storage
 */

// Constants
const SCAN_INTERVAL = 15000;   // Scan for audio tabs every 15 seconds
const VOLUME_APPLY_DELAY = 1500; // Delay for applying volume settings
const INITIAL_SCAN_DELAY = 500; // Shorter delay for initial scan after popup opens

// State
let state = StateManager.createDefaultState();

/**
 * Initialize the extension
 */
async function initializeExtension() {
  console.log("Tab Volume Control: Extension initialized (Service Worker)");
  
  // Load state from storage if available
  state = await StateManager.loadState();
  
  // Load settings
  state = await StateManager.loadDomainVolumes(state);
  
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
  TabAudioDetector.createScanInterval(scanTabsForAudio, SCAN_INTERVAL);
  
  // Listen for popup connections to trigger immediate scans
  browser.runtime.onConnect.addListener(handlePopupConnection);
  
  // Set up tab activated listener to track active tab
  browser.tabs.onActivated.addListener(handleTabActivated);
}

/**
 * Save state to storage
 */
async function saveState() {
  return await StateManager.saveState(state);
}

/**
 * Save domain volume settings to storage
 */
async function saveDomainVolumes() {
  return await StateManager.saveDomainVolumes(state.domainVolumes);
}

/**
 * Get domain from URL
 * @param {string} url - The URL to extract domain from
 * @returns {string|null} Domain or null if invalid URL
 */
function getDomainFromUrl(url) {
  return StateManager.getDomainFromUrl(url);
}

/**
 * Scan all tabs to find ones with audio
 */
async function scanTabsForAudio() {
  return await TabAudioDetector.scanTabsForAudio(
    state,
    NotificationManager.notifyTabAudioStarted,
    NotificationManager.notifyTabAudioStopped,
    NotificationManager.notifyTabAudioListUpdated,
    saveState
  );
}

/**
 * Notify that a tab has started playing audio
 * @param {number} tabId - ID of the tab
 */
function notifyTabAudioStarted(tabId) {
  NotificationManager.notifyTabAudioStarted(tabId);
}

/**
 * Notify that a tab has stopped playing audio
 * @param {number} tabId - ID of the tab
 */
function notifyTabAudioStopped(tabId) {
  NotificationManager.notifyTabAudioStopped(tabId);
}

/**
 * Notify that the tab audio list has been updated
 */
function notifyTabAudioListUpdated() {
  NotificationManager.notifyTabAudioListUpdated();
}

/**
 * Try to detect audio in a tab
 * @param {number} tabId - Tab ID to check
 */
function tryDetectAudio(tabId) {
  TabAudioDetector.tryDetectAudio(
    tabId, 
    state, 
    NotificationManager.notifyTabAudioStarted
  );
}

/**
 * Apply volume to a tab
 * @param {number} tabId - Tab ID to apply volume to
 * @param {number} volume - Volume level (0.0 to 5.0)
 */
function applyVolumeToTab(tabId, volume) {
  TabAudioDetector.applyVolumeToTab(tabId, volume, VOLUME_APPLY_DELAY);
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
    let audioStatusChanged = false;
    
    if (changeInfo.audible) {
      // Add tab to audible tabs using StateManager
      const wasNewlyAdded = StateManager.addAudibleTab(state, tabId);
      
      // Always notify when a tab becomes audible
      // This ensures that tabs that start playing again are added back to the popup
      notifyTabAudioStarted(tabId);
      audioStatusChanged = true;
    } else {
      // Remove tab from audible tabs using StateManager
      const wasRemoved = StateManager.removeAudibleTab(state, tabId);
      
      // Notify if the tab is no longer audible
      if (wasRemoved) {
        notifyTabAudioStopped(tabId);
        audioStatusChanged = true;
      }
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
    const domain = StateManager.getDomainFromUrl(tab.url);
    if (domain && state.domainVolumes[domain]) {
      applyVolumeToTab(tabId, state.domainVolumes[domain]);
    }
    
    // Try to detect audio after a short delay
    setTimeout(() => {
      tryDetectAudio(tabId);
    }, TabAudioDetector.DETECTION_DELAY);
  }
}

/**
 * Notify that a tab's title has changed
 * @param {number} tabId - ID of the tab
 * @param {string} title - New title
 */
function notifyTabTitleChanged(tabId, title) {
  NotificationManager.notifyTabTitleChanged(tabId, title);
}

/**
 * Handle tab removed event
 * @param {number} tabId - ID of the removed tab
 */
async function handleTabRemoved(tabId) {
  // Use StateManager to clean up tab data
  state = StateManager.cleanupTabData(state, tabId);
  
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
    
    // Store in tab-specific settings using StateManager
    state = StateManager.updateTabVolume(state, tabId, volume);
    
    // Apply to domain if requested
    if (message.applyToDomain && sender.tab.url) {
      const domain = StateManager.getDomainFromUrl(sender.tab.url);
      if (domain) {
        state = StateManager.updateDomainVolume(state, domain, volume);
        await saveDomainVolumes();
      }
    }
    
    // Save updated state
    await saveState();
    return;
  }
  
  // Handle request for domain volume
  else if (message.action === "getDomainVolume" && sender.tab && sender.tab.url) {
    const domain = StateManager.getDomainFromUrl(sender.tab.url);
    if (domain && state.domainVolumes[domain]) {
      return { volume: state.domainVolumes[domain] };
    } else {
      return { volume: null };
    }
  }
  
  // Handle request for tab audio status
  else if (message.action === "getTabAudioStatus") {
    // Create filtered copy to only return tabs that are actually audible
    const audibleTabsObj = {};
    
    // First check browser's audible status
    state.audibleTabs.forEach(tabId => {
      audibleTabsObj[tabId] = true;
    });
    
    // Then check our own tracking
    for (const [tabId, hasAudio] of Object.entries(state.tabAudioStatus)) {
      if (hasAudio && (state.audibleTabs.has(parseInt(tabId)))) {
        audibleTabsObj[tabId] = true;
      }
    }
    
    return { tabAudioStatus: audibleTabsObj };
  }
  
  // Handle request to save domain volume
  else if (message.action === "saveDomainVolume" && sender.tab && sender.tab.url) {
    const domain = StateManager.getDomainFromUrl(sender.tab.url);
    if (domain) {
      state = StateManager.updateDomainVolume(state, domain, message.volume);
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
      const wasNewlyAdded = StateManager.addAudibleTab(state, tabId);
      
      // Notify the popup if this is a newly audible tab
      if (wasNewlyAdded) {
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
  const updatedState = StateManager.updateActiveTab(state, activeInfo.tabId);
  state = updatedState;
  
  console.log("Tab Volume Control: Active tab changed:", state.activeTabId);
  
  // Save updated state
  await saveState();
  
  // If the active tab was not in the audio list, notify the popup to add it
  try {
    const tab = await browser.tabs.get(state.activeTabId);
    if (tab && !state.audibleTabs.has(tab.id) && !state.tabAudioStatus[tab.id]) {
      // Notify the popup that it should keep this tab in the list
      NotificationManager.notifyActiveTabChanged(tab.id);
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