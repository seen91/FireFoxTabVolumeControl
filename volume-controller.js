/**
 * Volume Controller for Tab Volume Control popup
 * Handles volume operations for tabs
 */

// Create namespace to avoid global pollution
const VolumeController = {};

// Constants
VolumeController.DEFAULT_VOLUME = 1.0; // Default volume (100%)

/**
 * Apply volume to a specific tab
 * @param {number} tabId - Tab ID to apply volume to
 * @param {number} volume - Volume level (0.0 to 5.0)
 * @returns {Promise<boolean>} - True if volume was applied successfully
 */
VolumeController.applyVolumeToTab = function(tabId, volume) {
  return browser.tabs.sendMessage(tabId, {
    action: "setVolume",
    volume: volume
  })
    .then(() => true)
    .catch(error => {
      console.error(`Could not set volume for tab ${tabId}:`, error);
      return false;
    });
};

/**
 * Apply master volume to all tabs
 * @param {Array} tabs - List of tabs
 * @param {number} volume - Volume level (0.0 to 5.0)
 * @param {Function} updateTabVolumeUI - Function to update tab volume UI
 * @param {Object} tabVolumes - Object to store tab volumes
 * @returns {number} - Number of tabs that were updated
 */
VolumeController.applyMasterVolumeToAllTabs = function(tabs, volume, updateTabVolumeUI, tabVolumes) {
  let appliedCount = 0;
  const volumePercent = Math.round(volume * 100);
  
  // Apply to all tabs with audio
  tabs.forEach(tab => {
    VolumeController.applyVolumeToTab(tab.id, volume);
    
    // Update the UI for each tab
    updateTabVolumeUI(tab.id, volumePercent);
    
    // Store the volume
    tabVolumes[tab.id] = volume;
    appliedCount++;
  });
  
  return appliedCount;
};

/**
 * Reset all tabs to default volume
 * @param {Array} tabs - List of tabs
 * @param {Object} tabVolumes - Object to store tab volumes
 * @returns {number} - Number of tabs that were reset
 */
VolumeController.resetAllTabs = function(tabs, tabVolumes) {
  let resetCount = 0;
  
  tabs.forEach(tab => {
    VolumeController.applyVolumeToTab(tab.id, VolumeController.DEFAULT_VOLUME);
    tabVolumes[tab.id] = VolumeController.DEFAULT_VOLUME;
    resetCount++;
  });
  
  return resetCount;
};

/**
 * Handle preset button click
 * @param {number} tabId - Tab ID
 * @param {number} valuePercent - Volume value in percent
 * @param {Object} tabVolumes - Object to store tab volumes
 * @param {Function} updateTabVolumeUI - Function to update tab volume UI
 */
VolumeController.handleVolumePreset = function(tabId, valuePercent, tabVolumes, updateTabVolumeUI) {
  const volume = valuePercent / 100;
  
  // Update UI
  updateTabVolumeUI(tabId, valuePercent);
  
  // Store and apply volume
  tabVolumes[tabId] = volume;
  return VolumeController.applyVolumeToTab(tabId, volume);
};

/**
 * Update master slider and display
 * @param {number} valuePercent - Volume value in percent
 * @param {HTMLElement} sliderElement - Slider element
 * @param {Function} updateDisplayFunction - Function to update display
 */
VolumeController.updateMasterSlider = function(valuePercent, sliderElement, updateDisplayFunction) {
  sliderElement.value = valuePercent;
  updateDisplayFunction(valuePercent);
};