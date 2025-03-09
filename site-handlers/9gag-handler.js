// 9gag-handler.js - 9GAG-specific volume control handler

/**
 * 9GAG-specific module for volume control
 * Uses a more lightweight approach to avoid breaking 9GAG's audio
 */

// Module state
const gagState = {
  currentVolume: 1.0,
  audioElements: new Set(),
  initialized: false,
  observer: null
};

/**
 * Initialize 9GAG-specific volume control
 */
function init9GAGVolumeControl() {
  if (gagState.initialized) return;
  gagState.initialized = true;
  
  console.log('Volume control: 9GAG-specific handler initialized');
  
  // Create a mutation observer to find video elements
  setupGagObserver();
  
  // Find existing videos
  findExistingGagVideos();
  
  // Set up message listener
  setupGagMessageListener();
  
  // Notify background script this page has audio
  notifyHasAudio();
}

/**
 * Set up a mutation observer to find new videos
 */
function setupGagObserver() {
  gagState.observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.addedNodes) {
        mutation.addedNodes.forEach((node) => {
          if (isGagVideo(node)) {
            handleGagVideo(node);
          } else if (node.querySelectorAll) {
            const videos = node.querySelectorAll('video');
            videos.forEach(handleGagVideo);
          }
        });
      }
    });
  });
  
  // Start observing
  gagState.observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
}

/**
 * Find any existing 9GAG videos
 */
function findExistingGagVideos() {
  const videos = document.querySelectorAll('video');
  if (videos.length > 0) {
    videos.forEach(handleGagVideo);
  }
}

/**
 * Check if an element is a 9GAG video
 * @param {Element} element - DOM element to check
 * @returns {boolean} True if it's a video element
 */
function isGagVideo(element) {
  return element.nodeName === 'VIDEO';
}

/**
 * Handle a 9GAG video element
 * @param {HTMLVideoElement} video - Video element
 */
function handleGagVideo(video) {
  if (gagState.audioElements.has(video)) return;
  
  gagState.audioElements.add(video);
  
  // Apply current volume to the video
  try {
    // For 9GAG, we'll use the simplest approach possible:
    // Just set the volume property directly
    video.volume = Math.min(1.0, gagState.currentVolume);
    
    // Add play event listener to ensure volume is applied
    video.addEventListener('play', () => {
      // Re-apply volume when video plays
      video.volume = Math.min(1.0, gagState.currentVolume);
      // Notify that this page has audio
      notifyHasAudio();
    });
    
    console.log('Volume control: 9GAG video element handled');
  } catch (e) {
    console.error('Volume control: Error handling 9GAG video', e);
  }
}

/**
 * Set volume for 9GAG
 * @param {number} volumeLevel - Volume level (0.0 to 5.0)
 */
function set9GAGVolume(volumeLevel) {
  gagState.currentVolume = volumeLevel;
  
  // Notify background script
  browser.runtime.sendMessage({
    action: "volumeChanged",
    volume: volumeLevel
  });
  
  // Apply volume to all videos
  gagState.audioElements.forEach(video => {
    try {
      // 9GAG volume is limited to 1.0 maximum
      // Higher values can break their player, so we cap it
      video.volume = Math.min(1.0, volumeLevel);
    } catch (e) {
      console.error('Volume control: Error setting 9GAG video volume', e);
    }
  });
  
  // Log message if trying to amplify
  if (volumeLevel > 1.0) {
    console.log('Volume control: 9GAG volume amplification is limited to 100% to prevent audio issues');
  }
}

/**
 * Set up message listener
 */
function setupGagMessageListener() {
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "setVolume") {
      set9GAGVolume(message.volume);
      sendResponse({success: true});
      return true;
    } else if (message.action === "getVolume") {
      sendResponse({volume: gagState.currentVolume});
      return true;
    } else if (message.action === "checkForAudio") {
      sendResponse({hasAudio: gagState.audioElements.size > 0});
      return true;
    }
  });
}

/**
 * Notify background script that this page has audio
 */
function notifyHasAudio() {
  browser.runtime.sendMessage({
    action: "notifyAudio"
  }).catch(() => {
    // Ignore errors
  });
}

// Initialize when loaded
init9GAGVolumeControl();