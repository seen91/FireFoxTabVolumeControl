// Store volume settings for each tab and domains
let tabVolumes = {};
let domainVolumes = {};
let globalVolume = 1.0; // Default global volume (100%)
let useGlobalVolume = false; // Whether to use global volume for all tabs

// Initialize extension icon
function initializeExtension() {
  console.log("Tab Volume Control: Extension initialized");
  
  // Try to load saved volume settings
  browser.storage.local.get(['domainVolumes', 'globalVolume', 'useGlobalVolume'])
    .then((result) => {
      if (result.domainVolumes) {
        domainVolumes = result.domainVolumes;
      }
      
      if (result.globalVolume !== undefined) {
        globalVolume = result.globalVolume;
      }
      
      if (result.useGlobalVolume !== undefined) {
        useGlobalVolume = result.useGlobalVolume;
      }
      
      console.log("Tab Volume Control: Settings loaded");
    })
    .catch((error) => {
      console.error("Tab Volume Control: Error loading settings", error);
    });
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

// Listen for tab updates
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    // Get the domain for this tab
    const domain = getDomainFromUrl(tab.url);
    
    // Determine which volume to apply
    let volumeToApply;
    
    if (useGlobalVolume) {
      volumeToApply = globalVolume;
    } else if (tabVolumes[tabId]) {
      volumeToApply = tabVolumes[tabId];
    } else if (domain && domainVolumes[domain]) {
      volumeToApply = domainVolumes[domain];
    }
    
    // Apply the volume if we have one
    if (volumeToApply !== undefined) {
      // Small delay to ensure content script is loaded
      setTimeout(() => {
        browser.tabs.sendMessage(tabId, {
          action: "setVolume",
          volume: volumeToApply
        }).catch(err => {
          // Content script might not be loaded yet, which is fine
        });
      }, 1500);
    }
  }
});

// Listen for tab activation (user switches to tab)
browser.tabs.onActivated.addListener((activeInfo) => {
  browser.tabs.get(activeInfo.tabId).then((tab) => {
    // No need to do anything here, just ensuring content script runs
  });
});

// Listen for removed tabs to clean up storage
browser.tabs.onRemoved.addListener((tabId) => {
  if (tabVolumes[tabId]) {
    delete tabVolumes[tabId];
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
    
    // If this is a global setting
    if (message.applyGlobally) {
      globalVolume = volume;
      useGlobalVolume = true;
      
      // Save to persistent storage
      browser.storage.local.set({
        globalVolume: globalVolume,
        useGlobalVolume: useGlobalVolume
      }).catch(err => console.error("Error saving global volume:", err));
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
  
  // Handle request for global volume setting
  if (message.action === "getGlobalVolume") {
    sendResponse({ 
      volume: globalVolume,
      useGlobalVolume: useGlobalVolume
    });
    return true;
  }
  
  // Handle setting global volume
  if (message.action === "setGlobalVolume") {
    globalVolume = message.volume;
    useGlobalVolume = message.useGlobalVolume;
    
    // Save to persistent storage
    browser.storage.local.set({
      globalVolume: globalVolume,
      useGlobalVolume: useGlobalVolume
    }).catch(err => console.error("Error saving global volume:", err));
    
    sendResponse({ success: true });
    return true;
  }
});

// Initialize the extension
initializeExtension();