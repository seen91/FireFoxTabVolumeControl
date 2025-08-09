/**
 * Firefox Tab Volume Control - Popup Script
 * Manages the popup interface for controlling tab volumes
 */

// DOM elements and state
let masterVolumeSlider, masterVolumeDisplay, tabList, applyToAllBtn, refreshBtn, resetBtn;
let audioTabs = [];
let masterVolume = 100;

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
  browser.runtime.sendMessage({ action: 'applyToAllTabs', volume: masterVolume })
    .then(() => setTimeout(loadAudioTabs, 500))
    .catch(console.error);
}

/**
 * Reset all tabs to default volume
 */
function resetAllTabs() {
  browser.runtime.sendMessage({ action: 'resetAllTabs' })
    .then(() => {
      setMasterVolume(100);
      setTimeout(loadAudioTabs, 500);
    })
    .catch(console.error);
}

/**
 * Load audio tabs from background script
 */
function loadAudioTabs() {
  tabList.innerHTML = '<div class="loading">Loading audio tabs...</div>';
  
  browser.runtime.sendMessage({ action: 'getTabAudioStatus' })
    .then(response => {
      if (response?.tabs) {
        audioTabs = response.tabs;
        renderTabList();
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
 * Create a tab element for the UI
 */
function createTabElement(tab) {
  const tabDiv = document.createElement('div');
  tabDiv.className = 'tab-item';
  
  const volumeClass = getVolumeClass(tab.volume);
  const favicon = tab.favIconUrl || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="%23ccc"/></svg>';
  
  tabDiv.innerHTML = `
    <div class="tab-header">
      <img class="tab-favicon" src="${favicon}" alt="">
      <span class="tab-title" title="${tab.title}">${tab.title}</span>
      <span class="tab-volume-display ${volumeClass}">${tab.volume}%</span>
    </div>
    <div class="volume-container">
      <div class="volume-slider-container">
        <span class="volume-label">0%</span>
        <input type="range" class="volume-slider" min="0" max="500" value="${tab.volume}" data-tab-id="${tab.id}">
        <span class="volume-label">500%</span>
      </div>
      <div class="preset-buttons">
        <button class="preset-btn" data-tab-id="${tab.id}" data-volume="0">Mute</button>
        <button class="preset-btn" data-tab-id="${tab.id}" data-volume="100">100%</button>
        <button class="preset-btn" data-tab-id="${tab.id}" data-volume="200">200%</button>
        <button class="preset-btn" data-tab-id="${tab.id}" data-volume="500">500%</button>
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
  if (volume === 0) return 'volume-muted';
  if (volume < 50) return 'volume-low';
  if (volume > 150) return 'volume-high';
  return 'volume-normal';
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
