/**
 * UI Manager class for DOM element management
 */
class UIManager {
  constructor() {
    this.elements = {};
  }

  /**
   * Initialize DOM elements
   */
  initializeElements() {
    this.elements = {
      masterVolumeSlider: document.getElementById('masterVolumeSlider'),
      masterVolumeDisplay: document.getElementById('masterVolumeDisplay'),
      tabList: document.getElementById('tabList'),
      applyToAllBtn: document.getElementById('applyToAllBtn'),
      refreshBtn: document.getElementById('refreshBtn'),
      resetBtn: document.getElementById('resetBtn')
    };
  }

  /**
   * Get a DOM element by key
   * @param {string} key - Element key
   * @returns {HTMLElement} DOM element
   */
  getElement(key) {
    return this.elements[key];
  }

  /**
   * Initialize master volume slider with config values
   */
  initializeMasterVolumeSlider() {
    const slider = this.getElement('masterVolumeSlider');
    slider.min = CONFIG.VOLUMES.MIN;
    slider.max = CONFIG.VOLUMES.MAX;
    slider.value = CONFIG.VOLUMES.DEFAULT;
  }

  /**
   * Update volume labels with config values
   */
  updateVolumeLabels() {
    const volumeLabels = document.querySelectorAll('.master-control .volume-label');
    if (volumeLabels.length >= 2) {
      volumeLabels[0].textContent = `${CONFIG.VOLUMES.MIN}%`;
      volumeLabels[1].textContent = `${CONFIG.VOLUMES.MAX}%`;
    }
  }

  /**
   * Update preset buttons with config values
   */
  updatePresetButtons() {
    const presetButtons = document.querySelectorAll('.master-control .preset-btn');
    CONFIG.VOLUMES.PRESETS.forEach((volume, index) => {
      if (presetButtons[index]) {
        presetButtons[index].setAttribute('data-volume', volume);
        presetButtons[index].textContent = volume === 0 ? 'Mute' : `${volume}%`;
      }
    });
  }

  /**
   * Initialize theme manager
   */
  async initializeTheme() {
    if (window.themeManager) {
      try {
        await window.themeManager.init();
      } catch (error) {
        console.warn('Theme manager initialization failed:', error);
      }
    }
  }

  /**
   * Show loading message in tab list
   */
  showLoadingMessage() {
    this.getElement('tabList').innerHTML = '<div class="loading">Loading audio tabs...</div>';
  }

  /**
   * Show message when no audio tabs are found
   */
  showNoAudioMessage() {
    this.getElement('tabList').innerHTML = `
      <div class="no-audio">
        No tabs with audio detected.<br>
        Start playing media to see volume controls.
      </div>
    `;
  }

  /**
   * Clear tab list
   */
  clearTabList() {
    this.getElement('tabList').innerHTML = '';
  }

  /**
   * Get CSS class based on volume level
   * @param {number} volume - Volume level
   * @returns {string} CSS class name
   */
  getVolumeClass(volume) {
    if (volume === 0) return CONFIG.CLASSES.VOLUME_MUTED;
    if (volume < CONFIG.VOLUME_THRESHOLDS.LOW) return CONFIG.CLASSES.VOLUME_LOW;
    if (volume > CONFIG.VOLUME_THRESHOLDS.HIGH) return CONFIG.CLASSES.VOLUME_HIGH;
    return CONFIG.CLASSES.VOLUME_NORMAL;
  }
}
