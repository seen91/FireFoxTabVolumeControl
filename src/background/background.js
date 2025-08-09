// Track tab volumes and audio status
const tabVolumes = new Map();
const audioTabs = new Set();
const tabHandlers = new Map(); // Track handler names for each tab
const defaultVolume = 100;

// Notify popup about audio status changes
function notifyPopupUpdate() {
  browser.runtime.sendMessage({ action: 'audioStatusChanged' }).catch(() => {
    // Popup might not be open, that's fine
  });
}

// Track audio tabs and clean up on changes
browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.audible !== undefined) {
    const wasAudioTab = audioTabs.has(tabId);
    if (changeInfo.audible) {
      audioTabs.add(tabId);
    } else {
      audioTabs.delete(tabId);
    }
    
    // Notify popup if audio status changed
    if (wasAudioTab !== audioTabs.has(tabId)) {
      notifyPopupUpdate();
    }
  }
  
  // Check for URL changes and update handler accordingly
  if (changeInfo.url) {
    const url = new URL(changeInfo.url);
    const hostname = url.hostname.toLowerCase();
    
    let handlerName = 'standardHandler';
    if (hostname.includes('9gag.com')) {
      handlerName = '9gagHandler';
    }
    
    // Only log and update if handler actually changed
    const currentHandler = tabHandlers.get(tabId);
    if (currentHandler !== handlerName) {
      console.log('Background: Setting handler name for tab', tabId, ':', handlerName);
      tabHandlers.set(tabId, handlerName);
    }
  }
});

browser.tabs.onRemoved.addListener((tabId) => {
  tabVolumes.delete(tabId);
  tabHandlers.delete(tabId); // Clean up handler tracking
  const wasAudioTab = audioTabs.has(tabId);
  audioTabs.delete(tabId);
  
  // Notify popup if an audio tab was removed
  if (wasAudioTab) {
    notifyPopupUpdate();
  }
});

// Handle messages
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = message.tabId || sender.tab?.id;

  switch (message.action) {
    case 'setVolume':
      if (tabId && message.volume !== undefined) {
        tabVolumes.set(tabId, message.volume);
        browser.tabs.sendMessage(tabId, { action: 'setVolume', volume: message.volume }).catch(() => {});
        sendResponse({ success: true });
      }
      break;

    case 'getVolume':
      sendResponse({ volume: tabVolumes.get(tabId) || defaultVolume });
      break;

    case 'notifyAudio':
      if (tabId) {
        const wasAudioTab = audioTabs.has(tabId);
        audioTabs.add(tabId);
        
        // Notify popup if this is a new audio tab
        if (!wasAudioTab) {
          notifyPopupUpdate();
        }
        
        sendResponse({ success: true });
      }
      break;

    case 'getTabAudioStatus':
      browser.tabs.query({}).then(tabs => {
        const audioTabsInfo = tabs
          .filter(tab => audioTabs.has(tab.id) || tab.audible)
          .map(tab => ({
            id: tab.id,
            title: tab.title,
            volume: tabVolumes.get(tab.id) || defaultVolume,
            favIconUrl: tab.favIconUrl
          }));
        sendResponse({ tabs: audioTabsInfo });
      });
      return true;

    case 'setHandlerName':
      if (tabId && message.handlerName) {
        // Only log if this is a new handler for this tab (to avoid duplicate logs)
        const currentHandler = tabHandlers.get(tabId);
        if (currentHandler !== message.handlerName) {
          console.log('Background: Setting handler name for tab', tabId, ':', message.handlerName);
        }
        tabHandlers.set(tabId, message.handlerName);
        sendResponse({ success: true });
      }
      break;

    case 'applyToAllTabs':
    case 'resetAllTabs':
      const volume = message.action === 'resetAllTabs' ? defaultVolume : message.volume;
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
