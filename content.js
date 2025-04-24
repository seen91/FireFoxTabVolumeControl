// content.js - Controls volume for media elements in web pages

// Constants
const DEFAULT_VOLUME = 1.0; // Default volume (100%)
const YOUTUBE_CHECK_INTERVAL = 1000; // YouTube check interval in ms
const AUDIO_CHECK_INTERVAL = 2000; // General audio check interval in ms

// Module state
const state = {
  audioContext: null,
  gainNode: null,
  currentVolume: DEFAULT_VOLUME,
  audioElements: new Set(),
  mediaSourceNodes: new Map(),
  initialized: false,
  pageHasAudio: false,
  pageHasActiveAudio: false, // Track if there's actually playing audio
  youtubeCheckerInterval: null,
  audioCheckInterval: null
};

// Initialize everything when the page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

/**
 * Main initialization function
 */
function initialize() {
  if (state.initialized) return;
  state.initialized = true;

  // Set up handler for window messages (for site handlers to communicate)
  setupWindowMessageListener();
  setupMessageListener(); // Always set up the extension message listener

  // Get current hostname for site-specific handling
  const hostname = window.location.hostname;
  
  // For 9GAG, use our own direct handling approach
  if (hostname.includes('9gag.com')) {
    console.log('[Content] On 9GAG, initializing direct handling');
    
    // Skip waiting for handler, use direct control
    state.pageHasAudio = true;
    state.using9GagHandler = true;
    notifyHasAudio();

    // Initialize our own handling for 9GAG
    init9GagDirectHandling();
    return;
  } else if (hostname.includes('youtube.com')) {
    initYouTubeVolumeControl();
    return;
  }

  // Standard initialization for most sites
  initStandardVolumeControl();

  // Start periodic checks for audio activity
  state.audioCheckInterval = setInterval(checkForActiveAudio, AUDIO_CHECK_INTERVAL);
}

/**
 * Direct handling of 9GAG videos without relying on external handlers
 */
function init9GagDirectHandling() {
  console.log("[Content] Setting up direct 9GAG volume control");
  
  // Find and track videos
  const observer = new MutationObserver((mutations) => {
    let newVideoFound = false;
    
    mutations.forEach((mutation) => {
      if (mutation.addedNodes) {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLVideoElement) {
            handleDirectVideo(node);
            newVideoFound = true;
          } else if (node.querySelectorAll) {
            const videos = node.querySelectorAll('video');
            if (videos.length > 0) {
              videos.forEach(handleDirectVideo);
              newVideoFound = true;
            }
          }
        });
      }
    });
    
    if (newVideoFound) {
      notifyHasAudio();
    }
  });
  
  // Listen for play events
  document.addEventListener('play', event => {
    if (event.target instanceof HTMLVideoElement) {
      console.log("[Content] 9GAG video play detected");
      handleDirectVideo(event.target);
      notifyHasAudio();
    }
  }, true);
  
  // Set up observation
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
  
  // Apply to existing videos
  const videos = document.querySelectorAll('video');
  if (videos.length > 0) {
    console.log(`[Content] Found ${videos.length} existing 9GAG videos`);
    videos.forEach(handleDirectVideo);
  }
  
  // Try again after a delay to catch late-loading videos
  setTimeout(() => {
    const lateVideos = document.querySelectorAll('video');
    if (lateVideos.length > 0) {
      console.log(`[Content] Found ${lateVideos.length} late-loaded 9GAG videos`);
      lateVideos.forEach(handleDirectVideo);
    }
  }, 1500);
}

/**
 * Handle a 9GAG video directly
 * @param {HTMLVideoElement} video - The video element to handle
 */
function handleDirectVideo(video) {
  if (!video || !(video instanceof HTMLVideoElement)) return;
  
  try {
    // Mark as managed
    video._managed_by_9gag_handler = true;
    
    // Set initial volume
    applyVolumeToElement(video, state.currentVolume);
    
    // Ensure newly loaded videos get proper volume
    video.addEventListener('loadedmetadata', () => {
      applyVolumeToElement(video, state.currentVolume);
    }, { once: true });
    
    console.log("[Content] Directly initialized 9GAG video", video);
  } catch (error) {
    console.error("[Content] Error handling 9GAG video:", error);
  }
}

/**
 * Set up listener for window messages from site handlers and module loader
 */
function setupWindowMessageListener() {
  window.addEventListener('message', function(event) {
    // Only accept messages from the same window
    if (event.source !== window) return;
    
    const data = event.data;
    
    // Handle messages from site handlers
    if (data && data.source) {
      // For 9GAG, we handle everything ourselves in content.js
      if (data.source === "9gag-handler") {
        console.log("[Content] Received message from 9GAG handler, but using direct handling");
        return;
      }
      
      // Handle other site handler messages normally
      if (data.action === 'notifyAudio') {
        state.pageHasAudio = true;
        state.pageHasActiveAudio = data.hasActiveAudio;
        notifyHasAudio();
      }
    }
  }, false);
}

/**
 * Initialize standard volume control for most sites
 */
function initStandardVolumeControl() {
  setupMutationObserver();
  findExistingMediaElements();
  setupPlayEventListener();
  hookMediaElementCreation();
}

/**
 * Set up a MutationObserver to detect dynamically added media elements
 */
function setupMutationObserver() {
  const observer = new MutationObserver((mutations) => {
    let newMediaFound = false;

    mutations.forEach((mutation) => {
      if (mutation.addedNodes) {
        mutation.addedNodes.forEach((node) => {
          if (isMediaElement(node)) {
            handleMediaElement(node);
            newMediaFound = true;
          } else if (node.querySelectorAll) {
            const mediaElements = node.querySelectorAll('audio, video');
            if (mediaElements.length > 0) {
              mediaElements.forEach(handleMediaElement);
              newMediaFound = true;
            }
          }
        });
      }
    });

    if (newMediaFound && !state.audioContext) {
      initializeAudioContext();
      checkForActiveAudio(); // Check if any are active
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src']
  });
}

/**
 * Find any media elements that already exist in the page
 */
function findExistingMediaElements() {
  const existingMedia = document.querySelectorAll('audio, video');
  if (existingMedia.length > 0) {
    state.pageHasAudio = true;
    existingMedia.forEach(handleMediaElement);
    initializeAudioContext();
    checkForActiveAudio(); // Check if any are active
  }
}

/**
 * Check if any audio/video elements are actually playing
 */
function checkForActiveAudio() {
  let hasActiveAudio = false;
  
  // Check if any audio elements are actually playing
  state.audioElements.forEach(element => {
    if (!element.paused && !element.ended && element.currentTime > 0) {
      hasActiveAudio = true;
    }
  });
  
  // Update state and notify background if changed
  if (hasActiveAudio !== state.pageHasActiveAudio) {
    state.pageHasActiveAudio = hasActiveAudio;
    
    // Only notify if there's active audio
    if (hasActiveAudio) {
      notifyHasAudio();
    }
  }
  
  return hasActiveAudio;
}

/**
 * Set up a listener for media play events
 */
function setupPlayEventListener() {
  document.addEventListener('play', function(event) {
    if (event.target instanceof HTMLMediaElement) {
      if (!state.audioElements.has(event.target)) {
        handleMediaElement(event.target);
        if (!state.audioContext) {
          initializeAudioContext();
        }
      }
      // A play event means active audio
      state.pageHasActiveAudio = true;
      notifyHasAudio();
    }
  }, true);
  
  // Also listen for pause events to track active audio
  document.addEventListener('pause', function(event) {
    if (event.target instanceof HTMLMediaElement) {
      // When something pauses, check if anything is still playing
      setTimeout(checkForActiveAudio, 100);
    }
  }, true);
}

/**
 * Initialize the Web Audio API
 */
function initializeAudioContext() {
  if (state.audioContext) return; // Already initialized
  
  try {
    // Create new AudioContext
    state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Create a gain node for volume control
    state.gainNode = state.audioContext.createGain();
    state.gainNode.gain.value = state.currentVolume;
    state.gainNode.connect(state.audioContext.destination);
    
    // Apply the current volume to existing media elements
    state.audioElements.forEach(element => {
      connectElementToGainNode(element);
    });
    
    console.log('Volume control: AudioContext initialized');
  } catch (e) {
    console.error('Volume control: Web Audio API is not supported in this browser', e);
  }
}

/**
 * Handle a media element (audio or video)
 * @param {HTMLMediaElement} element - The media element to handle
 */
function handleMediaElement(element) {
  // Skip if already handling this element
  if (state.audioElements.has(element)) return;
  
  // Skip if this element is managed by the 9GAG handler
  if (element._managed_by_9gag_handler || window._9gagVolumeHandlerActive) {
    console.log('Volume control: Skipping element managed by 9GAG handler');
    return;
  }
  
  state.pageHasAudio = true;
  state.audioElements.add(element);
  
  // Check if it's already playing
  if (!element.paused && !element.ended && element.currentTime > 0) {
    state.pageHasActiveAudio = true;
    notifyHasAudio();
  }
  
  // Apply current volume without creating a MediaElementSourceNode yet
  applyVolumeToElement(element, state.currentVolume);
  
  // If audio context already exists, connect this element
  if (state.audioContext && state.gainNode && !state.using9GagHandler) {
    connectElementToGainNode(element);
  }
  
  // Add an event listener for when the media starts playing
  element.addEventListener('play', () => {
    if (!state.audioContext) {
      initializeAudioContext();
    }
    state.pageHasActiveAudio = true;
    notifyHasAudio();
  }, { once: false });
}

/**
 * Connect a media element to the gain node
 * @param {HTMLMediaElement} element - The media element to connect
 */
function connectElementToGainNode(element) {
  // Don't reconnect if already connected
  if (state.mediaSourceNodes.has(element)) return;
  
  // Skip if this is a 9GAG video - they don't work well with AudioContext
  if (element._managed_by_9gag_handler || window._9gagVolumeHandlerActive || 
      window.location.hostname.includes('9gag.com')) {
    console.log('Volume control: Skipping AudioContext for 9GAG video');
    return;
  }
  
  try {
    // Create a new MediaElementSourceNode
    const source = state.audioContext.createMediaElementSource(element);
    state.mediaSourceNodes.set(element, source);
    
    // Connect to our gain node
    source.connect(state.gainNode);
    
    // Set HTML5 volume to 100% as we'll control it with the gain node
    if (element.volume !== 1.0) {
      element.volume = 1.0;
    }
    
    console.log('Volume control: Successfully connected element to gain node');
  } catch (e) {
    console.error('Volume control: Error connecting media element to gain node:', e);
    // If we failed to connect to gain node, use HTML5 volume as fallback
    applyVolumeToElement(element, state.currentVolume);
  }
}

/**
 * Apply volume directly to a media element
 * @param {HTMLMediaElement} element - The media element
 * @param {number} volumeLevel - Volume level (0.0 to 5.0)
 */
function applyVolumeToElement(element, volumeLevel) {
  try {
    // HTML5 volume is capped at 1.0, so we can only use this for reducing volume
    if (volumeLevel <= 1.0) {
      element.volume = volumeLevel;
    } else {
      element.volume = 1.0; // Max out HTML5 volume
    }
  } catch (e) {
    console.error('Volume control: Error setting element volume:', e);
  }
}

/**
 * Set the volume for all media elements
 * @param {number} volumeLevel - Volume level (0.0 to 5.0)
 */
function setVolume(volumeLevel) {
  // If volume is at default 100% (1.0), just update state and skip all processing
  if (volumeLevel === DEFAULT_VOLUME) {
    // Only update the current volume in state if it has changed
    if (state.currentVolume !== volumeLevel) {
      state.currentVolume = volumeLevel;
      
      // Notify the background script about the volume change
      browser.runtime.sendMessage({
        action: "volumeChanged",
        volume: volumeLevel
      }).catch(err => {
        console.warn("[Content] Error notifying background:", err);
      });
      
      console.log("[Content] Volume set to default (100%), skipping all processing");
    }
    return;
  }

  // If we reach here, the volume is not 100%, so continue with normal processing
  state.currentVolume = volumeLevel;
  
  // Notify the background script about the volume change
  browser.runtime.sendMessage({
    action: "volumeChanged",
    volume: volumeLevel
  }).catch(err => {
    console.warn("[Content] Error notifying background:", err);
  });

  // Determine if we need to use site-specific volume handling
  const hostname = window.location.hostname;
  
  // For 9GAG, use direct volume control always
  if (hostname.includes('9gag.com')) {
    // For 9GAG, we cap the volume at 100% as amplification doesn't work properly
    const cappedVolume = Math.min(volumeLevel, 1.0);
    console.log("[Content] Setting 9GAG volume directly to:", cappedVolume);
    
    const videos = document.querySelectorAll('video');
    let successCount = 0;
    
    videos.forEach(video => {
      try {
        // Mark as managed
        video._managed_by_9gag_handler = true;
        video.volume = cappedVolume;
        successCount++;
      } catch (videoError) {
        console.error("[Content] Error setting video volume:", videoError);
      }
    });
    
    console.log(`[Content] Directly set volume on ${successCount} of ${videos.length} videos`);
    
    // Handle future videos - this applies volume to any late-loading videos
    setTimeout(() => {
      const lateVideos = document.querySelectorAll('video');
      lateVideos.forEach(video => {
        try {
          if (video.volume !== cappedVolume) {
            video.volume = cappedVolume;
          }
        } catch (e) {}
      });
    }, 200);
    
    return;
  } else if (hostname.includes('youtube.com')) {
    setYouTubeVolume(volumeLevel);
    return;
  }

  // Standard volume handling for non-site-specific cases
  setStandardVolume(volumeLevel);
}

/**
 * Set volume using standard method for most sites
 * @param {number} volumeLevel - Volume level (0.0 to 5.0)
 */
function setStandardVolume(volumeLevel) {
  // Apply volume using the gainNode if available (for amplification)
  if (state.gainNode) {
    try {
      state.gainNode.gain.value = volumeLevel;
    } catch (e) {
      console.error('Volume control: Error updating gain node:', e);
    }
  }
  
  // Apply to media elements as fallback or for volume reduction
  state.audioElements.forEach(element => {
    applyVolumeToElement(element, volumeLevel);
  });
}

/**
 * Set up message listener for extension communication
 */
function setupMessageListener() {
  // Listen for messages from the extension
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "setVolume") {
      setVolume(message.volume);
      sendResponse({success: true});
      return true;
    } else if (message.action === "getVolume") {
      sendResponse({volume: state.currentVolume});
      return true;
    } else if (message.action === "checkForAudio") {
      // Special case for 9GAG - always report as having audio
      if (window.location.hostname.includes('9gag.com')) {
        sendResponse({hasAudio: true});
      } else {
        sendResponse({hasAudio: state.pageHasAudio});
      }
      return true;
    }
  });
}

/**
 * Notify background script that this page has audio
 */
function notifyHasAudio() {
  browser.runtime.sendMessage({
    action: "notifyAudio",
    hasActiveAudio: state.pageHasActiveAudio
  }).catch(() => {
    // Ignore errors
  });
}

/**
 * Hook the creation of audio and video elements to catch dynamically created ones
 */
function hookMediaElementCreation() {
  // Hook Audio constructor
  const originalAudioConstructor = window.Audio;
  if (originalAudioConstructor) {
    window.Audio = function() {
      const newAudio = new originalAudioConstructor(...arguments);
      setTimeout(() => handleMediaElement(newAudio), 0);
      return newAudio;
    };
    window.Audio.prototype = originalAudioConstructor.prototype;
  }
  
  // Hook createElement to detect video/audio creation
  const originalCreateElement = document.createElement;
  document.createElement = function() {
    const element = originalCreateElement.apply(this, arguments);
    if (arguments[0].toLowerCase() === 'audio' || arguments[0].toLowerCase() === 'video') {
      setTimeout(() => handleMediaElement(element), 0);
    }
    return element;
  };
}

/**
 * Check if node is a media element (audio or video)
 * @param {Node} node - DOM node to check
 * @returns {boolean} True if the node is a media element
 */
function isMediaElement(node) {
  return node.nodeName === 'AUDIO' || node.nodeName === 'VIDEO';
}

/**
 * Clean up resources when page unloads
 */
function cleanup() {
  if (state.audioCheckInterval) {
    clearInterval(state.audioCheckInterval);
  }
  
  if (state.youtubeCheckerInterval) {
    clearInterval(state.youtubeCheckerInterval);
  }
  
  if (state.audioContext) {
    try {
      state.audioContext.close();
    } catch (e) {
      // Ignore errors during cleanup
    }
  }
}

// Add event listener for page unload
window.addEventListener('unload', cleanup);

// YouTube-specific implementation
function initYouTubeVolumeControl() {
  console.log('YouTube volume control initialized');
  
  // For YouTube, we need more aggressive checking
  findYouTubeVideo();
  
  // Set up a recurring check for YouTube videos
  state.youtubeCheckerInterval = setInterval(findYouTubeVideo, YOUTUBE_CHECK_INTERVAL);
  
  // Set up message listener
  setupMessageListener();
}

function findYouTubeVideo() {
  // Various ways to find YouTube video elements
  const videoElements = [
    // Main player
    document.querySelector('video.html5-main-video'),
    // Any video element
    ...document.querySelectorAll('video'),
    // YouTube embedded player iframe
    document.querySelector('iframe#player')
  ].filter(Boolean); // Remove null/undefined
  
  let foundVideo = false;
  
  videoElements.forEach(video => {
    if (video && !state.audioElements.has(video)) {
      handleMediaElement(video);
      foundVideo = true;
      
      // For YouTube specifically, check if it's playing
      if (video.readyState > 0 && !video.paused && !video.ended) {
        state.pageHasActiveAudio = true;
        notifyHasAudio();
      }
    }
  });
  
  if (foundVideo && !state.audioContext) {
    initializeAudioContext();
  }
  
  // Try to access YouTube's API
  if (typeof window.ytplayer !== 'undefined' && window.ytplayer.config) {
    state.pageHasAudio = true;
    
    // If a video is actually playing
    if (typeof window.ytplayer.playerState !== 'undefined' && 
        window.ytplayer.playerState === 1) {
      state.pageHasActiveAudio = true;
      notifyHasAudio();
    }
  }
  
  return foundVideo;
}

function setYouTubeVolume(volumeLevel) {
  // First try with our gain node
  if (state.gainNode) {
    try {
      state.gainNode.gain.value = volumeLevel;
    } catch (e) {
      console.error('Error updating YouTube gain node:', e);
    }
  }
  
  // Also try setting volume directly on all video elements
  state.audioElements.forEach(element => {
    applyVolumeToElement(element, volumeLevel <= 1.0 ? volumeLevel : 1.0);
  });
  
  // Try accessing YouTube's API directly
  try {
    const ytPlayer = document.querySelector('.html5-video-player');
    if (ytPlayer && typeof ytPlayer.setVolume === 'function') {
      // YouTube volume is 0-100, so convert our 0-1 scale (capped at 1.0)
      const ytVolume = Math.min(100, Math.round(volumeLevel * 100));
      ytPlayer.setVolume(ytVolume);
    }
  } catch (e) {
    // Ignore errors, this is just a backup method
  }
}