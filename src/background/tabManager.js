/**
 * Firefox Tab Volume Control - Tab Manager
 * Handles tab state management, audio detection, and tab lifecycle events
 */

class TabManager {
  constructor() {
    // State management
    this.tabVolumes = new Map();
    this.audioTabs = new Set();
    this.tabHostnames = new Map();
    this.tabRemovalTimeouts = new Map();
    
    // Constants
    this.DEFAULT_VOLUME = 100;
    this.REMOVAL_DELAY = 3000; // 3 seconds delay before removing tabs that stop being audible
    
    // Bind methods to preserve context
    this.handleTabUpdated = this.handleTabUpdated.bind(this);
    this.handleTabRemoved = this.handleTabRemoved.bind(this);
    this.handleTabActivated = this.handleTabActivated.bind(this);
    this.cleanupAudioTabs = this.cleanupAudioTabs.bind(this);
    
    // Set up event listeners
    this.setupEventListeners();
    
    // Start cleanup interval
    setInterval(this.cleanupAudioTabs, 60000); // Cleanup every 60 seconds
  }
  
  /**
   * Set up browser event listeners
   */
  setupEventListeners() {
    browser.tabs.onUpdated.addListener(this.handleTabUpdated);
    browser.tabs.onRemoved.addListener(this.handleTabRemoved);
    browser.tabs.onActivated.addListener(this.handleTabActivated);
  }
  
  /**
   * Get tab volume
   * @param {number} tabId - Tab ID
   * @returns {number} Volume level
   */
  getTabVolume(tabId) {
    if (tabId === undefined || tabId === null) {
      return this.DEFAULT_VOLUME;
    }
    return this.tabVolumes.get(tabId) || this.DEFAULT_VOLUME;
  }
  
  /**
   * Set tab volume
   * @param {number} tabId - Tab ID
   * @param {number} volume - Volume level
   */
  setTabVolume(tabId, volume) {
    this.tabVolumes.set(tabId, volume);
    
    // Initialize hostname tracking if needed
    if (!this.tabHostnames.has(tabId)) {
      browser.tabs.get(tabId).then(tab => {
        if (tab?.url) {
          try {
            const url = new URL(tab.url);
            this.tabHostnames.set(tabId, url.hostname.toLowerCase());
          } catch (e) {
            this.tabHostnames.set(tabId, 'unknown');
          }
        }
      }).catch(() => {});
    }
    
    // Send message to content script
    browser.tabs.sendMessage(tabId, { action: 'setVolume', volume }).catch(() => {});
  }
  
  /**
   * Get audio tab status for popup
   * @returns {Promise<Array>} Array of audio tab info
   */
  async getAudioTabStatus() {
    const tabs = await browser.tabs.query({});
    const audioTabsInfo = tabs
      .filter(tab => this.audioTabs.has(tab.id) || tab.audible)
      .map(tab => ({
        id: tab.id,
        title: tab.title,
        volume: this.getTabVolume(tab.id),
        favIconUrl: tab.favIconUrl,
        audible: tab.audible || false
      }));
    return audioTabsInfo;
  }
  
  /**
   * Apply volume to all audio tabs
   * @param {number} volume - Volume to apply
   */
  async applyToAllTabs(volume) {
    const tabs = await browser.tabs.query({});
    const promises = tabs
      .filter(tab => this.audioTabs.has(tab.id) || tab.audible)
      .map(tab => {
        this.setTabVolume(tab.id, volume);
        return browser.tabs.sendMessage(tab.id, { action: 'setVolume', volume }).catch(() => {});
      });
    
    await Promise.all(promises);
  }
  
  /**
   * Reset all tabs to default volume
   */
  async resetAllTabs() {
    await this.applyToAllTabs(this.DEFAULT_VOLUME);
  }
  
  /**
   * Notify popup about audio status changes
   */
  notifyPopupUpdate() {
    browser.runtime.sendMessage({ action: 'audioStatusChanged' }).catch(() => {
      // Popup might not be open, that's fine
    });
  }
  
  /**
   * Cleanup invalid audio tabs
   */
  async cleanupAudioTabs() {
    const tabsToRemove = [];
    
    for (const tabId of this.audioTabs) {
      try {
        await browser.tabs.get(tabId);
      } catch (error) {
        tabsToRemove.push(tabId);
      }
    }
    
    // Remove invalid tabs
    if (tabsToRemove.length > 0) {
      tabsToRemove.forEach(tabId => {
        this.audioTabs.delete(tabId);
        this.tabVolumes.delete(tabId);
        this.tabHostnames.delete(tabId);
        clearTimeout(this.tabRemovalTimeouts.get(tabId));
        this.tabRemovalTimeouts.delete(tabId);
      });
      this.notifyPopupUpdate();
    }
  }
  
  /**
   * Handle tab updates (audio state, URL changes)
   */
  handleTabUpdated(tabId, changeInfo) {
    if (changeInfo.audible !== undefined) {
      if (changeInfo.audible) {
        // Tab started playing audio
        this.audioTabs.add(tabId);
        
        // Initialize hostname tracking
        if (!this.tabHostnames.has(tabId)) {
          browser.tabs.get(tabId).then(tab => {
            if (tab?.url) {
              try {
                const url = new URL(tab.url);
                this.tabHostnames.set(tabId, url.hostname.toLowerCase());
              } catch (e) {
                this.tabHostnames.set(tabId, 'unknown');
              }
            }
          }).catch(() => {});
        }
        
        // Cancel any pending removal
        if (this.tabRemovalTimeouts.has(tabId)) {
          clearTimeout(this.tabRemovalTimeouts.get(tabId));
          this.tabRemovalTimeouts.delete(tabId);
        }
        
        this.notifyPopupUpdate();
      } else {
        // Tab stopped playing audio - check if it's the active tab before scheduling removal
        this.handleAudioStopped(tabId);
      }
    }
    
    // Handle URL changes and reset volume when changing sites
    if (changeInfo.url) {
      this.handleUrlChange(tabId, changeInfo.url);
    }
  }
  
  /**
   * Handle when audio stops for a tab
   * @param {number} tabId - Tab ID
   */
  async handleAudioStopped(tabId) {
    if (!this.audioTabs.has(tabId)) return;
    
    try {
      const activeTabs = await browser.tabs.query({ active: true, currentWindow: true });
      const isActiveTab = activeTabs.length > 0 && activeTabs[0].id === tabId;
      
      if (!isActiveTab) {
        // Only schedule removal for non-active tabs
        // Double-check that there isn't already a timeout set
        if (!this.tabRemovalTimeouts.has(tabId)) {
          const timeoutId = setTimeout(async () => {
            try {
              // Verify the tab is still not audible and not active before removing
              const tab = await browser.tabs.get(tabId);
              if (!tab.audible && this.audioTabs.has(tabId)) {
                // Check if it's still not the active tab
                const currentActiveTabs = await browser.tabs.query({ active: true, currentWindow: true });
                const isStillActive = currentActiveTabs.length > 0 && currentActiveTabs[0].id === tabId;
                if (!isStillActive) {
                  console.log(`Removing tab ${tabId} from audio list (timeout expired, still not audible, not active)`);
                  this.audioTabs.delete(tabId);
                  this.tabRemovalTimeouts.delete(tabId);
                  this.notifyPopupUpdate();
                } else {
                  console.log(`Tab ${tabId} became active again, canceling removal`);
                  this.tabRemovalTimeouts.delete(tabId);
                }
              } else {
                // Tab became audible again or was removed, just clean up the timeout
                this.tabRemovalTimeouts.delete(tabId);
              }
            } catch (error) {
              // Tab was closed, clean up
              this.audioTabs.delete(tabId);
              this.tabRemovalTimeouts.delete(tabId);
              this.notifyPopupUpdate();
            }
          }, this.REMOVAL_DELAY);
          
          this.tabRemovalTimeouts.set(tabId, timeoutId);
        }
      }
      // If it's the active tab, do nothing - keep it in the list
    } catch (error) {
      // If we can't determine the active tab, fall back to old behavior but with safeguards
      if (!this.tabRemovalTimeouts.has(tabId)) {
        const timeoutId = setTimeout(() => {
          if (this.audioTabs.has(tabId)) {
            console.log(`Removing tab ${tabId} from audio list (timeout expired, can't check active state)`);
            this.audioTabs.delete(tabId);
            this.tabRemovalTimeouts.delete(tabId);
            this.notifyPopupUpdate();
          }
        }, this.REMOVAL_DELAY);
        
        this.tabRemovalTimeouts.set(tabId, timeoutId);
      }
    }
  }
  
  /**
   * Handle URL changes for a tab
   * @param {number} tabId - Tab ID
   * @param {string} newUrl - New URL
   */
  handleUrlChange(tabId, newUrl) {
    try {
      const url = new URL(newUrl);
      const hostname = url.hostname.toLowerCase();
      const previousHostname = this.tabHostnames.get(tabId);
      const hadPreviousVolume = this.tabVolumes.has(tabId);
      
      // Reset volume if hostname changed
      if (hadPreviousVolume && previousHostname && previousHostname !== hostname) {
        this.tabVolumes.set(tabId, this.DEFAULT_VOLUME);
        browser.tabs.sendMessage(tabId, { action: 'setVolume', volume: this.DEFAULT_VOLUME }).catch(() => {});
        this.notifyPopupUpdate();
      }
      
      // Update stored hostname
      this.tabHostnames.set(tabId, hostname);
    } catch (error) {
      // Invalid URL, ignore
    }
  }
  
  /**
   * Handle tab removal
   */
  handleTabRemoved(tabId) {
    this.tabVolumes.delete(tabId);
    this.tabHostnames.delete(tabId);
    
    // Clear any pending removal timeout
    if (this.tabRemovalTimeouts.has(tabId)) {
      clearTimeout(this.tabRemovalTimeouts.get(tabId));
      this.tabRemovalTimeouts.delete(tabId);
    }
    
    const wasAudioTab = this.audioTabs.has(tabId);
    this.audioTabs.delete(tabId);
    
    if (wasAudioTab) {
      this.notifyPopupUpdate();
    }
  }
  
  /**
   * Handle active tab changes to manage audio tab removal and restoration
   */
  async handleTabActivated(activeInfo) {
    try {
      const tabs = await browser.tabs.query({});
      const activeTab = tabs.find(tab => tab.id === activeInfo.tabId);
      
      if (activeTab) {
        // Always cancel any pending removal for the newly active tab
        if (this.tabRemovalTimeouts.has(activeInfo.tabId)) {
          clearTimeout(this.tabRemovalTimeouts.get(activeInfo.tabId));
          this.tabRemovalTimeouts.delete(activeInfo.tabId);
        }
        
        await this.evaluateActiveTabForAudioList(activeTab);
        await this.scheduleInactiveTabsForRemoval(tabs, activeInfo.tabId);
      }
    } catch (error) {
      console.error('Error handling active tab change:', error);
    }
  }
  
  /**
   * Evaluate if the active tab should be in the audio list
   * @param {Object} activeTab - Active tab object
   */
  async evaluateActiveTabForAudioList(activeTab) {
    const tabId = activeTab.id;
    let shouldBeInList = false;
    let reason = '';
    
    // First check if tab is currently audible - definitive indicator
    if (activeTab.audible) {
      shouldBeInList = true;
      reason = 'currently audible';
    }
    // Second check if tab has a non-default stored volume - indicates user set a preference
    else if (this.tabVolumes.has(tabId) && this.tabVolumes.get(tabId) !== this.DEFAULT_VOLUME) {
      shouldBeInList = true;
      reason = 'has non-default volume setting';
    }
    // Third check if tab has any stored volume - indicates it had audio before
    else if (this.tabVolumes.has(tabId)) {
      // For default volume, check with content script to see if audio still exists
      try {
        const response = await browser.tabs.sendMessage(tabId, { action: 'checkForAudio' });
        if (response && response.hasAudio) {
          shouldBeInList = true;
          reason = 'has stored volume and content script found audio';
        } else {
          reason = 'has stored volume but content script found no audio';
          // Don't add to list, but also don't remove stored volume yet
        }
      } catch (error) {
        // Content script error - assume it should be in list since we have history
        shouldBeInList = true;
        reason = 'has stored volume, content script error';
      }
    }
    // Fourth check with content script for audio elements (new tab)
    else {
      try {
        const response = await browser.tabs.sendMessage(tabId, { action: 'checkForAudio' });
        if (response && response.hasAudio) {
          shouldBeInList = true;
          reason = 'new tab, content script found audio';
        } else {
          reason = 'new tab, content script found no audio';
        }
      } catch (error) {
        // Content script might not be ready - if we have hostname history, be lenient
        if (this.tabHostnames.has(tabId)) {
          shouldBeInList = true;
          reason = 'new tab, content script error, has hostname history';
        } else {
          reason = 'new tab, content script error, no history';
        }
      }
    }
    
    console.log(`Tab ${tabId} activation check: shouldBeInList=${shouldBeInList}, reason="${reason}", wasInList=${this.audioTabs.has(tabId)}, volume=${this.tabVolumes.get(tabId) || 'none'}`);
    
    if (shouldBeInList) {
      // Tab should be in the audio list
      const wasInList = this.audioTabs.has(tabId);
      this.audioTabs.add(tabId);
      
      // Initialize volume if not set
      if (!this.tabVolumes.has(tabId)) {
        this.tabVolumes.set(tabId, this.DEFAULT_VOLUME);
      }
      
      // Initialize hostname tracking if needed
      if (!this.tabHostnames.has(tabId) && activeTab.url) {
        try {
          const url = new URL(activeTab.url);
          this.tabHostnames.set(tabId, url.hostname.toLowerCase());
        } catch (e) {
          this.tabHostnames.set(tabId, 'unknown');
        }
      }
      
      // Only notify if state changed
      if (!wasInList) {
        console.log(`Tab ${tabId} added back to audio list`);
        this.notifyPopupUpdate();
      }
    } else {
      // Tab should not be in the list - remove it if present
      if (this.audioTabs.has(tabId)) {
        this.audioTabs.delete(tabId);
        console.log(`Tab ${tabId} removed from audio list`);
        this.notifyPopupUpdate();
      }
    }
  }
  
  /**
   * Schedule inactive tabs for removal if they're no longer audible
   * @param {Array} tabs - All tabs
   * @param {number} activeTabId - Currently active tab ID
   */
  async scheduleInactiveTabsForRemoval(tabs, activeTabId) {
    for (const tab of tabs) {
      // Skip the newly activated tab
      if (tab.id === activeTabId) continue;
      
      // If this tab is in audioTabs but not audible and not scheduled for removal,
      // schedule it for removal now that it's no longer active
      if (this.audioTabs.has(tab.id) && !tab.audible && !this.tabRemovalTimeouts.has(tab.id)) {
        const timeoutId = setTimeout(() => {
          if (this.audioTabs.has(tab.id)) {
            this.audioTabs.delete(tab.id);
            this.tabRemovalTimeouts.delete(tab.id);
            this.notifyPopupUpdate();
          }
        }, this.REMOVAL_DELAY);
        
        this.tabRemovalTimeouts.set(tab.id, timeoutId);
      }
    }
  }
}

// Export for use in background script
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TabManager;
} else {
  // Browser environment
  window.TabManager = TabManager;
}
