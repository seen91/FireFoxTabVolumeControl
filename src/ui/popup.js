/**
 * Firefox Tab Volume Control - Popup Script
 * Manages the popup interface for controlling tab volumes
 */

// Configuration constants
const CONFIG = {
  VOLUMES: { MIN: 0, MAX: 500, DEFAULT: 100, PRESETS: [0, 100, 200, 500] },
  TIMING: { MASTER_VOLUME_DELAY: 1000, REFRESH_DELAY: 500 },
  VOLUME_THRESHOLDS: { LOW: 50, HIGH: 150 },
  UI: { DEFAULT_FAVICON: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="%23ccc"/></svg>' },
  CLASSES: { VOLUME_NORMAL: 'volume-normal', VOLUME_LOW: 'volume-low', VOLUME_HIGH: 'volume-high', VOLUME_MUTED: 'volume-muted' }
};

// DOM elements and state
let masterVolumeSlider, masterVolumeDisplay, tabList, applyToAllBtn, refreshBtn, resetBtn;
let audioTabs = [];
let masterVolume = CONFIG.VOLUMES.DEFAULT;
let justAppliedMasterVolume = false;

/**
 * Initialize popup interface
 */
function init() {
  // Get DOM elements
  masterVolumeSlider = document.getElementById('masterVolumeSlider');
  masterVolumeDisplay = document.getElementById('masterVolumeDisplay');
  tabList = document.getElementById('tabList');
  applyToAllBtn = document.getElementById('applyToAllBtn');
  refreshBtn = document.getElementById('refreshBtn');
  resetBtn = document.getElementById('resetBtn');

  // Initialize master volume slider with config values
  masterVolumeSlider.min = CONFIG.VOLUMES.MIN;
  masterVolumeSlider.max = CONFIG.VOLUMES.MAX;
  masterVolumeSlider.value = CONFIG.VOLUMES.DEFAULT;
  
  // Update volume labels with config values
  const volumeLabels = document.querySelectorAll('.master-control .volume-label');
  if (volumeLabels.length >= 2) {
    volumeLabels[0].textContent = `${CONFIG.VOLUMES.MIN}%`;
    volumeLabels[1].textContent = `${CONFIG.VOLUMES.MAX}%`;
  }
  
  // Update preset buttons with config values
  const presetButtons = document.querySelectorAll('.master-control .preset-btn');
  CONFIG.VOLUMES.PRESETS.forEach((volume, index) => {
    if (presetButtons[index]) {
      presetButtons[index].setAttribute('data-volume', volume);
      presetButtons[index].textContent = volume === 0 ? 'Mute' : `${volume}%`;
    }
  });

  // Initialize theme manager
  if (window.themeManager) {
    window.themeManager.init().catch(error => {
      console.warn('Theme manager initialization failed:', error);
    });
  }

  // Set up event listeners
  setupEventListeners();
  
  // Load audio tabs
  loadAudioTabs();
}

/**
 * Set up all event listeners
 */
function setupEventListeners() {
  // Listen for audio status changes from background script
  browser.runtime.onMessage.addListener((message) => {
    if (message.action === 'audioStatusChanged') {
      loadAudioTabs();
    }
  });

  // Master volume control
  masterVolumeSlider.addEventListener('input', (e) => {
    masterVolume = parseInt(e.target.value);
    updateMasterVolumeDisplay();
  });

  // Master volume preset buttons
  document.querySelectorAll('.master-control .preset-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      setMasterVolume(parseInt(e.target.getAttribute('data-volume')));
    });
  });

  // Control buttons
  applyToAllBtn.addEventListener('click', applyMasterVolumeToAllTabs);
  refreshBtn.addEventListener('click', loadAudioTabs);
  resetBtn.addEventListener('click', resetAllTabs);
}

/**
 * Update master volume display
 */
function updateMasterVolumeDisplay() {
  masterVolumeDisplay.textContent = `${masterVolume}%`;
  masterVolumeDisplay.className = `volume-display ${getVolumeClass(masterVolume)}`;
}

/**
 * Set master volume to specific value
 */
function setMasterVolume(volume) {
  masterVolume = volume;
  masterVolumeSlider.value = volume;
  updateMasterVolumeDisplay();
}

/**
 * Apply master volume to all audio tabs
 */
function applyMasterVolumeToAllTabs() {
  // Set flag to prevent unwanted refreshes from overriding our UI changes
  justAppliedMasterVolume = true;
  
  // Update local state immediately for better UX
  audioTabs.forEach(tab => {
    tab.volume = masterVolume;
  });
  
  // Update the UI immediately
  updateTabListDisplay();
  
  // Send to background
  browser.runtime.sendMessage({ action: 'applyToAllTabs', volume: masterVolume })
    .then(() => {
      // Clear the flag after a delay to allow normal refreshes
      setTimeout(() => {
        justAppliedMasterVolume = false;
      }, CONFIG.TIMING.MASTER_VOLUME_DELAY);
    })
    .catch(console.error);
}

/**
 * Reset all tabs to default volume
 */
function resetAllTabs() {
  browser.runtime.sendMessage({ action: 'resetAllTabs' })
    .then(() => {
      setMasterVolume(CONFIG.VOLUMES.DEFAULT);
      setTimeout(loadAudioTabs, CONFIG.TIMING.REFRESH_DELAY);
    })
    .catch(console.error);
}

/**
 * Load audio tabs from background script
 */
function loadAudioTabs() {
  // If we just applied master volume, don't reload to prevent UI flicker
  if (justAppliedMasterVolume) {
    return;
  }
  
  tabList.innerHTML = '<div class="loading">Loading audio tabs...</div>';
  
  browser.runtime.sendMessage({ action: 'getTabAudioStatus' })
    .then(response => {
      if (response?.tabs) {
        audioTabs = response.tabs;
        // Query each tab for its actual current volume to ensure accuracy
        syncTabVolumes().then(() => {
          renderTabList();
        });
      } else {
        showNoAudioMessage();
      }
    })
    .catch(error => {
      console.error('Failed to load audio tabs:', error);
      showNoAudioMessage();
    });
}

/**
 * Sync tab volumes by querying content scripts directly
 */
async function syncTabVolumes() {
  const volumePromises = audioTabs.map(async (tab) => {
    try {
      const response = await browser.tabs.sendMessage(tab.id, { action: 'getVolume' });
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

/**
 * Render the list of audio tabs
 */
function renderTabList() {
  if (audioTabs.length === 0) {
    showNoAudioMessage();
    return;
  }

  tabList.innerHTML = '';
  audioTabs.forEach(tab => {
    tabList.appendChild(createTabElement(tab));
  });
}

/**
 * Update the existing tab list display with current volume values
 */
function updateTabListDisplay() {
  const tabItems = tabList.querySelectorAll('.tab-item');
  
  tabItems.forEach(tabDiv => {
    const slider = tabDiv.querySelector('.volume-slider');
    const tabVolumeDisplay = tabDiv.querySelector('.tab-volume-display');
    
    if (slider && tabVolumeDisplay) {
      const tabId = parseInt(slider.getAttribute('data-tab-id'));
      const tab = audioTabs.find(t => t.id === tabId);
      
      if (tab) {
        // Update slider value
        slider.value = tab.volume;
        
        // Update display
        tabVolumeDisplay.textContent = `${tab.volume}%`;
        tabVolumeDisplay.className = `tab-volume-display ${getVolumeClass(tab.volume)}`;
      }
    }
  });
}

/**
 * Create a tab element for the UI
 */
function createTabElement(tab) {
  const tabDiv = document.createElement('div');
  tabDiv.className = 'tab-item';
  
  const volumeClass = getVolumeClass(tab.volume);
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
  setupTabEvents(tabDiv, tab);
  return tabDiv;
}

/**
 * Set up event listeners for a tab element
 */
function setupTabEvents(tabDiv, tab) {
  const slider = tabDiv.querySelector('.volume-slider');
  const tabVolumeDisplay = tabDiv.querySelector('.tab-volume-display');
  
  slider.addEventListener('input', (e) => {
    updateTabVolume(tab.id, parseInt(e.target.value), tabVolumeDisplay);
  });

  tabDiv.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const volume = parseInt(e.target.getAttribute('data-volume'));
      slider.value = volume;
      updateTabVolume(tab.id, volume, tabVolumeDisplay);
    });
  });
}

/**
 * Update volume for a specific tab
 */
function updateTabVolume(tabId, volume, tabVolumeDisplay) {
  // Update display immediately
  tabVolumeDisplay.textContent = `${volume}%`;
  tabVolumeDisplay.className = `tab-volume-display ${getVolumeClass(volume)}`;

  // Send to tab and background
  browser.tabs.sendMessage(tabId, { action: 'setVolume', volume })
    .then(() => {
      browser.runtime.sendMessage({ action: 'setVolume', tabId, volume });
      // Update local state
      const tab = audioTabs.find(t => t.id === tabId);
      if (tab) tab.volume = volume;
    })
    .catch(console.error);
}

/**
 * Get CSS class based on volume level
 */
function getVolumeClass(volume) {
  if (volume === 0) return CONFIG.CLASSES.VOLUME_MUTED;
  if (volume < CONFIG.VOLUME_THRESHOLDS.LOW) return CONFIG.CLASSES.VOLUME_LOW;
  if (volume > CONFIG.VOLUME_THRESHOLDS.HIGH) return CONFIG.CLASSES.VOLUME_HIGH;
  return CONFIG.CLASSES.VOLUME_NORMAL;
}

/**
 * Show message when no audio tabs are found
 */
function showNoAudioMessage() {
  tabList.innerHTML = `
    <div class="no-audio">
      No tabs with audio detected.<br>
      Start playing media to see volume controls.
    </div>
  `;
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
