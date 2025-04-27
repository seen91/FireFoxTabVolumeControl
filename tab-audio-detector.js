/**
 * Tab Audio Detector for Tab Volume Control
 * Handles detection of audio capabilities in tabs
 */

// Create namespace to avoid global pollution
const TabAudioDetector = {};

// Constants
TabAudioDetector.DETECTION_DELAY = 2000;  // Delay for audio detection after tab loads

/**
 * Scan all tabs to find ones with audio
 * @param {Object} state - Global state object
 * @param {Function} notifyTabAudioStarted - Function to notify about tab audio starting
 * @param {Function} notifyTabAudioStopped - Function to notify about tab audio stopping
 * @param {Function} notifyTabAudioListUpdated - Function to notify about tab audio list updates
 * @param {Function} saveState - Function to save the state
 * @returns {Promise<boolean>} - Success status
 */
TabAudioDetector.scanTabsForAudio = async function(
  state, 
  notifyTabAudioStarted, 
  notifyTabAudioStopped, 
  notifyTabAudioListUpdated,
  saveState
) {
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
      TabAudioDetector.tryDetectAudio(tab.id, state, notifyTabAudioStarted);
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
    return true;
  } catch (error) {
    console.error("Error scanning tabs:", error);
    return false;
  }
};

/**
 * Check if a tab is a 9GAG tab
 * @param {Object} tab - Tab object to check
 * @returns {boolean} - True if the tab is a 9GAG tab
 */
TabAudioDetector.is9GAGTab = function(tab) {
  try {
    return tab.url && tab.url.includes('9gag.com');
  } catch (e) {
    return false;
  }
};

/**
 * Try to detect audio in a tab
 * @param {number} tabId - ID of the tab to check
 * @param {Object} state - Global state object
 * @param {Function} notifyTabAudioStarted - Function to notify about tab audio starting
 */
TabAudioDetector.tryDetectAudio = function(tabId, state, notifyTabAudioStarted) {
  browser.tabs.get(tabId).then(tab => {
    // Special case for 9GAG
    if (TabAudioDetector.is9GAGTab(tab)) {
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
};

/**
 * Create interval for scanning tabs
 * @param {Function} scanTabsForAudio - Function to scan tabs for audio
 * @param {number} scanInterval - Interval between scans in milliseconds
 */
TabAudioDetector.createScanInterval = function(scanTabsForAudio, scanInterval) {
  // Use setTimeout for periodic scanning instead of alarms
  function scheduleNextScan() {
    setTimeout(() => {
      scanTabsForAudio().then(() => {
        scheduleNextScan();
      }).catch(error => {
        console.error("Error during tab scan:", error);
        scheduleNextScan(); // Still schedule next scan even if there was an error
      });
    }, scanInterval);
  }
  
  // Start the first scan
  scheduleNextScan();
  
  // Also do an immediate scan
  scanTabsForAudio().catch(error => {
    console.error("Error during initial tab scan:", error);
  });
};

/**
 * Apply volume to a tab
 * @param {number} tabId - ID of the tab to apply volume to
 * @param {number} volume - Volume level (0.0 to 5.0)
 * @param {number} delay - Delay in milliseconds before applying volume
 */
TabAudioDetector.applyVolumeToTab = function(tabId, volume, delay) {
  setTimeout(() => {
    browser.tabs.sendMessage(tabId, {
      action: "setVolume",
      volume: volume
    }).catch(() => {
      // Content script might not be loaded yet, which is fine
    });
  }, delay);
};