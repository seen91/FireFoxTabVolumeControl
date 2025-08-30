/**
 * Enhanced state management class for popup data with validation and events
 */
class PopupState {
  constructor() {
    this.audioTabs = [];
    this.masterVolume = CONFIG.VOLUMES.DEFAULT;
    this.justAppliedMasterVolume = false;
    this.listeners = new Map(); // Event listeners for state changes
  }

  /**
   * Add event listener for state changes
   * @param {string} event - Event name ('tabsChanged', 'volumeChanged', 'masterVolumeChanged')
   * @param {Function} callback - Callback function
   */
  addEventListener(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  /**
   * Remove event listener
   * @param {string} event - Event name
   * @param {Function} callback - Callback function to remove
   */
  removeEventListener(event, callback) {
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  /**
   * Emit event to all listeners
   * @param {string} event - Event name
   * @param {*} data - Event data
   */
  _emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in state event listener for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Validate volume value
   * @param {number} volume - Volume to validate
   * @returns {boolean} True if valid
   */
  _validateVolume(volume) {
    return typeof volume === 'number' && 
           volume >= CONFIG.VOLUMES.MIN && 
           volume <= CONFIG.VOLUMES.MAX;
  }

  /**
   * Validate tab ID
   * @param {number} tabId - Tab ID to validate
   * @returns {boolean} True if valid
   */
  _validateTabId(tabId) {
    return typeof tabId === 'number' && tabId > 0;
  }

  /**
   * Validate tabs array
   * @param {Array} tabs - Tabs array to validate
   * @returns {boolean} True if valid
   */
  _validateTabs(tabs) {
    return Array.isArray(tabs) && tabs.every(tab => 
      tab && typeof tab === 'object' && 
      this._validateTabId(tab.id) && 
      this._validateVolume(tab.volume) &&
      typeof tab.title === 'string'
    );
  }

  /**
   * Get all audio tabs (returns immutable copy)
   * @returns {Array} Array of audio tab objects
   */
  getAudioTabs() {
    return this.audioTabs.map(tab => ({ ...tab }));
  }

  /**
   * Set audio tabs data with validation
   * @param {Array} tabs - Array of tab objects
   * @throws {Error} If tabs data is invalid
   */
  setAudioTabs(tabs) {
    if (!this._validateTabs(tabs)) {
      throw new Error('Invalid tabs data provided');
    }

    const oldTabs = this.audioTabs;
    this.audioTabs = tabs.map(tab => ({ ...tab })); // Deep copy to prevent mutations
    
    // Emit change event if tabs actually changed
    if (JSON.stringify(oldTabs) !== JSON.stringify(this.audioTabs)) {
      this._emit('tabsChanged', {
        oldTabs,
        newTabs: this.getAudioTabs()
      });
    }
  }

  /**
   * Get current tab count
   * @returns {number} Number of audio tabs
   */
  getTabCount() {
    return this.audioTabs.length;
  }

  /**
   * Check if tabs exist
   * @returns {boolean} True if there are audio tabs
   */
  hasTabs() {
    return this.audioTabs.length > 0;
  }

  /**
   * Find a tab by ID
   * @param {number} tabId - Tab ID to find
   * @returns {Object|undefined} Tab object copy or undefined
   */
  findTab(tabId) {
    if (!this._validateTabId(tabId)) {
      return undefined;
    }
    
    const tab = this.audioTabs.find(tab => tab.id === tabId);
    return tab ? { ...tab } : undefined;
  }

  /**
   * Check if tab exists
   * @param {number} tabId - Tab ID to check
   * @returns {boolean} True if tab exists
   */
  hasTab(tabId) {
    return this._validateTabId(tabId) && 
           this.audioTabs.some(tab => tab.id === tabId);
  }

  /**
   * Update tab volume in local state with validation
   * @param {number} tabId - Tab ID
   * @param {number} volume - New volume value
   * @throws {Error} If tabId or volume is invalid
   */
  updateTabVolume(tabId, volume) {
    if (!this._validateTabId(tabId)) {
      throw new Error(`Invalid tab ID: ${tabId}`);
    }
    
    if (!this._validateVolume(volume)) {
      throw new Error(`Invalid volume value: ${volume}. Must be between ${CONFIG.VOLUMES.MIN} and ${CONFIG.VOLUMES.MAX}`);
    }

    const tabIndex = this.audioTabs.findIndex(tab => tab.id === tabId);
    if (tabIndex === -1) {
      throw new Error(`Tab with ID ${tabId} not found`);
    }

    const oldVolume = this.audioTabs[tabIndex].volume;
    if (oldVolume !== volume) {
      this.audioTabs[tabIndex] = { ...this.audioTabs[tabIndex], volume };
      
      this._emit('volumeChanged', {
        tabId,
        oldVolume,
        newVolume: volume
      });
    }
  }

  /**
   * Update all tabs volume in local state with validation
   * @param {number} volume - New volume value for all tabs
   * @throws {Error} If volume is invalid
   */
  updateAllTabsVolume(volume) {
    if (!this._validateVolume(volume)) {
      throw new Error(`Invalid volume value: ${volume}. Must be between ${CONFIG.VOLUMES.MIN} and ${CONFIG.VOLUMES.MAX}`);
    }

    const changedTabs = [];
    this.audioTabs = this.audioTabs.map(tab => {
      if (tab.volume !== volume) {
        changedTabs.push({
          tabId: tab.id,
          oldVolume: tab.volume,
          newVolume: volume
        });
        return { ...tab, volume };
      }
      return tab;
    });

    if (changedTabs.length > 0) {
      this._emit('volumeChanged', {
        type: 'bulk',
        changes: changedTabs
      });
    }
  }

  /**
   * Get master volume
   * @returns {number} Current master volume
   */
  getMasterVolume() {
    return this.masterVolume;
  }

  /**
   * Set master volume with validation
   * @param {number} volume - New master volume
   * @throws {Error} If volume is invalid
   */
  setMasterVolume(volume) {
    if (!this._validateVolume(volume)) {
      throw new Error(`Invalid master volume value: ${volume}. Must be between ${CONFIG.VOLUMES.MIN} and ${CONFIG.VOLUMES.MAX}`);
    }

    const oldVolume = this.masterVolume;
    if (oldVolume !== volume) {
      this.masterVolume = volume;
      
      this._emit('masterVolumeChanged', {
        oldVolume,
        newVolume: volume
      });
    }
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
    if (typeof applied !== 'boolean') {
      throw new Error('Applied flag must be a boolean');
    }
    
    this.justAppliedMasterVolume = applied;
  }

  /**
   * Get current state snapshot (immutable)
   * @returns {Object} Current state snapshot
   */
  getSnapshot() {
    return {
      audioTabs: this.getAudioTabs(),
      masterVolume: this.masterVolume,
      justAppliedMasterVolume: this.justAppliedMasterVolume,
      tabCount: this.getTabCount(),
      timestamp: Date.now()
    };
  }

  /**
   * Reset state to initial values
   */
  reset() {
    const oldSnapshot = this.getSnapshot();
    
    this.audioTabs = [];
    this.masterVolume = CONFIG.VOLUMES.DEFAULT;
    this.justAppliedMasterVolume = false;

    this._emit('stateReset', {
      oldState: oldSnapshot,
      newState: this.getSnapshot()
    });
  }

  /**
   * Validate current state integrity
   * @returns {Object} Validation result with isValid flag and errors array
   */
  validateState() {
    const errors = [];

    if (!this._validateVolume(this.masterVolume)) {
      errors.push(`Invalid master volume: ${this.masterVolume}`);
    }

    if (!Array.isArray(this.audioTabs)) {
      errors.push('Audio tabs is not an array');
    } else {
      this.audioTabs.forEach((tab, index) => {
        if (!tab || typeof tab !== 'object') {
          errors.push(`Tab at index ${index} is not an object`);
          return;
        }
        
        if (!this._validateTabId(tab.id)) {
          errors.push(`Tab at index ${index} has invalid ID: ${tab.id}`);
        }
        
        if (!this._validateVolume(tab.volume)) {
          errors.push(`Tab at index ${index} has invalid volume: ${tab.volume}`);
        }
        
        if (typeof tab.title !== 'string') {
          errors.push(`Tab at index ${index} has invalid title: ${tab.title}`);
        }
      });
    }

    if (typeof this.justAppliedMasterVolume !== 'boolean') {
      errors.push(`justAppliedMasterVolume is not a boolean: ${this.justAppliedMasterVolume}`);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}
