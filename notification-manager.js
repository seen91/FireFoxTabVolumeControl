/**
 * Notification Manager for Tab Volume Control
 * Handles notifications to the popup and other extension components
 */

// Create namespace to avoid global pollution
const NotificationManager = {};

// Use a debouncer for tab list updates to avoid excessive notifications
let tabListUpdateTimer = null;
const TAB_LIST_UPDATE_DEBOUNCE = 500; // ms

/**
 * Notify that a tab has started playing audio
 * @param {number} tabId - ID of the tab
 */
NotificationManager.notifyTabAudioStarted = function(tabId) {
  browser.runtime.sendMessage({
    action: "tabAudioStarted",
    tabId: tabId
  }).catch(() => {
    // Popup might not be open, which is fine
  });
};

/**
 * Notify that a tab has stopped playing audio
 * @param {number} tabId - ID of the tab
 */
NotificationManager.notifyTabAudioStopped = function(tabId) {
  browser.runtime.sendMessage({
    action: "tabAudioStopped",
    tabId: tabId
  }).catch(() => {
    // Popup might not be open, which is fine
  });
};

/**
 * Notify that the tab audio list has been updated
 */
NotificationManager.notifyTabAudioListUpdated = function() {
  // Debounce this notification
  if (tabListUpdateTimer) {
    clearTimeout(tabListUpdateTimer);
  }
  
  tabListUpdateTimer = setTimeout(() => {
    browser.runtime.sendMessage({
      action: "tabAudioListUpdated"
    }).catch(() => {
      // Popup might not be open, which is fine
    });
    tabListUpdateTimer = null;
  }, TAB_LIST_UPDATE_DEBOUNCE);
};

/**
 * Notify that a tab's title has changed
 * @param {number} tabId - ID of the tab
 * @param {string} title - New title
 */
NotificationManager.notifyTabTitleChanged = function(tabId, title) {
  browser.runtime.sendMessage({
    action: "tabTitleChanged",
    tabId: tabId,
    title: title
  }).catch(() => {
    // Popup might not be open, which is fine
  });
};

/**
 * Notify that the active tab has changed
 * @param {number} tabId - ID of the new active tab
 */
NotificationManager.notifyActiveTabChanged = function(tabId) {
  browser.runtime.sendMessage({
    action: "activeTabChanged",
    tabId: tabId
  }).catch(() => {
    // Popup might not be open, which is fine
  });
};