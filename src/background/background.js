/**
 * Firefox Tab Volume Control - Background Script
 * Manages tab volume state and audio status tracking
 */

// State management
const tabVolumes = new Map();
const audioTabs = new Set();
const tabHostnames = new Map();
const tabRemovalTimeouts = new Map();
const DEFAULT_VOLUME = 100;
const REMOVAL_DELAY = 3000; // 3 seconds delay before removing tabs that stop being audible

/**
 * Notify popup about audio status changes
 */
function notifyPopupUpdate() {
  browser.runtime.sendMessage({ action: 'audioStatusChanged' }).catch(() => {
    // Popup might not be open, that's fine
  });
}

/**
 * Cleanup invalid audio tabs
 */
async function cleanupAudioTabs() {
  const tabsToRemove = [];
  
  for (const tabId of audioTabs) {
    try {
      await browser.tabs.get(tabId);
    } catch (error) {
      tabsToRemove.push(tabId);
    }
  }
  
  // Remove invalid tabs
  if (tabsToRemove.length > 0) {
    tabsToRemove.forEach(tabId => {
      audioTabs.delete(tabId);
      tabVolumes.delete(tabId);
      tabHostnames.delete(tabId);
      clearTimeout(tabRemovalTimeouts.get(tabId));
      tabRemovalTimeouts.delete(tabId);
    });
    notifyPopupUpdate();
  }
}

// Cleanup every 60 seconds
setInterval(cleanupAudioTabs, 60000);

/**
 * Track audio tabs and handle tab updates
 */
browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.audible !== undefined) {
    if (changeInfo.audible) {
      // Tab started playing audio
      audioTabs.add(tabId);
      
      // Initialize hostname tracking
      if (!tabHostnames.has(tabId)) {
        browser.tabs.get(tabId).then(tab => {
          if (tab?.url) {
            try {
              const url = new URL(tab.url);
              tabHostnames.set(tabId, url.hostname.toLowerCase());
            } catch (e) {
              tabHostnames.set(tabId, 'unknown');
            }
          }
        }).catch(() => {});
      }
      
      // Cancel any pending removal
      if (tabRemovalTimeouts.has(tabId)) {
        clearTimeout(tabRemovalTimeouts.get(tabId));
        tabRemovalTimeouts.delete(tabId);
      }
      
      notifyPopupUpdate();
    } else {
      // Tab stopped playing audio - schedule removal with delay
      if (audioTabs.has(tabId)) {
        const timeoutId = setTimeout(() => {
          if (audioTabs.has(tabId)) {
            audioTabs.delete(tabId);
            tabRemovalTimeouts.delete(tabId);
            notifyPopupUpdate();
          }
        }, REMOVAL_DELAY);
        
        tabRemovalTimeouts.set(tabId, timeoutId);
      }
    }
  }
  
  // Handle URL changes and reset volume when changing sites
  if (changeInfo.url) {
    const url = new URL(changeInfo.url);
    const hostname = url.hostname.toLowerCase();
    const previousHostname = tabHostnames.get(tabId);
    const hadPreviousVolume = tabVolumes.has(tabId);
    
    // Reset volume if hostname changed
    if (hadPreviousVolume && previousHostname && previousHostname !== hostname) {
      tabVolumes.set(tabId, DEFAULT_VOLUME);
      browser.tabs.sendMessage(tabId, { action: 'setVolume', volume: DEFAULT_VOLUME }).catch(() => {});
      notifyPopupUpdate();
    }
    
    // Update stored hostname
    tabHostnames.set(tabId, hostname);
  }
});

/**
 * Handle tab removal
 */
browser.tabs.onRemoved.addListener((tabId) => {
  tabVolumes.delete(tabId);
  tabHostnames.delete(tabId);
  
  // Clear any pending removal timeout
  if (tabRemovalTimeouts.has(tabId)) {
    clearTimeout(tabRemovalTimeouts.get(tabId));
    tabRemovalTimeouts.delete(tabId);
  }
  
  const wasAudioTab = audioTabs.has(tabId);
  audioTabs.delete(tabId);
  
  if (wasAudioTab) {
    notifyPopupUpdate();
  }
});

/**
 * Handle messages from content scripts and popup
 */
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = message.tabId || sender.tab?.id;

  switch (message.action) {
    case 'setVolume':
      if (tabId && message.volume !== undefined) {
        tabVolumes.set(tabId, message.volume);
        
        // Initialize hostname tracking if needed
        if (!tabHostnames.has(tabId)) {
          browser.tabs.get(tabId).then(tab => {
            if (tab?.url) {
              try {
                const url = new URL(tab.url);
                tabHostnames.set(tabId, url.hostname.toLowerCase());
              } catch (e) {
                tabHostnames.set(tabId, 'unknown');
              }
            }
          }).catch(() => {});
        }
        
        browser.tabs.sendMessage(tabId, { action: 'setVolume', volume: message.volume }).catch(() => {});
        sendResponse({ success: true });
      }
      break;

    case 'getVolume':
      sendResponse({ volume: tabVolumes.get(tabId) || DEFAULT_VOLUME });
      break;

    case 'getTabAudioStatus':
      browser.tabs.query({}).then(tabs => {
        const audioTabsInfo = tabs
          .filter(tab => audioTabs.has(tab.id) || tab.audible)
          .map(tab => ({
            id: tab.id,
            title: tab.title,
            volume: tabVolumes.get(tab.id) || DEFAULT_VOLUME,
            favIconUrl: tab.favIconUrl,
            audible: tab.audible || false
          }));
        sendResponse({ tabs: audioTabsInfo });
      });
      return true;

    case 'applyToAllTabs':
    case 'resetAllTabs':
      const volume = message.action === 'resetAllTabs' ? DEFAULT_VOLUME : message.volume;
      browser.tabs.query({}).then(tabs => {
        tabs.filter(tab => audioTabs.has(tab.id) || tab.audible)
             .forEach(tab => {
               tabVolumes.set(tab.id, volume);
               browser.tabs.sendMessage(tab.id, { action: 'setVolume', volume }).catch(() => {});
             });
        sendResponse({ success: true });
      });
      return true;
  }
});
