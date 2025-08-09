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
  MessagingManager.setupWindowMessageListener(state, notifyHasAudio);
  MessagingManager.setupMessageListener(state, setVolume); // Always set up the extension message listener

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
 * Initialize standard volume control for most sites
 */
function initStandardVolumeControl() {
  // Create a wrapper function for handleMediaElement that provides all the required dependencies
  const handleMediaElementWrapper = (element) => {
    MediaElementManager.handleMediaElement(
      element, 
      state, 
      MediaElementManager.applyVolumeToElement, 
      (element) => connectElementToGainNode(element), 
      notifyHasAudio
    );
  };

  // Set up detection for media elements
  MediaElementManager.setupMutationObserver(
    state, 
    handleMediaElementWrapper, 
    MediaElementManager.isMediaElement, 
    () => checkForActiveAudio()
  );
  
  MediaElementManager.findExistingMediaElements(
    state, 
    handleMediaElementWrapper, 
    () => checkForActiveAudio()
  );
  
  MediaElementManager.setupPlayEventListener(
    state, 
    handleMediaElementWrapper, 
    notifyHasAudio, 
    () => checkForActiveAudio()
  );
  
  MediaElementManager.hookMediaElementCreation(handleMediaElementWrapper);
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
          AudioContextManager.initializeAudioContext(state, connectElementToGainNode);
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
 * Handle a media element (audio or video)
 * @param {HTMLMediaElement} element - The media element to handle
 */
function handleMediaElement(element) {
  MediaElementManager.handleMediaElement(
    element, 
    state, 
    MediaElementManager.applyVolumeToElement, 
    connectElementToGainNode, 
    notifyHasAudio
  );
}

/**
 * Connect a media element to the gain node
 * @param {HTMLMediaElement} element - The media element to connect
 */
function connectElementToGainNode(element) {
  MediaElementManager.connectElementToGainNode(
    element, 
    state, 
    MediaElementManager.applyVolumeToElement
  );
}

/**
 * Apply volume directly to a media element
 * @param {HTMLMediaElement} element - The media element
 * @param {number} volumeLevel - Volume level (0.0 to 5.0)
 */
function applyVolumeToElement(element, volumeLevel) {
  MediaElementManager.applyVolumeToElement(element, volumeLevel);
}

/**
 * Set the volume for all media elements
 * @param {number} volumeLevel - Volume level (0.0 to 5.0)
 */
function setVolume(volumeLevel) {
  VolumeControlManager.setVolume(
    state, 
    volumeLevel, 
    MediaElementManager.applyVolumeToElement, 
    setYouTubeVolume
  );
}

/**
 * Set volume using standard method for most sites
 * @param {number} volumeLevel - Volume level (0.0 to 5.0)
 */
function setStandardVolume(volumeLevel) {
  VolumeControlManager.setStandardVolume(
    state, 
    volumeLevel, 
    MediaElementManager.applyVolumeToElement
  );
}

/**
 * Notify background script that this page has audio
 */
function notifyHasAudio() {
  MessagingManager.notifyHasAudio(state.pageHasActiveAudio);
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
  return MediaElementManager.isMediaElement(node);
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
    AudioContextManager.initializeAudioContext(state, connectElementToGainNode);
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

/**
 * Try to reconnect media elements if they were not properly connected
 * due to suspended AudioContext
 */
function tryReconnectMediaElements() {
  AudioContextManager.tryReconnectMediaElements(state, connectElementToGainNode, handleMediaElement);
}