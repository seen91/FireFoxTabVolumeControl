/**
 * UI Manager for Tab Volume Control popup
 * Handles UI creation, updates and element interactions
 */

// Create namespace to avoid global pollution
const UIManager = {};

// Constants
UIManager.STATUS_MESSAGE_DURATION = 2000; // Duration for status messages in ms
UIManager.AUTO_EXPAND_THRESHOLD = 5; // Auto-expand when there are this many tabs or fewer

/**
 * Initialize UI elements references
 * @returns {Object} Object containing references to UI elements
 */
UIManager.initializeElements = function() {
  return {
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
};

/**
 * Create UI for a single tab
 * @param {Object} tab - Tab object
 * @param {Function} handlePresetClick - Function to handle preset button clicks
 * @param {Function} applyVolumeToTab - Function to apply volume to a tab
 * @param {Function} showStatus - Function to show status messages
 * @returns {HTMLElement} The created tab UI element
 */
UIManager.createTabUI = function(tab, handlePresetClick, applyVolumeToTab, showStatus) {
  const volumePercent = Math.round(tab.volume * 100);
  
  // Create tab container with fade-in effect
  const tabItem = document.createElement('div');
  tabItem.className = 'tab-item';
  tabItem.dataset.tabId = tab.id;
  tabItem.style.opacity = '0';
  
  // Create header
  const tabHeader = UIManager.createTabHeader(tab, volumePercent);
  
  // Create controls container
  const tabControls = UIManager.createTabControls(tab, volumePercent, handlePresetClick, applyVolumeToTab, showStatus);
  
  // Assemble tab item
  tabItem.appendChild(tabHeader);
  tabItem.appendChild(tabControls);
  
  // Trigger reflow and fade in
  setTimeout(() => {
    tabItem.style.transition = 'opacity 0.3s ease-in';
    tabItem.style.opacity = '1';
  }, 10);
  
  return tabItem;
};

/**
 * Create tab header with favicon, title, and volume badge
 * @param {Object} tab - Tab object
 * @param {number} volumePercent - Volume percentage
 * @returns {HTMLElement} The created tab header element
 */
UIManager.createTabHeader = function(tab, volumePercent) {
  const tabHeader = document.createElement('div');
  tabHeader.className = 'tab-header';
  
  // Add favicon
  const tabIcon = document.createElement('img');
  tabIcon.className = 'tab-icon';
  tabIcon.src = tab.favIconUrl || '../../../icons/icon16.svg';
  tabIcon.onerror = () => { tabIcon.src = '../../../icons/icon16.svg'; };
  
  // Add title
  const tabTitle = document.createElement('div');
  tabTitle.className = 'tab-title';
  tabTitle.title = tab.title;
  tabTitle.textContent = tab.title;
  
  // Add volume badge
  const volumeBadge = document.createElement('div');
  volumeBadge.className = 'tab-volume-badge';
  UIManager.updateBadgeStyle(volumeBadge, volumePercent);
  volumeBadge.textContent = volumePercent + '%';
  
  // Add expand icon
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
};

/**
 * Create tab controls with slider and preset buttons
 * @param {Object} tab - Tab object
 * @param {number} volumePercent - Volume percentage
 * @param {Function} handlePresetClick - Function to handle preset button clicks
 * @param {Function} applyVolumeToTab - Function to apply volume to a tab
 * @param {Function} showStatus - Function to show status messages
 * @returns {HTMLElement} The created tab controls element
 */
UIManager.createTabControls = function(tab, volumePercent, handlePresetClick, applyVolumeToTab, showStatus) {
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
  UIManager.updateBadgeStyle(volumeValue, volumePercent);
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
    UIManager.updateBadgeStyle(volumeValue, value);
  });
  
  volumeSlider.addEventListener('change', function() {
    const tabId = parseInt(this.dataset.tabId);
    const value = parseInt(this.value);
    const volume = value / 100;
    
    // Update tab volume badge
    const tabItem = document.querySelector(`.tab-item[data-tab-id="${tabId}"]`);
    const volBadge = tabItem.querySelector('.tab-volume-badge');
    volBadge.textContent = value + '%';
    UIManager.updateBadgeStyle(volBadge, value);
    
    // Apply volume
    applyVolumeToTab(tabId, volume);
    showStatus(`Tab volume set to ${value}%`);
  });
  
  // Assemble controls
  tabControls.appendChild(volumeSliderContainer);
  tabControls.appendChild(presetContainer);
  
  return tabControls;
};

/**
 * Show status message
 * @param {string} message - Message to display
 * @param {number} duration - Duration in milliseconds
 * @param {HTMLElement} statusElement - Status message element
 */
UIManager.showStatus = function(message, statusElement, duration = UIManager.STATUS_MESSAGE_DURATION) {
  statusElement.textContent = message;
  setTimeout(() => {
    statusElement.textContent = '';
  }, duration);
};

/**
 * Update badge style based on volume level
 * @param {HTMLElement} element - Element to update
 * @param {number} volumePercent - Volume percentage
 */
UIManager.updateBadgeStyle = function(element, volumePercent) {
  element.classList.remove('muted-badge', 'amplified-badge');
  if (volumePercent === 0) {
    element.classList.add('muted-badge');
  } else if (volumePercent > 100) {
    element.classList.add('amplified-badge');
  }
};

/**
 * Update tab title in the UI
 * @param {number} tabId - Tab ID
 * @param {string} newTitle - New title
 */
UIManager.updateTabTitle = function(tabId, newTitle) {
  // Update the UI
  const tabTitleElement = document.querySelector(`.tab-item[data-tab-id="${tabId}"] .tab-title`);
  if (tabTitleElement) {
    tabTitleElement.textContent = newTitle;
    tabTitleElement.title = newTitle;
  }
};

/**
 * Update the tab volume UI
 * @param {number} tabId - Tab ID
 * @param {number} volumePercent - Volume percentage
 */
UIManager.updateTabVolumeUI = function(tabId, volumePercent) {
  const tabItem = document.querySelector(`.tab-item[data-tab-id="${tabId}"]`);
  if (tabItem) {
    const volumeSlider = tabItem.querySelector('input[type="range"]');
    const volumeValue = tabItem.querySelector('.volume-value');
    const volumeBadge = tabItem.querySelector('.tab-volume-badge');
    
    volumeSlider.value = volumePercent;
    volumeValue.textContent = volumePercent + '%';
    volumeBadge.textContent = volumePercent + '%';
    
    UIManager.updateBadgeStyle(volumeValue, volumePercent);
    UIManager.updateBadgeStyle(volumeBadge, volumePercent);
  }
};

/**
 * Update the master volume display
 * @param {number} value - Volume value
 * @param {HTMLElement} masterValueElement - Master value display element
 */
UIManager.updateMasterVolumeDisplay = function(value, masterValueElement) {
  masterValueElement.textContent = value + '%';
  UIManager.updateBadgeStyle(masterValueElement, value);
};

/**
 * Auto-expand tabs if there are few of them
 * @param {NodeList} headers - Tab headers
 * @param {number} tabCount - Number of tabs
 */
UIManager.autoExpandTabs = function(headers, tabCount) {
  if (tabCount <= UIManager.AUTO_EXPAND_THRESHOLD) {
    headers.forEach(header => {
      header.click();
    });
  }
};

/**
 * Remove a tab from the UI with a fade-out effect
 * @param {number} tabId - Tab ID
 * @param {HTMLElement} noTabsMessageElement - No tabs message element
 * @param {Function} onRemoveComplete - Callback after removal is complete
 */
UIManager.removeTabFromUI = function(tabId, noTabsMessageElement, onRemoveComplete) {
  const tabElement = document.querySelector(`.tab-item[data-tab-id="${tabId}"]`);
  if (tabElement) {
    tabElement.style.transition = 'opacity 0.3s ease-out';
    tabElement.style.opacity = '0';
    
    setTimeout(() => {
      if (tabElement.parentNode) {
        tabElement.parentNode.removeChild(tabElement);
      }
      
      onRemoveComplete();
    }, 300); // Match transition time
  }
};