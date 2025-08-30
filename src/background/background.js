/**
 * Firefox Tab Volume Control - Background Script
 * Main coordinator that handles messages and delegates tab management
 */

// Import TabManager - this will be loaded via manifest scripts array
// tabManager.js will be loaded first, making TabManager available globally

// Initialize the tab manager
const tabManager = new TabManager();

/**
 * Handle messages from content scripts and popup
 */
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = message.tabId || sender.tab?.id;

  switch (message.action) {
    case 'setVolume':
      if (tabId && message.volume !== undefined) {
        tabManager.setTabVolume(tabId, message.volume);
        sendResponse({ success: true });
      }
      break;

    case 'getVolume':
      if (tabId) {
        sendResponse({ volume: tabManager.getTabVolume(tabId) });
      } else {
        sendResponse({ error: 'No tab ID provided' });
      }
      break;

    case 'getTabAudioStatus':
      tabManager.getAudioTabStatus().then(tabs => {
        sendResponse({ tabs });
      });
      return true;

    case 'applyToAllTabs':
      tabManager.applyToAllTabs(message.volume).then(() => {
        sendResponse({ success: true });
      });
      return true;

    case 'resetAllTabs':
      tabManager.resetAllTabs().then(() => {
        sendResponse({ success: true });
      });
      return true;

    default:
      sendResponse({ error: 'Unknown action' });
      break;
  }
});
