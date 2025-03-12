// popup.js - Controls the popup UI behavior for multi-tab volume control
document.addEventListener('DOMContentLoaded', function() {
  // Constants
  const AUTO_EXPAND_THRESHOLD = 5; // Auto-expand when there are this many tabs or fewer
  const DEFAULT_VOLUME = 1.0;      // Default volume (100%)
  const STATUS_MESSAGE_DURATION = 2000; // Duration for status messages in ms
  const AUDIO_DETECTION_TIMEOUT = 5000; // Timeout for detecting audio in a tab
  
  // UI Elements
  const elements = {
    tabsContainer: document.getElementById('tabs-container'),
    noTabsMessage: document.getElementById('no-tabs-message'),
    statusMessage: document.getElementById('status-message'),
    refreshButton: document.getElementById('refresh-tabs'),
    resetButton: document.getElementById('reset-all'),
    
    // Master volume controls
    masterSlider: document.getElementById('master-volume-slider'),
    masterValue: document.getElementById('master-volume-value'),
    masterPresets: {
      '0': document.getElementById('master-preset-0'),
      '100': document.getElementById('master-preset-100'),
      '200': document.getElementById('master-preset-200'),
      '500': document.getElementById('master-preset-500'),
    },
    applyMasterButton: document.getElementById('apply-master-volume')
  };
  
  // Data
  const state = {
    currentTabs: [],
    tabVolumes: {} // Store volume values by tab ID
  };
  
  // Initialize the popup
  function initialize() {
    // Set up event listeners
    setupMasterVolumeListeners();
    setupButtonListeners();
    
    // Load tabs on popup open
    loadTabs();
  }
  
  // Set up master volume control listeners
  function setupMasterVolumeListeners() {
    // Master volume slider
    elements.masterSlider.addEventListener('input', function() {
      updateMasterVolumeDisplay(parseInt(this.value));
    });
    
    // Master presets
    elements.masterPresets['0'].addEventListener('click', () => updateMasterSlider(0));
    elements.masterPresets['100'].addEventListener('click', () => updateMasterSlider(100));
    elements.masterPresets['200'].addEventListener('click', () => updateMasterSlider(200));
    elements.masterPresets['500'].addEventListener('click', () => updateMasterSlider(500));
    
    // Apply to all tabs button
    elements.applyMasterButton.addEventListener('click', applyMasterVolumeToAllTabs);
  }
  
  // Set up global button listeners
  function setupButtonListeners() {
    // Refresh tabs button
    elements.refreshButton.addEventListener('click', function() {
      loadTabs();
      showStatus('Tab list refreshed');
    });
    
    // Reset all tabs button
    elements.resetButton.addEventListener('click', function() {
      resetAllTabs();
      showStatus('All tabs reset to 100% volume');
    });
  }
  
  // Show status message
  function showStatus(message, duration = STATUS_MESSAGE_DURATION) {
    elements.statusMessage.textContent = message;
    setTimeout(() => {
      elements.statusMessage.textContent = '';
    }, duration);
  }
  
  // Get all tabs and filter for audio tabs
  async function loadTabs() {
    elements.tabsContainer.innerHTML = '';
    state.currentTabs = [];
    
    try {
      // First get all tabs
      const allTabs = await browser.tabs.query({});
      
      // Then get audio status info from the background script
      const audioStatusResponse = await browser.runtime.sendMessage({
        action: "getTabAudioStatus"
      });
      
      // Get the tab IDs that have audio
      const tabAudioStatus = audioStatusResponse.tabAudioStatus || {};
      
      // If a browser-reported audible tab doesn't have a volume yet,
      // we need to get or set the volume (and detect if it really has audio elements)
      const audioTabPromises = allTabs
        .filter(tab => {
          // Keep tabs that are audible or have audio detected
          return tab.audible || tabAudioStatus[tab.id];
        })
        .map(getTabVolumeInfo);
      
      // Process all potential audio tabs
      const resolvedTabs = await Promise.all(audioTabPromises);
      
      // Filter to tabs that actually have audio
      const audioTabs = resolvedTabs.filter(tab => tab.hasAudio);
      state.currentTabs = audioTabs;
      
      if (audioTabs.length === 0) {
        // No audio tabs found
        elements.noTabsMessage.style.display = 'block';
      } else {
        // Create UI for each audio tab
        elements.noTabsMessage.style.display = 'none';
        audioTabs.forEach(createTabUI);
        
        // Auto-expand tabs if there are few of them
        if (audioTabs.length <= AUTO_EXPAND_THRESHOLD) {
          document.querySelectorAll('.tab-header').forEach(header => {
            header.click();
          });
        }
      }
    } catch (error) {
      console.error('Error loading tabs:', error);
      showStatus('Error loading tabs');
    }
  }
  
  // Get volume information for a tab - returns a Promise
function getTabVolumeInfo(tab) {
  return new Promise(resolve => {
    // Special case for 9GAG - always treat as having audio
    if (tab.url && tab.url.includes('9gag.com')) {
      tab.hasAudio = true;
      tab.volume = 1.0; // Default volume
      state.tabVolumes[tab.id] = 1.0;
      resolve(tab);
      return;
    }
    
    // Regular flow for other tabs
    browser.tabs.sendMessage(tab.id, { action: "getVolume" })
      .then(response => {
        if (response && response.volume !== undefined) {
          // Tab has volume control
          tab.volume = response.volume;
          tab.hasAudio = true;
          state.tabVolumes[tab.id] = response.volume;
          resolve(tab);
        } else {
          // Tab doesn't have volume control or couldn't get it
          tab.hasAudio = false;
          resolve(tab);
        }
      })
      .catch(() => {
        // Error fetching volume, tab probably doesn't have audio
        tab.hasAudio = false;
        resolve(tab);
      });
  });
}
  
  // Create UI for a single tab
  function createTabUI(tab) {
    const volumePercent = Math.round(tab.volume * 100);
    
    // Create tab container
    const tabItem = document.createElement('div');
    tabItem.className = 'tab-item';
    tabItem.dataset.tabId = tab.id;
    
    // Create header
    const tabHeader = createTabHeader(tab, volumePercent);
    
    // Create controls container
    const tabControls = createTabControls(tab, volumePercent);
    
    // Assemble tab item
    tabItem.appendChild(tabHeader);
    tabItem.appendChild(tabControls);
    
    // Add to container
    elements.tabsContainer.appendChild(tabItem);
  }
  
  // Create tab header with favicon, title, and volume badge
  function createTabHeader(tab, volumePercent) {
    const tabHeader = document.createElement('div');
    tabHeader.className = 'tab-header';
    
    // Add favicon
    const tabIcon = document.createElement('img');
    tabIcon.className = 'tab-icon';
    tabIcon.src = tab.favIconUrl || 'icons/icon16.svg';
    tabIcon.onerror = () => { tabIcon.src = 'icons/icon16.svg'; };
    
    // Add title
    const tabTitle = document.createElement('div');
    tabTitle.className = 'tab-title';
    tabTitle.title = tab.title;
    tabTitle.textContent = tab.title;
    
    // Add volume badge
    const volumeBadge = document.createElement('div');
    volumeBadge.className = 'tab-volume-badge';
    updateBadgeStyle(volumeBadge, volumePercent);
    volumeBadge.textContent = volumePercent + '%';
    
    // Add expand icon - FIXED: Use textContent instead of innerHTML
    const expandIcon = document.createElement('div');
    expandIcon.className = 'expand-icon';
    expandIcon.textContent = '▼';
    
    // Assemble header
    tabHeader.appendChild(tabIcon);
    tabHeader.appendChild(tabTitle);
    tabHeader.appendChild(volumeBadge);
    tabHeader.appendChild(expandIcon);
    
    // Add toggle functionality
    tabHeader.addEventListener('click', () => {
      const controls = tabHeader.nextElementSibling;
      controls.classList.toggle('active');
      tabHeader.classList.toggle('expanded');
      expandIcon.textContent = controls.classList.contains('active') ? '▲' : '▼';
    });
    
    return tabHeader;
  }
  
  // Create tab controls with slider and preset buttons
  function createTabControls(tab, volumePercent) {
    const tabControls = document.createElement('div');
    tabControls.className = 'tab-controls';
    
    // Create volume slider container
    const volumeSliderContainer = document.createElement('div');
    volumeSliderContainer.className = 'volume-slider-container';
    
    // Add min label
    const minLabel = document.createElement('span');
    minLabel.className = 'slider-label';
    minLabel.textContent = '0%';
    
    // Add volume slider
    const volumeSlider = document.createElement('input');
    volumeSlider.type = 'range';
    volumeSlider.min = '0';
    volumeSlider.max = '500';
    volumeSlider.value = volumePercent;
    volumeSlider.dataset.tabId = tab.id;
    
    // Add max label
    const maxLabel = document.createElement('span');
    maxLabel.className = 'slider-label';
    maxLabel.textContent = '500%';
    
    // Add value display
    const volumeValue = document.createElement('span');
    volumeValue.className = 'volume-value';
    updateBadgeStyle(volumeValue, volumePercent);
    volumeValue.textContent = volumePercent + '%';
    
    // Assemble slider container
    volumeSliderContainer.appendChild(minLabel);
    volumeSliderContainer.appendChild(volumeSlider);
    volumeSliderContainer.appendChild(maxLabel);
    volumeSliderContainer.appendChild(volumeValue);
    
    // Create preset buttons
    const presetContainer = document.createElement('div');
    presetContainer.className = 'tab-presets';
    
    const presets = [
      { value: 0, label: 'Mute' },
      { value: 100, label: '100%' },
      { value: 200, label: '200%' },
      { value: 500, label: '500%' }
    ];
    
    presets.forEach(preset => {
      const presetButton = document.createElement('button');
      presetButton.textContent = preset.label;
      presetButton.dataset.tabId = tab.id;
      presetButton.dataset.value = preset.value;
      presetButton.addEventListener('click', handlePresetClick);
      presetContainer.appendChild(presetButton);
    });
    
    // Add event listeners for slider
    volumeSlider.addEventListener('input', function() {
      const value = parseInt(this.value);
      volumeValue.textContent = value + '%';
      updateBadgeStyle(volumeValue, value);
    });
    
    volumeSlider.addEventListener('change', function() {
      const tabId = parseInt(this.dataset.tabId);
      const value = parseInt(this.value);
      const volume = value / 100;
      
      // Update tab volume badge
      const tabItem = document.querySelector(`.tab-item[data-tab-id="${tabId}"]`);
      const volBadge = tabItem.querySelector('.tab-volume-badge');
      volBadge.textContent = value + '%';
      updateBadgeStyle(volBadge, value);
      
      // Store and apply volume
      state.tabVolumes[tabId] = volume;
      applyVolumeToTab(tabId, volume);
      showStatus(`Tab volume set to ${value}%`);
    });
    
    // Assemble controls
    tabControls.appendChild(volumeSliderContainer);
    tabControls.appendChild(presetContainer);
    
    return tabControls;
  }
  
  // Helper to update badge style based on volume level
  function updateBadgeStyle(element, volumePercent) {
    element.classList.remove('muted-badge', 'amplified-badge');
    
    if (volumePercent === 0) {
      element.classList.add('muted-badge');
    } else if (volumePercent > 100) {
      element.classList.add('amplified-badge');
    }
  }
  
  // Handle preset button clicks
  function handlePresetClick(event) {
    const tabId = parseInt(event.target.dataset.tabId);
    const value = parseInt(event.target.dataset.value);
    const volume = value / 100;
    
    // Find and update the related tab UI
    const tabItem = document.querySelector(`.tab-item[data-tab-id="${tabId}"]`);
    const volumeSlider = tabItem.querySelector('input[type="range"]');
    const volumeValue = tabItem.querySelector('.volume-value');
    const volumeBadge = tabItem.querySelector('.tab-volume-badge');
    
    // Update slider and display
    volumeSlider.value = value;
    volumeValue.textContent = value + '%';
    volumeBadge.textContent = value + '%';
    
    // Update styling
    updateBadgeStyle(volumeValue, value);
    updateBadgeStyle(volumeBadge, value);
    
    // Store and apply volume
    state.tabVolumes[tabId] = volume;
    applyVolumeToTab(tabId, volume);
    showStatus(`Tab volume set to ${value}%`);
  }
  
  // Apply volume to a specific tab
  function applyVolumeToTab(tabId, volume) {
    browser.tabs.sendMessage(tabId, {
      action: "setVolume",
      volume: volume
    }).catch(error => {
      console.error(`Could not set volume for tab ${tabId}:`, error);
    });
  }
  
  // Update master volume slider and display
  function updateMasterSlider(value) {
    elements.masterSlider.value = value;
    updateMasterVolumeDisplay(value);
  }
  
  // Update the master volume display
  function updateMasterVolumeDisplay(value) {
    elements.masterValue.textContent = value + '%';
    updateBadgeStyle(elements.masterValue, value);
  }
  
  // Apply master volume to all tabs
  function applyMasterVolumeToAllTabs() {
    const volume = parseInt(elements.masterSlider.value) / 100;
    let appliedCount = 0;
    
    // Apply to all tabs with audio
    state.currentTabs.forEach(tab => {
      applyVolumeToTab(tab.id, volume);
      
      // Update the UI for each tab
      updateTabVolumeUI(tab.id, parseInt(elements.masterSlider.value));
      
      // Store the volume
      state.tabVolumes[tab.id] = volume;
      appliedCount++;
    });
    
    showStatus(`Volume set to ${elements.masterSlider.value}% for ${appliedCount} tabs`);
  }
  
  // Update the UI for a tab's volume
  function updateTabVolumeUI(tabId, volumePercent) {
    const tabItem = document.querySelector(`.tab-item[data-tab-id="${tabId}"]`);
    if (tabItem) {
      const volumeSlider = tabItem.querySelector('input[type="range"]');
      const volumeValue = tabItem.querySelector('.volume-value');
      const volumeBadge = tabItem.querySelector('.tab-volume-badge');
      
      volumeSlider.value = volumePercent;
      volumeValue.textContent = volumePercent + '%';
      volumeBadge.textContent = volumePercent + '%';
      
      updateBadgeStyle(volumeValue, volumePercent);
      updateBadgeStyle(volumeBadge, volumePercent);
    }
  }
  
  // Reset all tabs to default volume
  function resetAllTabs() {
    state.currentTabs.forEach(tab => {
      applyVolumeToTab(tab.id, DEFAULT_VOLUME);
      state.tabVolumes[tab.id] = DEFAULT_VOLUME;
    });
    
    // Reload tabs to update UI
    loadTabs();
  }
  
  // Start the application
  initialize();
});