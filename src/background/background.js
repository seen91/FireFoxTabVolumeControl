// Track tab volumes and audio status
const tabVolumes = new Map();
const audioTabs = new Set();
const defaultVolume = 100;

// Track audio tabs and clean up on changes
browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.audible !== undefined) {
    changeInfo.audible ? audioTabs.add(tabId) : audioTabs.delete(tabId);
  }
});

browser.tabs.onRemoved.addListener((tabId) => {
  tabVolumes.delete(tabId);
  audioTabs.delete(tabId);
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
        audioTabs.add(tabId);
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
