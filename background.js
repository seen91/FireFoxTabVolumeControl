// background.js - Handles background tasks and tab tracking
// Store volume settings for each tab and domains
let tabVolumes = {};
let domainVolumes = {};
let tabAudioStatus = {}; // Track which tabs have audio

// Initialize extension
function initializeExtension() {
  console.log("Tab Volume Control: Extension initialized");
  
  // Try to load saved volume settings
  browser.storage.local.get(['domainVolumes'])
    .then((result) => {
      if (result.domainVolumes) {
        domainVolumes = result.domainVolumes;
      }
      
      console.log("Tab Volume Control: Settings loaded");
    })
    .catch((error) => {
      console.error("Tab Volume Control: Error loading settings", error);
    });
  
  // Initial scan for tabs with audio
  scanTabsForAudio();
}

// Function to get domain from URL
function getDomainFromUrl(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (e) {
    return null;
  }
}

// Scan all tabs to find ones with audio
function scanTabsForAudio() {
  browser.tabs.query({})
    .then(tabs => {
      tabs.forEach(tab => {
        // Check if tab has audible content
        if (tab.audible) {
          tabAudioStatus[tab.id] = true;
        }
        
        // Try to detect audio elements in the tab
        tryDetectAudio(tab.id);
      });
    });
}

// Try to detect audio in a tab
function tryDetectAudio(tabId) {
  browser.tabs.sendMessage(tabId, { action: "checkForAudio" })
    .then(response => {
      if (response && response.hasAudio) {
        tabAudioStatus[tabId] = true;
      }
    })
    .catch(() => {
      // Ignore errors - content script may not be loaded yet
    });
}

// Listen for tab updates
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Track if tab becomes audible
  if (changeInfo.audible !== undefined) {
    tabAudioStatus[tabId] = changeInfo.audible;
  }
  
  if (changeInfo.status === 'complete' && tab.url) {
    // Get the domain for this tab
    const domain = getDomainFromUrl(tab.url);
    
    // Check for domain-specific volume setting
    if (domain && domainVolumes[domain]) {
      // Apply domain volume if we have one
      setTimeout(() => {
        browser.tabs.sendMessage(tabId, {
          action: "setVolume",
          volume: domainVolumes[domain]
        }).catch(() => {
          // Content script might not be loaded yet, which is fine
        });
      }, 1500);
    }
    
    // Try to detect audio in the tab
    setTimeout(() => {
      tryDetectAudio(tabId);
    }, 2000);
  }
});

// Listen for tab activation (user switches to tab)
browser.tabs.onActivated.addListener((activeInfo) => {
  // Nothing special needed here
});

// Listen for removed tabs to clean up storage
browser.tabs.onRemoved.addListener((tabId) => {
  if (tabVolumes[tabId]) {
    delete tabVolumes[tabId];
  }
  
  if (tabAudioStatus[tabId]) {
    delete tabAudioStatus[tabId];
  }
});

// Listen for messages from popup or content scripts
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle volume change notification from content script
  if (message.action === "volumeChanged" && sender.tab) {
    const tabId = sender.tab.id;
    const volume = message.volume;
    
    // Store in tab-specific settings
    tabVolumes[tabId] = volume;
    
    // Mark this tab as having audio
    tabAudioStatus[tabId] = true;
    
    // If this setting should apply to the domain, store it
    if (message.applyToDomain && sender.tab.url) {
      const domain = getDomainFromUrl(sender.tab.url);
      if (domain) {
        domainVolumes[domain] = volume;
        
        // Save to persistent storage
        browser.storage.local.set({
          domainVolumes: domainVolumes
        }).catch(err => console.error("Error saving domain volumes:", err));
      }
    }
  }
  
  // Handle request for domain volume
  if (message.action === "getDomainVolume" && sender.tab && sender.tab.url) {
    const domain = getDomainFromUrl(sender.tab.url);
    if (domain && domainVolumes[domain]) {
      sendResponse({ volume: domainVolumes[domain] });
    } else {
      sendResponse({ volume: null });
    }
    return true;
  }
  
  // Handle request for tab audio status
  if (message.action === "getTabAudioStatus") {
    sendResponse({ tabAudioStatus: tabAudioStatus });
    return true;
  }
  
  // Handle request to save domain volume
  if (message.action === "saveDomainVolume" && sender.tab && sender.tab.url) {
    const domain = getDomainFromUrl(sender.tab.url);
    if (domain) {
      domainVolumes[domain] = message.volume;
      
      // Save to persistent storage
      browser.storage.local.set({
        domainVolumes: domainVolumes
      }).catch(err => console.error("Error saving domain volumes:", err));
      
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false });
    }
    return true;
  }
  
  // Handle request to get volume for a tab
  if (message.action === "getTabVolume") {
    const tabId = message.tabId;
    if (tabVolumes[tabId]) {
      sendResponse({ volume: tabVolumes[tabId] });
    } else {
      sendResponse({ volume: null });
    }
    return true;
  }
  
  // Handle notification that a tab has audio
  if (message.action === "notifyAudio" && sender.tab) {
    tabAudioStatus[sender.tab.id] = true;
    sendResponse({ success: true });
    return true;
  }
});

// Initialize the extension
initializeExtension();

// Periodically scan for tabs with audio (every 30 seconds)
setInterval(scanTabsForAudio, 30000);