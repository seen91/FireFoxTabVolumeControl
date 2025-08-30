/**
 * Message Handler class for browser runtime communication
 */
class MessageHandler {
  constructor(popupController) {
    this.popupController = popupController;
  }

  /**
   * Set up message listeners
   */
  setupMessageListeners() {
    browser.runtime.onMessage.addListener((message) => {
      if (message.action === 'audioStatusChanged') {
        this.popupController.loadAudioTabs();
      }
    });
  }

  /**
   * Send message to get tab audio status
   * @returns {Promise} Promise resolving to response
   */
  async getTabAudioStatus() {
    return browser.runtime.sendMessage({ action: 'getTabAudioStatus' });
  }

  /**
   * Send message to set volume for a specific tab
   * @param {number} tabId - Tab ID
   * @param {number} volume - Volume level
   * @returns {Promise} Promise resolving to response
   */
  async setTabVolume(tabId, volume) {
    return browser.runtime.sendMessage({ action: 'setVolume', tabId, volume });
  }

  /**
   * Send message to get volume for a specific tab
   * @param {number} tabId - Tab ID
   * @returns {Promise} Promise resolving to response
   */
  async getTabVolume(tabId) {
    return browser.runtime.sendMessage({ action: 'getVolume', tabId });
  }

  /**
   * Send message to apply volume to all tabs
   * @param {number} volume - Volume level
   * @returns {Promise} Promise resolving to response
   */
  async applyToAllTabs(volume) {
    return browser.runtime.sendMessage({ action: 'applyToAllTabs', volume });
  }

  /**
   * Send message to reset all tabs
   * @returns {Promise} Promise resolving to response
   */
  async resetAllTabs() {
    return browser.runtime.sendMessage({ action: 'resetAllTabs' });
  }
}
