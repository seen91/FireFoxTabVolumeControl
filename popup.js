// popup.js - Controls the popup UI behavior for multi-tab volume control
document.addEventListener('DOMContentLoaded', function() {
  // Constants
  const AUTO_EXPAND_THRESHOLD = 5; // Auto-expand when there are this many tabs or fewer
  const DEFAULT_VOLUME = 1.0;      // Default volume (100%)
  const STATUS_MESSAGE_DURATION = 2000; // Duration for status messages in ms
  const AUDIO_DETECTION_TIMEOUT = 5000; // Timeout for detecting audio in a tab
  const UPDATE_DEBOUNCE_TIME = 300;  // Debounce time for updates in ms
  
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
    tabVolumes: {}, // Store volume values by tab ID
    audioStatusListener: null,
    isPopupActive: true,
    pendingUpdates: new Set(), // Store pending tab updates
    pendingUpdateTimer: null,  // For debouncing updates
    initialLoadComplete: false // Flag to track initial load
  };
  
  // Initialize the popup
  function initialize() {
    // Set up event listeners
    setupMasterVolumeListeners();
    setupButtonListeners();
    setupAudioStatusListener();
    
    // Load tabs on popup open
    loadTabs();
    
    // Add visibility change listener to handle popup being hidden/shown
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }
  
  // Handle visibility change for the popup
  function handleVisibilityChange() {
    state.isPopupActive = document.visibilityState === 'visible';
    
    // Refresh tabs when popup becomes visible again
    if (state.isPopupActive) {
      // Update tab titles for existing tabs before doing a full reload
      updateAllTabTitles().then(() => {
        // Only do a full reload if we've been hidden for a while
        loadTabs();
      }).catch(error => {
        console.error('Error updating tab titles:', error);
        // Fall back to full reload
        loadTabs();
      });
    }
  }
  
  // Update titles for all current tabs from the browser
  async function updateAllTabTitles() {
    if (state.currentTabs.length === 0) return;
    
    // Get fresh info for all tabs
    const tabPromises = state.currentTabs.map(tab => 
      browser.tabs.get(tab.id).catch(() => null)  // Return null if tab doesn't exist anymore
    );
    
    const updatedTabs = await Promise.all(tabPromises);
    
    // Update titles for tabs that still exist
    updatedTabs.forEach(updatedTab => {
      if (updatedTab && updatedTab.title) {
        updateTabTitle(updatedTab.id, updatedTab.title);
      }
    });
  }
  
  // Set up listener for audio status changes
  function setupAudioStatusListener() {
    // Set up message listener for tab audio status changes
    state.audioStatusListener = browser.runtime.onMessage.addListener((message) => {
      if (!state.isPopupActive || !state.initialLoadComplete) return;
      
      // Handle tab audio started
      if (message.action === "tabAudioStarted" && message.tabId) {
        queueTabUpdate(message.tabId, 'add');
      }
      
      // Handle tab audio stopped
      if (message.action === "tabAudioStopped" && message.tabId) {
        queueTabUpdate(message.tabId, 'remove');
      }
      
      // Handle tab title changed
      if (message.action === "tabTitleChanged" && message.tabId && message.title) {
        updateTabTitle(message.tabId, message.title);
      }
      
      // Handle tab audio list update (reduce frequency by ignoring if we have pending updates)
      if (message.action === "tabAudioListUpdated" && state.pendingUpdates.size === 0) {
        // We'll only do incremental updates, not full reloads
        processPendingUpdates();
      }
    });
  }
  
  // Update tab title in the UI
  function updateTabTitle(tabId, newTitle) {
    // Find the tab in our current tabs list
    const tabIndex = state.currentTabs.findIndex(tab => tab.id === tabId);
    if (tabIndex !== -1) {
      state.currentTabs[tabIndex].title = newTitle;
    }
    
    // Update the UI
    const tabTitleElement = document.querySelector(`.tab-item[data-tab-id="${tabId}"] .tab-title`);
    if (tabTitleElement) {
      tabTitleElement.textContent = newTitle;
      tabTitleElement.title = newTitle;
    }
  }

  // Queue a tab update to avoid multiple rapid UI changes
  function queueTabUpdate(tabId, action) {
    // Store the action with the tab ID
    state.pendingUpdates.add({ tabId, action });
    
    // Debounce the updates
    if (state.pendingUpdateTimer) {
      clearTimeout(state.pendingUpdateTimer);
    }
    
    state.pendingUpdateTimer = setTimeout(() => {
      processPendingUpdates();
    }, UPDATE_DEBOUNCE_TIME);
  }
  
  // Process all pending tab updates
  function processPendingUpdates() {
    if (state.pendingUpdates.size === 0) return;
    
    const updates = [...state.pendingUpdates];
    state.pendingUpdates.clear();
    
    // Process removals first to avoid flickering
    const removals = updates.filter(update => update.action === 'remove');
    const additions = updates.filter(update => update.action === 'add');
    
    // Handle removals
    for (const update of removals) {
      handleTabAudioStopped(update.tabId);
    }
    
    // Handle additions
    if (additions.length > 0) {
      Promise.all(additions.map(update => 
        handleTabAudioStartedAsync(update.tabId)
      )).catch(error => {
        console.error('Error processing tab additions:', error);
      });
    }
  }
  
  // Handle when a tab starts playing audio, returning a Promise
  async function handleTabAudioStartedAsync(tabId) {
    // Check if this tab is already in our list
    const tabExists = state.currentTabs.some(tab => tab.id === tabId);
    if (tabExists) return;
    
    try {
      // Get tab info
      const tab = await browser.tabs.get(tabId);
      const tabInfo = await getTabVolumeInfo(tab);
      
      // Only add if it actually has audio
      if (tabInfo.hasAudio) {
        state.currentTabs.push(tabInfo);
        createTabUI(tabInfo);
        
        // Update no tabs message
        elements.noTabsMessage.style.display = 'none';
        
        // Auto-expand if needed
        if (state.currentTabs.length <= AUTO_EXPAND_THRESHOLD) {
          const header = document.querySelector(`.tab-item[data-tab-id="${tabId}"] .tab-header`);
          if (header) header.click();
        }
      }
    } catch (error) {
      console.error(`Error adding new audio tab ${tabId}:`, error);
    }
  }
  
  // Handle when a tab starts playing audio (non-async version)
  function handleTabAudioStarted(tabId) {
    handleTabAudioStartedAsync(tabId).catch(error => {
      console.error(`Error handling tab audio start for ${tabId}:`, error);
    });
  }
  
  // Handle when a tab stops playing audio
  function handleTabAudioStopped(tabId) {
    // Find the tab in our list
    const tabIndex = state.currentTabs.findIndex(tab => tab.id === tabId);
    if (tabIndex === -1) return;
    
    // Remove the tab from our state
    state.currentTabs.splice(tabIndex, 1);
    
    // Remove the tab UI - use smooth fade
    const tabElement = document.querySelector(`.tab-item[data-tab-id="${tabId}"]`);
    if (tabElement) {
      tabElement.style.transition = 'opacity 0.3s ease-out';
      tabElement.style.opacity = '0';
      
      setTimeout(() => {
        if (tabElement.parentNode) {
          tabElement.parentNode.removeChild(tabElement);
        }
        
        // Show no tabs message if needed
        if (state.currentTabs.length === 0) {
          elements.noTabsMessage.style.display = 'block';
        }
      }, 300); // Match transition time
    }
  }
  
  // Refresh the tab list completely, but only when explicitly requested
  async function refreshTabList() {
    // Cancel any pending updates
    if (state.pendingUpdateTimer) {
      clearTimeout(state.pendingUpdateTimer);
      state.pendingUpdateTimer = null;
    }
    state.pendingUpdates.clear();
    
    // Clear current tabs first
    state.currentTabs = [];
    elements.tabsContainer.innerHTML = '';
    
    // Reset the state and load tabs again
    await loadTabs();
    
    // Show a status message
    showStatus("Tab list refreshed with latest information");
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
      refreshTabList(); // Changed from loadTabs() to use our enhanced refresh function
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
    // Mark as not loaded during refresh
    state.initialLoadComplete = false;
    
    // Clear existing timer and pending updates
    if (state.pendingUpdateTimer) {
      clearTimeout(state.pendingUpdateTimer);
      state.pendingUpdateTimer = null;
    }
    state.pendingUpdates.clear();
    
    // Clear current tabs
    state.currentTabs = [];
    elements.tabsContainer.innerHTML = '';
    
    // First get all tabs
    try {
      const allTabs = await browser.tabs.query({});
      
      // Request an immediate scan for audio tabs
      await browser.runtime.sendMessage({ action: "scanTabsForAudio" });
      
      // Then get audio status info from the background script
      const audioStatusResponse = await browser.runtime.sendMessage({
        action: "getTabAudioStatus"
      });
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
      
      // Save tabs and rebuild UI only if the list actually changed
      const needsRebuild = !tabListsEqual(state.currentTabs, audioTabs);
      
      if (needsRebuild) {
        elements.tabsContainer.innerHTML = '';
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
      }
      
      // Mark as loaded
      state.initialLoadComplete = true;
    } catch (error) {
      console.error('Error loading tabs:', error);
      showStatus('Error loading tabs');
      state.initialLoadComplete = true; // Still mark as loaded to enable updates
    }
  }
  
  // Compare two tab lists to see if they're equal (by id)
  function tabListsEqual(list1, list2) {
    if (list1.length !== list2.length) return false;
    
    // Convert both lists to sets of tab IDs and compare
    const ids1 = new Set(list1.map(tab => tab.id));
    const ids2 = new Set(list2.map(tab => tab.id));
    
    if (ids1.size !== ids2.size) return false;
    
    // Check if all IDs in ids1 are also in ids2
    for (const id of ids1) {
      if (!ids2.has(id)) return false;
    }
    
    return true;
  }
  
  // Get volume information for a tab - returns a Promise
  function getTabVolumeInfo(tab) {
    return new Promise(resolve => {
      // Always get the most current tab information first
      browser.tabs.get(tab.id).then(updatedTab => {
        // Use the most up-to-date tab info (especially the title)
        tab = updatedTab;
        
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
      }).catch(() => {
        // If we can't get the updated tab info, proceed with what we have
        // Special case for 9GAG - always treat as having audio
        if (tab.url && tab.url.includes('9gag.com')) {
          tab.hasAudio = true;
          tab.volume = 1.0; // Default volume
          state.tabVolumes[tab.id] = 1.0;
        } else {
          // For other tabs, mark as not having audio if we can't verify
          tab.hasAudio = false;
        }
        resolve(tab);
      });
    });
  }
  
  // Create UI for a single tab
  function createTabUI(tab) {
    const volumePercent = Math.round(tab.volume * 100);
    
    // Create tab container with fade-in effect
    const tabItem = document.createElement('div');
    tabItem.className = 'tab-item';
    tabItem.dataset.tabId = tab.id;
    tabItem.style.opacity = '0';
    
    // Create header
    const tabHeader = createTabHeader(tab, volumePercent);
    
    // Create controls container
    const tabControls = createTabControls(tab, volumePercent);
    
    // Assemble tab item
    tabItem.appendChild(tabHeader);
    tabItem.appendChild(tabControls);
    
    // Add to container
    elements.tabsContainer.appendChild(tabItem);
    
    // Trigger reflow and fade in
    setTimeout(() => {
      tabItem.style.transition = 'opacity 0.3s ease-in';
      tabItem.style.opacity = '1';
    }, 10);
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
    loadTabs();
  }
  
  // Start the application
  initialize();
  
  // Clean up event listeners when the popup is closed
  window.addEventListener('unload', () => {
    if (state.pendingUpdateTimer) {
      clearTimeout(state.pendingUpdateTimer);
    }
    if (state.audioStatusListener) {
      browser.runtime.onMessage.removeListener(state.audioStatusListener);
    }
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  });
});