/**
 * Reddit-specific volume control handler
 * Designed to work with Reddit's custom video player
 */

// Module state
const redditState = {
  audioContext: null,
  gainNode: null,
  currentVolume: 1.0,
  audioElements: new Set(),
  mediaSourceNodes: new Map(),
  initialized: false,
  pageHasAudio: false,
  videoPlayerElements: new Set(),
  mutationObserver: null,
  videoCheckInterval: null
};

/**
 * Initialize Reddit-specific volume control
 */
function initRedditVolumeControl() {
  if (redditState.initialized) return;
  redditState.initialized = true;
  
  console.log('Volume control: Reddit-specific handler initialized');
  
  // Set up observers to detect Reddit's dynamically loaded content
  setupRedditObservers();
  
  // Find any existing video players
  findRedditVideoPlayers();
  
  // Set up a recurring check for video players that might be missed by the observers
  redditState.videoCheckInterval = setInterval(findRedditVideoPlayers, 2000);
  
  // Set up message listener for extension commands
  setupRedditMessageListener();
}

/**
 * Set up observers for Reddit's dynamic content
 */
function setupRedditObservers() {
  // Create a MutationObserver for the DOM
  redditState.mutationObserver = new MutationObserver((mutations) => {
    let needsCheck = false;
    
    for (const mutation of mutations) {
      if (mutation.addedNodes && mutation.addedNodes.length) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check if this is a post container that might have video
            if (node.classList && 
                (node.classList.contains('Post') || 
                 node.classList.contains('media-element') ||
                 node.tagName === 'VIDEO' ||
                 node.tagName === 'AUDIO')) {
              needsCheck = true;
              break;
            }
            
            // Check for media elements inside the node
            if (node.querySelectorAll) {
              const mediaElements = node.querySelectorAll('video, audio, .media-element');
              if (mediaElements.length > 0) {
                needsCheck = true;
                break;
              }
            }
          }
        }
      }
      
      if (needsCheck) break;
    }
    
    if (needsCheck) {
      findRedditVideoPlayers();
    }
  });
  
  // Start observing
  redditState.mutationObserver.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
  
  // Also observe for URL changes (for SPA navigation)
  window.addEventListener('popstate', () => {
    setTimeout(findRedditVideoPlayers, 500);
  });
  
  // React to scroll events (Reddit loads content as you scroll)
  let scrollTimeout;
  window.addEventListener('scroll', () => {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(findRedditVideoPlayers, 500);
  });
}

/**
 * Find Reddit video players in the page
 */
function findRedditVideoPlayers() {
  // Look for Reddit's video players
  const videoElements = document.querySelectorAll('video');
  const redditPlayers = document.querySelectorAll('.reddit-video-player-root, [data-testid="post-container"] video, .media-element');
  
  let foundNew = false;
  
  // Handle standard video elements
  videoElements.forEach(video => {
    if (!redditState.audioElements.has(video)) {
      handleRedditMediaElement(video);
      foundNew = true;
    }
  });
  
  // Handle Reddit-specific player containers
  redditPlayers.forEach(player => {
    if (!redditState.videoPlayerElements.has(player)) {
      redditState.videoPlayerElements.add(player);
      
      // Find the actual video element inside the player
      const videoElement = player.querySelector('video') || player;
      if (videoElement && !redditState.audioElements.has(videoElement)) {
        handleRedditMediaElement(videoElement);
        foundNew = true;
      }
      
      // Also check for Reddit's custom controls
      const volumeControls = player.querySelectorAll('.volume-slider, .volume-button');
      volumeControls.forEach(control => {
        // Monitor Reddit's native volume control for changes
        if (!control._volumeControlMonitored) {
          control._volumeControlMonitored = true;
          control.addEventListener('click', () => {
            // When user interacts with Reddit's controls, reapply our volume
            setTimeout(() => {
              reapplyRedditVolume();
            }, 100);
          });
        }
      });
    }
  });
  
  if (foundNew) {
    redditState.pageHasAudio = true;
    notifyRedditHasAudio();
    
    // Initialize audio context if needed
    if (!redditState.audioContext) {
      initRedditAudioContext();
    }
  }
}

/**
 * Initialize AudioContext for Reddit
 */
function initRedditAudioContext() {
  if (redditState.audioContext) return;
  
  try {
    redditState.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    redditState.gainNode = redditState.audioContext.createGain();
    redditState.gainNode.gain.value = redditState.currentVolume;
    redditState.gainNode.connect(redditState.audioContext.destination);
    
    // Connect existing elements
    redditState.audioElements.forEach(element => {
      connectRedditElementToGainNode(element);
    });
    
    console.log('Volume control: Reddit AudioContext initialized');
  } catch (e) {
    console.error('Volume control: Error initializing Reddit AudioContext', e);
  }
}

/**
 * Handle a Reddit media element
 * @param {HTMLElement} element - The media element
 */
function handleRedditMediaElement(element) {
  if (redditState.audioElements.has(element)) return;
  
  redditState.audioElements.add(element);
  redditState.pageHasAudio = true;
  
  console.log('Volume control: Found Reddit media element', element);
  
  // Store the original volume if we need to restore it
  if (element._originalVolume === undefined) {
    element._originalVolume = element.volume;
  }
  
  // Apply current volume
  applyRedditVolumeToElement(element, redditState.currentVolume);
  
  // Connect to gain node if audio context exists
  if (redditState.audioContext && redditState.gainNode) {
    connectRedditElementToGainNode(element);
  }
  
  // Add event listeners
  element.addEventListener('play', () => {
    if (!redditState.audioContext) {
      initRedditAudioContext();
    }
    notifyRedditHasAudio();
    
    // Make sure volume is applied (Reddit sometimes resets it)
    applyRedditVolumeToElement(element, redditState.currentVolume);
  });
  
  // Monitor volume changes
  element.addEventListener('volumechange', () => {
    // If this wasn't triggered by us
    if (!element._ignoreVolumeChange) {
      element._originalVolume = element.volume;
      console.log('Volume control: Reddit native volume changed to', element.volume);
      
      // Reapply our volume after a moment
      setTimeout(() => {
        applyRedditVolumeToElement(element, redditState.currentVolume);
      }, 50);
    }
  });
  
  // Special handler for Reddit-specific controls
  addRedditControlsHandlers(element);
}

/**
 * Connect a Reddit element to the gain node
 * @param {HTMLElement} element - The media element
 */
function connectRedditElementToGainNode(element) {
  if (redditState.mediaSourceNodes.has(element)) return;
  
  try {
    // For Reddit, we use a special approach
    // First try direct Web Audio API connection
    const source = redditState.audioContext.createMediaElementSource(element);
    redditState.mediaSourceNodes.set(element, source);
    source.connect(redditState.gainNode);
    
    console.log('Volume control: Connected Reddit element to gain node');
  } catch (e) {
    console.error('Volume control: Error connecting Reddit element', e);
    // Fall back to direct volume control
    applyRedditVolumeToElement(element, redditState.currentVolume);
  }
}

/**
 * Apply volume to a Reddit element
 * @param {HTMLElement} element - The media element
 * @param {number} volumeLevel - Volume level (0.0 to 5.0)
 */
function applyRedditVolumeToElement(element, volumeLevel) {
  try {
    // Mark that we're changing the volume to avoid event loops
    element._ignoreVolumeChange = true;
    
    // For volume reduction, use native volume
    if (volumeLevel <= 1.0) {
      element.volume = volumeLevel;
    } else {
      // For amplification, max out native volume
      element.volume = 1.0;
    }
    
    // Reset flag after a moment
    setTimeout(() => {
      element._ignoreVolumeChange = false;
    }, 50);
  } catch (e) {
    console.error('Volume control: Error setting Reddit element volume', e);
  }
}

/**
 * Add handlers for Reddit-specific controls
 * @param {HTMLElement} element - The media element
 */
function addRedditControlsHandlers(element) {
  // Find the post container that contains this video
  const closestPost = element.closest('[data-testid="post-container"]') || 
                     element.closest('.Post') ||
                     element.parentElement;
  
  if (!closestPost) return;
  
  // Find volume control elements
  setTimeout(() => {
    const volumeControls = closestPost.querySelectorAll('.volume-slider, .volume-button, [role="slider"]');
    volumeControls.forEach(control => {
      if (!control._volumeHandlerAdded) {
        control._volumeHandlerAdded = true;
        
        // Listen for interactions with Reddit's native controls
        control.addEventListener('mousedown', () => {
          console.log('Volume control: Reddit native control interaction');
          
          // Reapply our volume setting after user interaction
          setTimeout(reapplyRedditVolume, 100);
          setTimeout(reapplyRedditVolume, 500);
        });
      }
    });
  }, 500);
}

/**
 * Set Reddit volume
 * @param {number} volumeLevel - Volume level (0.0 to 5.0)
 */
function setRedditVolume(volumeLevel) {
  redditState.currentVolume = volumeLevel;
  
  // Notify the content script via window messaging
  window.postMessage({
    source: "reddit-handler",
    action: "volumeChanged",
    volume: volumeLevel
  }, "*");
  
  // Apply using gain node for amplification
  if (redditState.gainNode) {
    try {
      redditState.gainNode.gain.value = volumeLevel;
    } catch (e) {
      console.error('Volume control: Error updating Reddit gain node', e);
    }
  }
  
  // Apply to all elements
  redditState.audioElements.forEach(element => {
    applyRedditVolumeToElement(element, volumeLevel);
  });
}

/**
 * Reapply volume to all Reddit elements
 * Used after Reddit's native controls change volume
 */
function reapplyRedditVolume() {
  if (redditState.gainNode) {
    redditState.gainNode.gain.value = redditState.currentVolume;
  }
  
  redditState.audioElements.forEach(element => {
    applyRedditVolumeToElement(element, redditState.currentVolume);
  });
}

/**
 * Set up message listener for Reddit-specific handling
 */
function setupRedditMessageListener() {
  // Listen for messages from the content script via window messaging
  window.addEventListener('message', (event) => {
    // Only accept messages from the same window
    if (event.source !== window) return;
    
    const data = event.data;
    if (!data || data.source !== 'volume-control-content') return;
    
    if (data.action === "setVolume") {
      setRedditVolume(data.volume);
      // Send response back via window messaging
      window.postMessage({
        source: "reddit-handler",
        action: "volumeResponse",
        success: true,
        requestId: data.requestId
      }, "*");
    } else if (data.action === "getVolume") {
      window.postMessage({
        source: "reddit-handler",
        action: "volumeResponse",
        volume: redditState.currentVolume,
        requestId: data.requestId
      }, "*");
    } else if (data.action === "checkForAudio") {
      window.postMessage({
        source: "reddit-handler",
        action: "audioCheckResponse",
        hasAudio: redditState.pageHasAudio,
        requestId: data.requestId
      }, "*");
    }
  }, false);
}

/**
 * Notify content script that this page has audio
 */
function notifyRedditHasAudio() {
  window.postMessage({
    source: "reddit-handler",
    action: "notifyAudio",
    hasActiveAudio: redditState.pageHasAudio
  }, "*");
}

// Start Reddit handler
initRedditVolumeControl();