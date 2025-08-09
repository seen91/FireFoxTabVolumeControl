// Track tab volumes and audio status
const tabVolumes = new Map();
const audioTabs = new Set();
const tabHandlers = new Map(); // Track handler names for each tab
const tabRemovalTimeouts = new Map(); // Track delayed removal timeouts
const defaultVolume = 100;
const REMOVAL_DELAY = 3000; // 3 seconds delay before removing tabs that stop being audible

// Notify popup about audio status changes
function notifyPopupUpdate() {
  browser.runtime.sendMessage({ action: 'audioStatusChanged' }).catch(() => {
    // Popup might not be open, that's fine
  });
}

// Cleanup invalid audio tabs - simplified approach trusting browser's audible property
async function cleanupAudioTabs() {
  const tabsToRemove = [];
  
  for (const tabId of audioTabs) {
    try {
      // Check if tab still exists
      await browser.tabs.get(tabId);
    } catch (error) {
      // Tab doesn't exist anymore, remove it
      tabsToRemove.push(tabId);
    }
  }
  
  // Remove invalid tabs
  let removedAny = false;
  tabsToRemove.forEach(tabId => {
    if (audioTabs.has(tabId)) {
      console.log('Background: Cleanup removing non-existent tab', tabId);
      audioTabs.delete(tabId);
      tabVolumes.delete(tabId);
      tabHandlers.delete(tabId);
      clearTimeout(tabRemovalTimeouts.get(tabId));
      tabRemovalTimeouts.delete(tabId);
      removedAny = true;
    }
  });
  
  if (removedAny) {
    console.log('Background: Cleanup removed tabs, notifying popup');
    notifyPopupUpdate();
  }
}

// Run cleanup every 60 seconds - just to clean up closed tabs
setInterval(cleanupAudioTabs, 60000);

// Track audio tabs and clean up on changes - trust browser's audible property
browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.audible !== undefined) {
    const wasAudioTab = audioTabs.has(tabId);
    
    if (changeInfo.audible) {
      // Tab started playing audio - add it immediately
      audioTabs.add(tabId);
      
      // Cancel any pending removal
      if (tabRemovalTimeouts.has(tabId)) {
        clearTimeout(tabRemovalTimeouts.get(tabId));
        tabRemovalTimeouts.delete(tabId);
      }
      
      console.log('Background: Tab', tabId, 'started playing audio');
      
      // Notify popup if this is a new audio tab
      if (!wasAudioTab) {
        notifyPopupUpdate();
      }
    } else {
      // Tab stopped playing audio - schedule removal with delay
      if (audioTabs.has(tabId)) {
        console.log('Background: Tab', tabId, 'stopped playing audio, scheduling removal');
        
        const timeoutId = setTimeout(() => {
          if (audioTabs.has(tabId)) {
            console.log('Background: Removing tab', tabId, 'after audio stopped');
            audioTabs.delete(tabId);
            tabRemovalTimeouts.delete(tabId);
            notifyPopupUpdate();
          }
        }, REMOVAL_DELAY);
        
        tabRemovalTimeouts.set(tabId, timeoutId);
      }
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
  tabHandlers.delete(tabId);
  
  // Clear any pending removal timeout
  if (tabRemovalTimeouts.has(tabId)) {
    clearTimeout(tabRemovalTimeouts.get(tabId));
    tabRemovalTimeouts.delete(tabId);
  }
  
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
      // Legacy support - content scripts may still send this
      // But we now primarily trust browser's audible property
      if (tabId) {
        console.log('Background: Content script notified audio for tab', tabId, '(legacy)');
        sendResponse({ success: true });
      }
      break;

    case 'removeAudio':
      // Legacy support - content scripts may still send this
      // But we now primarily trust browser's audible property
      if (tabId) {
        console.log('Background: Content script requested audio removal for tab', tabId, '(legacy)');
        sendResponse({ success: true });
      }
      break;

    case 'getTabAudioStatus':
      browser.tabs.query({}).then(tabs => {
        // Include tabs that are either in our audio set OR currently audible
        const audioTabsInfo = tabs
          .filter(tab => audioTabs.has(tab.id) || tab.audible)
          .map(tab => ({
            id: tab.id,
            title: tab.title,
            volume: tabVolumes.get(tab.id) || defaultVolume,
            favIconUrl: tab.favIconUrl,
            audible: tab.audible || false
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
