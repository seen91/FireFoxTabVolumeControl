/**
 * State management class for popup data
 */
class PopupState {
  constructor() {
    this.audioTabs = [];
    this.masterVolume = CONFIG.VOLUMES.DEFAULT;
    this.justAppliedMasterVolume = false;
  }

  /**
   * Get all audio tabs
   * @returns {Array} Array of audio tab objects
   */
  getAudioTabs() {
    return this.audioTabs;
  }

  /**
   * Set audio tabs data
   * @param {Array} tabs - Array of tab objects
   */
  setAudioTabs(tabs) {
    this.audioTabs = tabs;
  }

  /**
   * Find a tab by ID
   * @param {number} tabId - Tab ID to find
   * @returns {Object|undefined} Tab object or undefined
   */
  findTab(tabId) {
    return this.audioTabs.find(tab => tab.id === tabId);
  }

  /**
   * Update tab volume in local state
   * @param {number} tabId - Tab ID
   * @param {number} volume - New volume value
   */
  updateTabVolume(tabId, volume) {
    const tab = this.findTab(tabId);
    if (tab) {
      tab.volume = volume;
    }
  }

  /**
   * Update all tabs volume in local state
   * @param {number} volume - New volume value for all tabs
   */
  updateAllTabsVolume(volume) {
    this.audioTabs.forEach(tab => {
      tab.volume = volume;
    });
  }

  /**
   * Get master volume
   * @returns {number} Current master volume
   */
  getMasterVolume() {
    return this.masterVolume;
  }

  /**
   * Set master volume
   * @param {number} volume - New master volume
   */
  setMasterVolume(volume) {
    this.masterVolume = volume;
  }

  /**
   * Check if master volume was just applied
   * @returns {boolean} True if master volume was just applied
   */
  wasJustApplied() {
    return this.justAppliedMasterVolume;
  }

  /**
   * Set the just applied flag
   * @param {boolean} applied - Whether master volume was just applied
   */
  setJustApplied(applied) {
    this.justAppliedMasterVolume = applied;
  }
}
