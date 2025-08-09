/**
 * Tab List Manager class for individual tab management
 */
class TabListManager {
  constructor(state, uiManager, messageHandler) {
    this.state = state;
    this.uiManager = uiManager;
    this.messageHandler = messageHandler;
  }

  /**
   * Render the list of audio tabs
   */
  render() {
    const tabs = this.state.getAudioTabs();
    
    if (tabs.length === 0) {
      this.uiManager.showNoAudioMessage();
      return;
    }

    this.uiManager.clearTabList();
    const tabList = this.uiManager.getElement('tabList');
    
    tabs.forEach(tab => {
      tabList.appendChild(this.createTabElement(tab));
    });
  }

  /**
   * Update the existing tab list display with current volume values
   */
  updateDisplay() {
    const tabItems = this.uiManager.getElement('tabList').querySelectorAll('.tab-item');
    
    tabItems.forEach(tabDiv => {
      const slider = tabDiv.querySelector('.volume-slider');
      const tabVolumeDisplay = tabDiv.querySelector('.tab-volume-display');
      
      if (slider && tabVolumeDisplay) {
        const tabId = parseInt(slider.getAttribute('data-tab-id'));
        const tab = this.state.findTab(tabId);
        
        if (tab) {
          // Update slider value
          slider.value = tab.volume;
          
          // Update display
          tabVolumeDisplay.textContent = `${tab.volume}%`;
          tabVolumeDisplay.className = `tab-volume-display ${this.uiManager.getVolumeClass(tab.volume)}`;
        }
      }
    });
  }

  /**
   * Create a tab element for the UI
   * @param {Object} tab - Tab object
   * @returns {HTMLElement} Tab element
   */
  createTabElement(tab) {
    const tabDiv = document.createElement('div');
    tabDiv.className = 'tab-item';
    
    const volumeClass = this.uiManager.getVolumeClass(tab.volume);
    const favicon = tab.favIconUrl || CONFIG.UI.DEFAULT_FAVICON;
    
    tabDiv.innerHTML = `
      <div class="tab-header">
        <img class="tab-favicon" src="${favicon}" alt="">
        <span class="tab-title" title="${tab.title}">${tab.title}</span>
        <span class="tab-volume-display ${volumeClass}">${tab.volume}%</span>
      </div>
      <div class="volume-container">
        <div class="volume-slider-container">
          <span class="volume-label">${CONFIG.VOLUMES.MIN}%</span>
          <input type="range" class="volume-slider" min="${CONFIG.VOLUMES.MIN}" max="${CONFIG.VOLUMES.MAX}" value="${tab.volume}" data-tab-id="${tab.id}">
          <span class="volume-label">${CONFIG.VOLUMES.MAX}%</span>
        </div>
        <div class="preset-buttons">
          <button class="preset-btn" data-tab-id="${tab.id}" data-volume="${CONFIG.VOLUMES.PRESETS[0]}">Mute</button>
          <button class="preset-btn" data-tab-id="${tab.id}" data-volume="${CONFIG.VOLUMES.PRESETS[1]}">${CONFIG.VOLUMES.PRESETS[1]}%</button>
          <button class="preset-btn" data-tab-id="${tab.id}" data-volume="${CONFIG.VOLUMES.PRESETS[2]}">${CONFIG.VOLUMES.PRESETS[2]}%</button>
          <button class="preset-btn" data-tab-id="${tab.id}" data-volume="${CONFIG.VOLUMES.PRESETS[3]}">${CONFIG.VOLUMES.PRESETS[3]}%</button>
        </div>
      </div>
    `;

    // Set up event listeners for this tab
    this.setupTabEvents(tabDiv, tab);
    return tabDiv;
  }

  /**
   * Set up event listeners for a tab element
   * @param {HTMLElement} tabDiv - Tab element
   * @param {Object} tab - Tab object
   */
  setupTabEvents(tabDiv, tab) {
    const slider = tabDiv.querySelector('.volume-slider');
    const tabVolumeDisplay = tabDiv.querySelector('.tab-volume-display');
    
    slider.addEventListener('input', (e) => {
      const volume = parseInt(e.target.value);
      this.updateTabVolume(tab.id, volume, tabVolumeDisplay);
    });

    tabDiv.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const volume = parseInt(e.target.getAttribute('data-volume'));
        slider.value = volume;
        this.updateTabVolume(tab.id, volume, tabVolumeDisplay);
      });
    });
  }

  /**
   * Update volume for a specific tab
   * @param {number} tabId - Tab ID
   * @param {number} volume - Volume level
   * @param {HTMLElement} tabVolumeDisplay - Display element
   */
  async updateTabVolume(tabId, volume, tabVolumeDisplay) {
    try {
      // Update display immediately
      tabVolumeDisplay.textContent = `${volume}%`;
      tabVolumeDisplay.className = `tab-volume-display ${this.uiManager.getVolumeClass(volume)}`;

      // Send to tab and background
      await this.messageHandler.setTabVolume(tabId, volume);
      
      // Update local state
      this.state.updateTabVolume(tabId, volume);
    } catch (error) {
      console.error('Failed to update tab volume:', error);
    }
  }

  /**
   * Sync tab volumes by querying content scripts directly
   */
  async syncTabVolumes() {
    const tabs = this.state.getAudioTabs();
    const volumePromises = tabs.map(async (tab) => {
      try {
        const response = await this.messageHandler.getTabVolume(tab.id);
        if (response && response.volume !== undefined) {
          tab.volume = response.volume;
        }
      } catch (error) {
        // Content script might not be ready or tab might not have audio anymore
        // Keep the volume from background script
      }
    });
    
    await Promise.all(volumePromises);
  }
}
