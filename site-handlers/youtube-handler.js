// youtube-handler.js - YouTube-specific volume control

// YouTube-specific module variables
let ytAudioContext;
let ytGainNode;
let ytCurrentVolume = 1.0;
let ytAudioElements = new Set();
let ytMediaSourceNodes = new Map();
let ytInitialized = false;

// Initialize YouTube-specific volume control
function initYouTubeVolumeControl() {
  if (ytInitialized) return;
  ytInitialized = true;
  
  console.log('Volume control: YouTube-specific handler initialized');
  
  // Initialize AudioContext immediately for YouTube
  initYouTubeAudioContext();
  
  // Start looking for YouTube video elements
  findYouTubeVideo();
  
  // Try multiple times to catch YouTube's dynamic loading
  setTimeout(findYouTubeVideo, 1000);
  setTimeout(findYouTubeVideo, 3000);
  
  // Listen for YouTube SPA navigation events
  window.addEventListener('yt-navigate-finish', function() {
    console.log('Volume control: YouTube navigation detected');
    setTimeout(findYouTubeVideo, 1000);
  });
  
  // Setup special YouTube mutation observer
  const ytObserver = new MutationObserver((mutations) => {
    findYouTubeVideo();
  });
  
  // Observe the player container if it exists
  const playerContainer = document.getElementById('player') || 
                          document.getElementById('movie_player') || 
                          document.querySelector('.html5-video-container');
                          
  if (playerContainer) {
    ytObserver.observe(playerContainer, {
      childList: true,
      subtree: true
    });
  } else {
    // If no player container found yet, observe body for it
    ytObserver.observe(document.body, {
      childList: true,
      subtree: false
    });
  }
  
  // Hook into YouTube's MediaSource for stream detection
  hookYouTubeMediaSource();
  
  // Set up message listener for extension commands
  setupYouTubeMessageListener();
}

// Initialize audio context specifically for YouTube
function initYouTubeAudioContext() {
  if (ytAudioContext) return; // Already initialized
  
  try {
    // Create new AudioContext
    ytAudioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Create a gain node for volume control
    ytGainNode = ytAudioContext.createGain();
    ytGainNode.gain.value = ytCurrentVolume;
    ytGainNode.connect(ytAudioContext.destination);
    
    // Apply the current volume to existing media elements
    ytAudioElements.forEach(element => {
      connectYouTubeElementToGainNode(element);
    });
    
    console.log('Volume control: YouTube AudioContext initialized');
  } catch (e) {
    console.error('Volume control: YouTube Web Audio API initialization failed', e);
  }
}

// Find YouTube video elements in the page
function findYouTubeVideo() {
  // Try to find the main video element first (most reliable)
  const videoElement = document.querySelector('video.html5-main-video');
  if (videoElement && !ytAudioElements.has(videoElement)) {
    console.log('Volume control: Found YouTube main video');
    handleYouTubeMediaElement(videoElement);
    return true;
  }
  
  // Look for any video elements (backup approach)
  const videos = document.querySelectorAll('video');
  if (videos.length > 0) {
    let foundNew = false;
    videos.forEach(video => {
      if (!ytAudioElements.has(video)) {
        console.log('Volume control: Found YouTube video');
        handleYouTubeMediaElement(video);
        foundNew = true;
      }
    });
    if (foundNew) return true;
  }
  
  return false;
}

// Handle YouTube media elements specifically
function handleYouTubeMediaElement(element) {
  if (ytAudioElements.has(element)) return; // Already handling this element
  
  ytAudioElements.add(element);
  
  // Store the original volume for reference
  if (element._originalVolume === undefined) {
    element._originalVolume = element.volume;
  }
  
  // Apply current volume directly first
  applyYouTubeVolumeToElement(element, ytCurrentVolume);
  
  // If audio context exists, connect this element
  if (ytAudioContext && ytGainNode) {
    connectYouTubeElementToGainNode(element);
  }
  
  // Add event listeners for YouTube-specific events
  element.addEventListener('volumechange', function(e) {
    // This helps us detect when YouTube's own controls change the volume
    // We'll store this as the new _originalVolume
    if (!element._ignoreVolumeChange) {
      element._originalVolume = element.volume;
      console.log('Volume control: YouTube internal volume changed to', element.volume);
    }
  });
}

// Connect YouTube element to our gain node
function connectYouTubeElementToGainNode(element) {
  // Don't reconnect if already connected
  if (ytMediaSourceNodes.has(element)) return;
  
  try {
    // Create a new MediaElementSourceNode
    const source = ytAudioContext.createMediaElementSource(element);
    ytMediaSourceNodes.set(element, source);
    
    // Connect to our gain node
    source.connect(ytGainNode);
    
    // Apply our volume setting to the gain node
    ytGainNode.gain.value = ytCurrentVolume;
    
    // For YouTube, we generally don't modify the element.volume directly
    // because it can conflict with YouTube's own controls
    console.log('Volume control: YouTube element connected to gain node successfully');
  } catch (e) {
    console.error('Volume control: Error connecting YouTube element to gain node:', e);
    // If we failed to connect to gain node, use direct volume as fallback
    applyYouTubeVolumeToElement(element, ytCurrentVolume);
  }
}

// Apply volume directly to YouTube element (used for reduction or as fallback)
function applyYouTubeVolumeToElement(element, volumeLevel) {
  try {
    // Only directly modify volume for reduction, not amplification
    if (volumeLevel <= 1.0) {
      // Prevent recursive events
      element._ignoreVolumeChange = true;
      element.volume = volumeLevel;
      setTimeout(() => {
        element._ignoreVolumeChange = false;
      }, 50);
    }
  } catch (e) {
    console.error('Volume control: Error setting YouTube element volume:', e);
  }
}

// Set volume for YouTube specifically
function setYouTubeVolume(volumeLevel) {
  ytCurrentVolume = volumeLevel;
  
  // Notify the background script
  browser.runtime.sendMessage({
    action: "volumeChanged",
    volume: volumeLevel
  });

  // Apply to gain node for amplification
  if (ytGainNode) {
    try {
      ytGainNode.gain.value = volumeLevel;
    } catch (e) {
      console.error('Volume control: Error updating YouTube gain node:', e);
    }
  }
  
  // For volume reduction, also apply directly to video elements
  if (volumeLevel <= 1.0) {
    ytAudioElements.forEach(element => {
      applyYouTubeVolumeToElement(element, volumeLevel);
    });
  }
  
  // Try to use YouTube's own player API as a fallback method
  tryUseYouTubePlayerAPI(volumeLevel);
}

// Try to use YouTube's own player API
function tryUseYouTubePlayerAPI(volumeLevel) {
  try {
    // Find the player object using multiple approaches
    const player = document.querySelector('.html5-video-player') || 
                   document.getElementById('movie_player');
                   
    if (player && typeof player.getVolume === 'function' && typeof player.setVolume === 'function') {
      // Convert our 0-1 scale to YouTube's 0-100 scale for volume <= 1.0
      if (volumeLevel <= 1.0) {
        const ytVolume = Math.round(volumeLevel * 100);
        player.setVolume(ytVolume);
        console.log('Volume control: Successfully used YouTube API to set volume to', ytVolume);
      }
    }
  } catch (e) {
    // Just ignore errors with this approach
  }
}

// Hook into YouTube's MediaSource for stream detection
function hookYouTubeMediaSource() {
  if (typeof MediaSource !== 'undefined') {
    const originalAddSourceBuffer = MediaSource.prototype.addSourceBuffer;
    MediaSource.prototype.addSourceBuffer = function() {
      const sourceBuffer = originalAddSourceBuffer.apply(this, arguments);
      // Check for YouTube audio stream
      if (arguments[0] && arguments[0].includes('audio')) {
        console.log('Volume control: Detected YouTube audio stream');
        setTimeout(initYouTubeAudioContext, 500);
        setTimeout(findYouTubeVideo, 1000);
      }
      return sourceBuffer;
    };
  }
}

// Setup message listener for YouTube-specific handling
function setupYouTubeMessageListener() {
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "setVolume") {
      setYouTubeVolume(message.volume);
      sendResponse({success: true});
      return true;
    } else if (message.action === "getVolume") {
      sendResponse({volume: ytCurrentVolume});
      return true;
    }
  });
}