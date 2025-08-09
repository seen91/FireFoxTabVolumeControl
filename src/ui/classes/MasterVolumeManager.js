/**
 * Master Volume Manager class for master volume controls
 */
class MasterVolumeManager {
  constructor(state, uiManager, messageHandler) {
    this.state = state;
    this.uiManager = uiManager;
    this.messageHandler = messageHandler;
  }

  /**
   * Set up master volume event listeners
   */
  setupEventListeners() {
    // Master volume slider
    this.uiManager.getElement('masterVolumeSlider').addEventListener('input', (e) => {
      try {
        const volume = parseInt(e.target.value);
        this.state.setMasterVolume(volume);
        this.updateDisplay();
      } catch (error) {
        console.error('Failed to update master volume:', error);
        // Revert slider to current state value
        this.uiManager.getElement('masterVolumeSlider').value = this.state.getMasterVolume();
      }
    });

    // Master volume preset buttons
    document.querySelectorAll('.master-control .preset-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        try {
          const volume = parseInt(e.target.getAttribute('data-volume'));
          this.setVolume(volume);
        } catch (error) {
          console.error('Failed to set preset volume:', error);
        }
      });
    });
  }

  /**
   * Update master volume display
   */
  updateDisplay() {
    const volume = this.state.getMasterVolume();
    const display = this.uiManager.getElement('masterVolumeDisplay');
    display.textContent = `${volume}%`;
    display.className = `volume-display ${this.uiManager.getVolumeClass(volume)}`;
  }

  /**
   * Set master volume to specific value
   * @param {number} volume - Volume level
   */
  setVolume(volume) {
    try {
      this.state.setMasterVolume(volume);
      this.uiManager.getElement('masterVolumeSlider').value = volume;
      this.updateDisplay();
    } catch (error) {
      console.error('Failed to set master volume:', error);
      // Revert UI to current state
      const currentVolume = this.state.getMasterVolume();
      this.uiManager.getElement('masterVolumeSlider').value = currentVolume;
      this.updateDisplay();
    }
  }

  /**
   * Apply master volume to all audio tabs
   */
  async applyToAllTabs() {
    try {
      // Set flag to prevent unwanted refreshes from overriding our UI changes
      this.state.setJustApplied(true);
      
      const volume = this.state.getMasterVolume();
      
      // Update local state immediately for better UX
      this.state.updateAllTabsVolume(volume);
      
      // Update the UI immediately (this will be handled by TabListManager)
      // Send to background
      await this.messageHandler.applyToAllTabs(volume);
      
      // Clear the flag after a delay to allow normal refreshes
      setTimeout(() => {
        this.state.setJustApplied(false);
      }, CONFIG.TIMING.MASTER_VOLUME_DELAY);
    } catch (error) {
      console.error('Failed to apply master volume to all tabs:', error);
      // Reset the flag if operation failed
      this.state.setJustApplied(false);
    }
  }

  /**
   * Reset all tabs to default volume
   */
  async resetAllTabs() {
    try {
      await this.messageHandler.resetAllTabs();
      this.setVolume(CONFIG.VOLUMES.DEFAULT);
      
      // Reload tabs after a delay
      setTimeout(() => {
        // This will be called from PopupController
      }, CONFIG.TIMING.REFRESH_DELAY);
    } catch (error) {
      console.error('Failed to reset all tabs:', error);
    }
  }
}
