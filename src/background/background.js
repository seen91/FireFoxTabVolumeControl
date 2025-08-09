// Track tab volumes and audio status
const tabVolumes = new Map();
const audioTabs = new Set();
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
});

browser.tabs.onRemoved.addListener((tabId) => {
  tabVolumes.delete(tabId);
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
