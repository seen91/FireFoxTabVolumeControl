// popup.js - Controls the popup UI behavior for multi-tab volume control
document.addEventListener('DOMContentLoaded', function() {
  // UI Elements
  const tabsContainer = document.getElementById('tabs-container');
  const noTabsMessage = document.getElementById('no-tabs-message');
  const statusMessage = document.getElementById('status-message');
  const refreshTabsButton = document.getElementById('refresh-tabs');
  const resetAllButton = document.getElementById('reset-all');
  
  // Master volume controls
  const masterVolumeSlider = document.getElementById('master-volume-slider');
  const masterVolumeValue = document.getElementById('master-volume-value');
  const masterPreset0 = document.getElementById('master-preset-0');
  const masterPreset100 = document.getElementById('master-preset-100');
  const masterPreset200 = document.getElementById('master-preset-200');
  const masterPreset500 = document.getElementById('master-preset-500');
  const applyMasterVolumeButton = document.getElementById('apply-master-volume');
  
  // Track current tabs
  let currentTabs = [];
  let tabVolumes = {}; // Store volume values by tab ID
  
  // Show status message
  function showStatus(message, duration = 2000) {
    statusMessage.textContent = message;
    setTimeout(() => {
      statusMessage.textContent = '';
    }, duration);
  }
  
  // Load all tabs with their current volume settings
  function loadTabs() {
    tabsContainer.innerHTML = '';
    currentTabs = [];
    
    browser.tabs.query({})
      .then(tabs => {
        // Get volume information for each tab
        const promises = tabs.map(tab => {
          return new Promise(resolve => {
            // Try to get the tab's volume
            browser.tabs.sendMessage(tab.id, { action: "getVolume" })
              .then(response => {
                if (response && response.volume !== undefined) {
                  // Tab has volume control
                  tab.volume = response.volume;
                  tab.hasAudio = true;
                  tabVolumes[tab.id] = response.volume;
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
        });
        
        // Process all tabs after volume information is collected
        Promise.all(promises)
          .then(resolvedTabs => {
            // Filter tabs with audio
            const audioTabs = resolvedTabs.filter(tab => tab.hasAudio);
            currentTabs = audioTabs;
            
            if (audioTabs.length === 0) {
              // No audio tabs found
              noTabsMessage.style.display = 'block';
            } else {
              // Create UI for each audio tab
              noTabsMessage.style.display = 'none';
              audioTabs.forEach(createTabUI);
            }
          });
      })
      .catch(error => {
        console.error('Error loading tabs:', error);
        showStatus('Error loading tabs');
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
    if (volumePercent === 0) {
      volumeBadge.classList.add('muted-badge');
    } else if (volumePercent > 100) {
      volumeBadge.classList.add('amplified-badge');
    }
    volumeBadge.textContent = volumePercent + '%';
    
    // Add expand icon
    const expandIcon = document.createElement('div');
    expandIcon.className = 'expand-icon';
    expandIcon.innerHTML = '▼';
    
    // Assemble header
    tabHeader.appendChild(tabIcon);
    tabHeader.appendChild(tabTitle);
    tabHeader.appendChild(volumeBadge);
    tabHeader.appendChild(expandIcon);
    
    // Create controls container
    const tabControls = document.createElement('div');
    tabControls.className = 'tab-controls';
    
    // Create volume slider
    const volumeSliderContainer = document.createElement('div');
    volumeSliderContainer.className = 'volume-slider-container';
    
    const minLabel = document.createElement('span');
    minLabel.className = 'slider-label';
    minLabel.textContent = '0%';
    
    const volumeSlider = document.createElement('input');
    volumeSlider.type = 'range';
    volumeSlider.min = '0';
    volumeSlider.max = '500';
    volumeSlider.value = volumePercent;
    volumeSlider.dataset.tabId = tab.id;
    
    const maxLabel = document.createElement('span');
    maxLabel.className = 'slider-label';
    maxLabel.textContent = '500%';
    
    const volumeValue = document.createElement('span');
    volumeValue.className = 'volume-value';
    if (volumePercent === 0) {
      volumeValue.classList.add('muted-badge');
    } else if (volumePercent > 100) {
      volumeValue.classList.add('amplified-badge');
    }
    volumeValue.textContent = volumePercent + '%';
    
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
    
    // Assemble controls
    tabControls.appendChild(volumeSliderContainer);
    tabControls.appendChild(presetContainer);
    
    // Assemble tab item
    tabItem.appendChild(tabHeader);
    tabItem.appendChild(tabControls);
    
    // Add to container
    tabsContainer.appendChild(tabItem);
    
    // Add event listeners
    tabHeader.addEventListener('click', () => {
      tabControls.classList.toggle('active');
      tabHeader.classList.toggle('expanded');
    });
    
    volumeSlider.addEventListener('input', function() {
      volumeValue.textContent = this.value + '%';
      
      // Update badge styling
      if (parseInt(this.value) === 0) {
        volumeValue.classList.add('muted-badge');
        volumeValue.classList.remove('amplified-badge');
      } else if (parseInt(this.value) > 100) {
        volumeValue.classList.add('amplified-badge');
        volumeValue.classList.remove('muted-badge');
      } else {
        volumeValue.classList.remove('muted-badge');
        volumeValue.classList.remove('amplified-badge');
      }
    });
    
    volumeSlider.addEventListener('change', function() {
      const tabId = parseInt(this.dataset.tabId);
      const volume = parseInt(this.value) / 100;
      
      // Update tab volume badge
      const volBadge = tabItem.querySelector('.tab-volume-badge');
      volBadge.textContent = this.value + '%';
      
      if (parseInt(this.value) === 0) {
        volBadge.classList.add('muted-badge');
        volBadge.classList.remove('amplified-badge');
      } else if (parseInt(this.value) > 100) {
        volBadge.classList.add('amplified-badge');
        volBadge.classList.remove('muted-badge');
      } else {
        volBadge.classList.remove('muted-badge');
        volBadge.classList.remove('amplified-badge');
      }
      
      // Store volume for this tab
      tabVolumes[tabId] = volume;
      
      // Apply volume to tab
      applyVolumeToTab(tabId, volume);
      
      showStatus(`Tab volume set to ${this.value}%`);
    });
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
    
    // Update badge styling
    if (value === 0) {
      volumeValue.classList.add('muted-badge');
      volumeValue.classList.remove('amplified-badge');
      volumeBadge.classList.add('muted-badge');
      volumeBadge.classList.remove('amplified-badge');
    } else if (value > 100) {
      volumeValue.classList.add('amplified-badge');
      volumeValue.classList.remove('muted-badge');
      volumeBadge.classList.add('amplified-badge');
      volumeBadge.classList.remove('muted-badge');
    } else {
      volumeValue.classList.remove('muted-badge');
      volumeValue.classList.remove('amplified-badge');
      volumeBadge.classList.remove('muted-badge');
      volumeBadge.classList.remove('amplified-badge');
    }
    
    // Store volume for this tab
    tabVolumes[tabId] = volume;
    
    // Apply volume to tab
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
  
  // Master volume control event listeners
  masterVolumeSlider.addEventListener('input', function() {
    masterVolumeValue.textContent = this.value + '%';
    
    // Update badge styling
    if (parseInt(this.value) === 0) {
      masterVolumeValue.classList.add('muted-badge');
      masterVolumeValue.classList.remove('amplified-badge');
    } else if (parseInt(this.value) > 100) {
      masterVolumeValue.classList.add('amplified-badge');
      masterVolumeValue.classList.remove('muted-badge');
    } else {
      masterVolumeValue.classList.remove('muted-badge');
      masterVolumeValue.classList.remove('amplified-badge');
    }
  });
  
  // Master presets
  masterPreset0.addEventListener('click', function() {
    updateMasterSlider(0);
  });
  
  masterPreset100.addEventListener('click', function() {
    updateMasterSlider(100);
  });
  
  masterPreset200.addEventListener('click', function() {
    updateMasterSlider(200);
  });
  
  masterPreset500.addEventListener('click', function() {
    updateMasterSlider(500);
  });
  
  function updateMasterSlider(value) {
    masterVolumeSlider.value = value;
    masterVolumeValue.textContent = value + '%';
    
    if (value === 0) {
      masterVolumeValue.classList.add('muted-badge');
      masterVolumeValue.classList.remove('amplified-badge');
    } else if (value > 100) {
      masterVolumeValue.classList.add('amplified-badge');
      masterVolumeValue.classList.remove('muted-badge');
    } else {
      masterVolumeValue.classList.remove('muted-badge');
      masterVolumeValue.classList.remove('amplified-badge');
    }
  }
  
  // Apply master volume to all tabs
  applyMasterVolumeButton.addEventListener('click', function() {
    const volume = parseInt(masterVolumeSlider.value) / 100;
    
    // Apply to all tabs with audio
    let appliedCount = 0;
    currentTabs.forEach(tab => {
      applyVolumeToTab(tab.id, volume);
      
      // Update the UI for each tab
      const tabItem = document.querySelector(`.tab-item[data-tab-id="${tab.id}"]`);
      if (tabItem) {
        const volumeSlider = tabItem.querySelector('input[type="range"]');
        const volumeValue = tabItem.querySelector('.volume-value');
        const volumeBadge = tabItem.querySelector('.tab-volume-badge');
        
        volumeSlider.value = masterVolumeSlider.value;
        volumeValue.textContent = masterVolumeSlider.value + '%';
        volumeBadge.textContent = masterVolumeSlider.value + '%';
        
        // Update styling
        if (parseInt(masterVolumeSlider.value) === 0) {
          volumeValue.classList.add('muted-badge');
          volumeValue.classList.remove('amplified-badge');
          volumeBadge.classList.add('muted-badge');
          volumeBadge.classList.remove('amplified-badge');
        } else if (parseInt(masterVolumeSlider.value) > 100) {
          volumeValue.classList.add('amplified-badge');
          volumeValue.classList.remove('muted-badge');
          volumeBadge.classList.add('amplified-badge');
          volumeBadge.classList.remove('muted-badge');
        } else {
          volumeValue.classList.remove('muted-badge');
          volumeValue.classList.remove('amplified-badge');
          volumeBadge.classList.remove('muted-badge');
          volumeBadge.classList.remove('amplified-badge');
        }
      }
      
      // Store the volume
      tabVolumes[tab.id] = volume;
      appliedCount++;
    });
    
    showStatus(`Volume set to ${masterVolumeSlider.value}% for ${appliedCount} tabs`);
  });
  
  // Refresh tabs button
  refreshTabsButton.addEventListener('click', function() {
    loadTabs();
    showStatus('Tab list refreshed');
  });
  
  // Reset all tabs button
  resetAllButton.addEventListener('click', function() {
    const defaultVolume = 1.0; // 100%
    
    currentTabs.forEach(tab => {
      applyVolumeToTab(tab.id, defaultVolume);
      tabVolumes[tab.id] = defaultVolume;
    });
    
    // Reload tabs to update UI
    loadTabs();
    showStatus('All tabs reset to 100% volume');
  });
  
  // Load tabs on popup open
  loadTabs();
});