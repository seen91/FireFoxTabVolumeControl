/**
 * YouTube-specific volume control handler
 * This file contains specialized code for handling YouTube's unique audio setup
 */

// Constants
const CHECK_INTERVAL = 1000; // Check for videos every second
const MAX_ATTEMPTS = 10;     // Maximum attempts to find video

// State for YouTube handling
const ytState = {
  audioContext: null,
  gainNode: null,
  currentVolume: 1.0,
  audioElements: new Set(),
  mediaSourceNodes: new Map(),
  initialized: false,
  attemptCount: 0,
  checkInterval: null
};

/**
 * Initialize YouTube-specific volume control
 */
function initYouTubeVolumeControl() {
  console.log('YouTube volume control: initializing');
  
  if (ytState.initialized) return;
  ytState.initialized = true;
  
  // Set up message listener right away
  setupYouTubeMessageListener();
  
  // Initial search for video player
  findYouTubeVideo();
  
  // Set up interval to keep checking for YouTube videos
  ytState.checkInterval = setInterval(() => {
    if (ytState.attemptCount >= MAX_ATTEMPTS && ytState.audioElements.size === 0) {
      // Stop trying after max attempts if we haven't found anything
      clearInterval(ytState.checkInterval);
      console.log('YouTube volume control: giving up after max attempts');
    } else {
      findYouTubeVideo();
      ytState.attemptCount++;
    }
  }, CHECK_INTERVAL);
  
  // Monitor YouTube navigation events to detect page changes
  setupYouTubeNavListener();
  
  // Hook into YouTube's APIs if possible
  hookYouTubeAPIs();
}

/**
 * Find YouTube video player using multiple methods
 */
function findYouTubeVideo() {
  // Try different selectors that might find the YouTube player
  const selectors = [
    'video.html5-main-video',           // Main player
    '.html5-video-container video',     // Video container
    '#movie_player video',              // Movie player
    'ytd-player video',                 // New player
    'video'                             // Any video
  ];
  
  let foundVideo = false;
  
  for (const selector of selectors) {
    const videos = document.querySelectorAll(selector);
    if (videos.length > 0) {
      videos.forEach(video => {
        if (!ytState.audioElements.has(video)) {
          console.log('YouTube volume control: found video element', video);
          handleYouTubeVideo(video);
          foundVideo = true;
        }
      });
      
      if (foundVideo) break;
    }
  }
  
  // If we found a video, make sure we have audio context
  if (foundVideo && !ytState.audioContext) {
    initYouTubeAudioContext();
  }
  
  return foundVideo;
}

/**
 * Handle YouTube video element
 * @param {HTMLVideoElement} video - The video element to handle
 */
function handleYouTubeVideo(video) {
  if (ytState.audioElements.has(video)) return;
  
  ytState.audioElements.add(video);
  
  // Store original volume
  if (video._originalVolume === undefined) {
    video._originalVolume = video.volume;
  }
  
  // Apply current volume
  applyYouTubeVolumeToElement(video, ytState.currentVolume);
  
  // If audio context exists, connect video to it
  if (ytState.audioContext && ytState.gainNode) {
    connectYouTubeElementToGainNode(video);
  }
  
  // Add event listeners to detect playing
  video.addEventListener('play', () => {
    if (!ytState.audioContext) {
      initYouTubeAudioContext();
    }
    // Notify background script that this page has audio
    notifyYouTubeHasAudio();
  });
  
  // Detect if the video is already playing
  if (!video.paused && !video.ended && video.currentTime > 0) {
    notifyYouTubeHasAudio();
  }
}

/**
 * Initialize Web Audio API for YouTube
 */
function initYouTubeAudioContext() {
  if (ytState.audioContext) return;
  
  try {
    ytState.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    ytState.gainNode = ytState.audioContext.createGain();
    ytState.gainNode.gain.value = ytState.currentVolume;
    ytState.gainNode.connect(ytState.audioContext.destination);
    
    // Connect existing elements
    ytState.audioElements.forEach(element => {
      connectYouTubeElementToGainNode(element);
    });
    
    console.log('YouTube volume control: AudioContext initialized');
  } catch (e) {
    console.error('YouTube volume control: AudioContext initialization failed', e);
  }
}

/**
 * Connect a YouTube video element to gain node
 * @param {HTMLVideoElement} element - The video element to connect
 */
function connectYouTubeElementToGainNode(element) {
  if (ytState.mediaSourceNodes.has(element)) return;
  
  try {
    const source = ytState.audioContext.createMediaElementSource(element);
    ytState.mediaSourceNodes.set(element, source);
    source.connect(ytState.gainNode);
    
    // Don't change YouTube's own volume property
    element._volumeControlled = true;
    
    console.log('YouTube volume control: Connected element to gain node');
  } catch (e) {
    console.error('YouTube volume control: Failed to connect element to gain node', e);
    
    // Fall back to direct volume control
    applyYouTubeVolumeToElement(element, ytState.currentVolume);
  }
}

/**
 * Apply volume directly to a YouTube element
 * @param {HTMLVideoElement} element - The video element
 * @param {number} volumeLevel - Volume level (0.0 to 5.0)
 */
function applyYouTubeVolumeToElement(element, volumeLevel) {
  // Only apply direct volume changes for volume reduction
  if (volumeLevel <= 1.0) {
    try {
      element._volumeControlled = true;
      element.volume = volumeLevel;
      setTimeout(() => {
        element._volumeControlled = false;
      }, 50);
    } catch (e) {
      console.error('YouTube volume control: Error setting element volume', e);
    }
  }
}

/**
 * Set volume for YouTube
 * @param {number} volumeLevel - Volume level (0.0 to 5.0)
 */
function setYouTubeVolume(volumeLevel) {
  ytState.currentVolume = volumeLevel;
  
  // Notify content script via window messaging
  window.postMessage({
    source: "youtube-handler",
    action: "volumeChanged",
    volume: volumeLevel
  }, "*");
  
  // Apply with gain node for amplification
  if (ytState.gainNode) {
    try {
      ytState.gainNode.gain.value = volumeLevel;
    } catch (e) {
      console.error('YouTube volume control: Error updating gain node', e);
    }
  }
  
  // For reduction, also apply directly
  if (volumeLevel <= 1.0) {
    ytState.audioElements.forEach(element => {
      applyYouTubeVolumeToElement(element, volumeLevel);
    });
  }
  
  // Try YouTube's API methods
  setYouTubeAPIVolume(volumeLevel);
}

/**
 * Attempt to use YouTube's own API to set volume
 * @param {number} volumeLevel - Volume level (0.0 to 5.0)
 */
function setYouTubeAPIVolume(volumeLevel) {
  try {
    // Try youtube player API
    const player = document.querySelector('#movie_player') || 
                  document.querySelector('.html5-video-player');
    
    if (player && typeof player.setVolume === 'function') {
      // YouTube volume is 0-100
      const ytVolume = Math.min(100, Math.round(volumeLevel * 100));
      player.setVolume(ytVolume);
      console.log('YouTube volume control: Set volume using YouTube API', ytVolume);
    }
    
    // Try YouTube's JavaScript API if available
    if (window.yt && window.yt.player && 
        window.yt.player.Application && 
        window.yt.player.Application.create) {
      
      const ytApp = window.yt.player.Application.create();
      if (ytApp && ytApp.setVolume) {
        const ytVolume = Math.min(100, Math.round(volumeLevel * 100));
        ytApp.setVolume(ytVolume);
      }
    }
  } catch (e) {
    // Ignore errors with YouTube API
  }
}

/**
 * Set up listener for YouTube navigation events
 */
function setupYouTubeNavListener() {
  // YouTube uses custom events for navigation
  window.addEventListener('yt-navigate-start', () => {
    console.log('YouTube volume control: Navigation detected');
    
    // Reset our tracking
    ytState.audioElements.clear();
    ytState.mediaSourceNodes.clear();
    
    // Start checking again
    ytState.attemptCount = 0;
    
    if (!ytState.checkInterval) {
      ytState.checkInterval = setInterval(findYouTubeVideo, CHECK_INTERVAL);
    }
  });
  
  window.addEventListener('yt-navigate-finish', () => {
    // Look for video after navigation completes
    setTimeout(findYouTubeVideo, 500);
  });
}

/**
 * Hook into YouTube's APIs to detect when audio is available
 */
function hookYouTubeAPIs() {
  // Hook into YouTube's MediaSource to detect audio streams
  if (typeof MediaSource !== 'undefined') {
    const originalAddSourceBuffer = MediaSource.prototype.addSourceBuffer;
    MediaSource.prototype.addSourceBuffer = function() {
      const buffer = originalAddSourceBuffer.apply(this, arguments);
      
      // If this is an audio buffer
      if (arguments[0] && arguments[0].includes('audio')) {
        console.log('YouTube volume control: Detected audio stream');
        
        // Initialize audio handling
        setTimeout(findYouTubeVideo, 500);
      }
      
      return buffer;
    };
  }
  
  // Monitor DOM for changes to find dynamically added videos
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.addedNodes && mutation.addedNodes.length) {
        // Check if any video elements were added
        let foundVideo = false;
        
        mutation.addedNodes.forEach(node => {
          // If it's a video element
          if (node.nodeName === 'VIDEO') {
            handleYouTubeVideo(node);
            foundVideo = true;
          } 
          // If it might contain video elements
          else if (node.querySelectorAll) {
            const videos = node.querySelectorAll('video');
            if (videos.length > 0) {
              videos.forEach(video => handleYouTubeVideo(video));
              foundVideo = true;
            }
          }
        });
        
        if (foundVideo && !ytState.audioContext) {
          initYouTubeAudioContext();
        }
      }
    }
  });
  
  // Start observing changes to the DOM
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

/**
 * Set up message listener for extension communication
 */
function setupYouTubeMessageListener() {
  // Listen for messages from the content script via window messaging
  window.addEventListener('message', (event) => {
    // Only accept messages from the same window
    if (event.source !== window) return;
    
    const data = event.data;
    if (!data || data.source !== 'volume-control-content') return;
    
    if (data.action === "setVolume") {
      setYouTubeVolume(data.volume);
      // Send response back via window messaging
      window.postMessage({
        source: "youtube-handler",
        action: "volumeResponse",
        success: true,
        requestId: data.requestId
      }, "*");
    } else if (data.action === "getVolume") {
      window.postMessage({
        source: "youtube-handler",
        action: "volumeResponse",
        volume: ytState.currentVolume,
        requestId: data.requestId
      }, "*");
    } else if (data.action === "checkForAudio") {
      // Check if any videos are playing
      let hasActiveAudio = false;
      ytState.audioElements.forEach(video => {
        if (!video.paused && !video.ended && video.currentTime > 0) {
          hasActiveAudio = true;
        }
      });
      
      window.postMessage({
        source: "youtube-handler",
        action: "audioCheckResponse",
        hasAudio: ytState.audioElements.size > 0,
        hasMediaElements: ytState.audioElements.size > 0,
        hasActiveAudio: hasActiveAudio,
        requestId: data.requestId
      }, "*");
    }
  }, false);
}

/**
 * Notify content script that this page has audio
 */
function notifyYouTubeHasAudio() {
  window.postMessage({
    source: "youtube-handler",
    action: "notifyAudio",
    hasActiveAudio: true
  }, "*");
}

/**
 * Clean up when page unloads
 */
function cleanup() {
  if (ytState.checkInterval) {
    clearInterval(ytState.checkInterval);
  }
  
  if (ytState.audioContext) {
    try {
      ytState.audioContext.close();
    } catch (e) {
      // Ignore errors
    }
  }
}

// Set up cleanup
window.addEventListener('unload', cleanup);