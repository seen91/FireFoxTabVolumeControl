// DOM elements and state
let masterVolumeSlider, masterVolumeDisplay, tabList, applyToAllBtn, refreshBtn, resetBtn;
let audioTabs = [];
let masterVolume = 100;

function init() {
  // Get elements
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

  // Listen for audio status changes from background script
  browser.runtime.onMessage.addListener((message) => {
    if (message.action === 'audioStatusChanged') {
      loadAudioTabs();
    }
  });

  // Set up events
  masterVolumeSlider.addEventListener('input', (e) => {
    masterVolume = parseInt(e.target.value);
    updateMasterVolumeDisplay();
  });

  document.querySelectorAll('.master-control .preset-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      setMasterVolume(parseInt(e.target.getAttribute('data-volume')));
    });
  });

  applyToAllBtn.addEventListener('click', applyMasterVolumeToAllTabs);
  refreshBtn.addEventListener('click', loadAudioTabs);
  resetBtn.addEventListener('click', resetAllTabs);

  loadAudioTabs();
}

function updateMasterVolumeDisplay() {
  masterVolumeDisplay.textContent = `${masterVolume}%`;
  masterVolumeDisplay.className = `volume-display ${getVolumeClass(masterVolume)}`;
}

function setMasterVolume(volume) {
  masterVolume = volume;
  masterVolumeSlider.value = volume;
  updateMasterVolumeDisplay();
}

function applyMasterVolumeToAllTabs() {
  browser.runtime.sendMessage({ action: 'applyToAllTabs', volume: masterVolume })
    .then(() => setTimeout(loadAudioTabs, 500))
    .catch(console.error);
}

function resetAllTabs() {
  browser.runtime.sendMessage({ action: 'resetAllTabs' })
    .then(() => {
      setMasterVolume(100);
      setTimeout(loadAudioTabs, 500);
    })
    .catch(console.error);
}

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
        <span class="volume-display ${volumeClass}">${tab.volume}%</span>
      </div>
      <div class="preset-buttons">
        <button class="preset-btn" data-tab-id="${tab.id}" data-volume="0">Mute</button>
        <button class="preset-btn" data-tab-id="${tab.id}" data-volume="100">100%</button>
        <button class="preset-btn" data-tab-id="${tab.id}" data-volume="200">200%</button>
        <button class="preset-btn" data-tab-id="${tab.id}" data-volume="500">500%</button>
      </div>
    </div>
  `;

  // Set up events
  const slider = tabDiv.querySelector('.volume-slider');
  const volumeDisplay = tabDiv.querySelector('.volume-display');
  const tabVolumeDisplay = tabDiv.querySelector('.tab-volume-display');
  
  slider.addEventListener('input', (e) => {
    updateTabVolume(tab.id, parseInt(e.target.value), volumeDisplay, tabVolumeDisplay);
  });

  tabDiv.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const volume = parseInt(e.target.getAttribute('data-volume'));
      slider.value = volume;
      updateTabVolume(tab.id, volume, volumeDisplay, tabVolumeDisplay);
    });
  });

  return tabDiv;
}

function updateTabVolume(tabId, volume, volumeDisplay, tabVolumeDisplay) {
  // Update displays immediately
  volumeDisplay.textContent = `${volume}%`;
  tabVolumeDisplay.textContent = `${volume}%`;
  
  const volumeClass = getVolumeClass(volume);
  volumeDisplay.className = `volume-display ${volumeClass}`;
  tabVolumeDisplay.className = `tab-volume-display ${volumeClass}`;

  // Send to tab
  browser.tabs.sendMessage(tabId, { action: 'setVolume', volume })
    .then(() => {
      browser.runtime.sendMessage({ action: 'setVolume', tabId, volume });
      const tab = audioTabs.find(t => t.id === tabId);
      if (tab) tab.volume = volume;
    })
    .catch(console.error);
}

function getVolumeClass(volume) {
  if (volume === 0) return 'volume-muted';
  if (volume < 50) return 'volume-low';
  if (volume > 150) return 'volume-high';
  return 'volume-normal';
}

function showNoAudioMessage() {
  tabList.innerHTML = `
    <div class="no-audio">
      No tabs with audio detected.<br>
      Play some media and click "Refresh Tab List".
    </div>
  `;
}

document.addEventListener('DOMContentLoaded', init);
