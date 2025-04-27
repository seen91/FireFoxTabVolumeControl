// audio-context-manager.js
// Handles initialization and management of Web Audio API components

/**
 * Initialize the Web Audio API
 * @param {Object} state - The global state object containing audioContext, gainNode, etc.
 * @param {Function} connectElementToGainNode - Function to connect elements to the gain node
 * @returns {boolean} True if initialization was successful
 */
export function initializeAudioContext(state, connectElementToGainNode) {
  if (state.audioContext) {
    // If we already have an AudioContext but it's suspended, try to resume it
    if (state.audioContext.state === 'suspended') {
      // Try to resume the AudioContext
      state.audioContext.resume().then(() => {
        console.log('Volume control: AudioContext resumed successfully');
      }).catch(err => {
        // Silent fail in production, but keep track we tried
        state.autoplayBlocked = true;
      });
    }
    return true;
  }
  
  try {
    // Create new AudioContext
    state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Create a gain node for volume control
    state.gainNode = state.audioContext.createGain();
    state.gainNode.gain.value = state.currentVolume;
    state.gainNode.connect(state.audioContext.destination);
    
    // Check if the AudioContext is in a suspended state (autoplay policy)
    if (state.audioContext.state === 'suspended') {
      console.log('Volume control: AudioContext initialized in suspended state');
      state.autoplayBlocked = true;
      
      // Setup our enhanced autoplay policy handling
      setupAudioContextResumeHandling(state, connectElementToGainNode);
    }
    
    // Apply the current volume to existing media elements
    state.audioElements.forEach(element => {
      connectElementToGainNode(element);
    });
    
    console.log('Volume control: AudioContext initialized');
    return true;
  } catch (e) {
    console.error('Volume control: Web Audio API is not supported in this browser');
    return false;
  }
}

/**
 * Set up comprehensive handlers for resuming AudioContext
 * This uses multiple techniques to ensure we catch all user interactions
 * @param {Object} state - The global state object
 * @param {Function} tryReconnectMediaElements - Function to reconnect elements after context resumed
 */
export function setupAudioContextResumeHandling(state, tryReconnectMediaElements) {
  // Bail if we're already set up
  if (state.resumeHandlersInitialized) return;
  state.resumeHandlersInitialized = true;
  
  const resumeAudioContext = () => {
    if (state.audioContext && state.audioContext.state === 'suspended') {
      state.audioContext.resume().then(() => {
        console.log('Volume control: AudioContext resumed after user interaction');
        
        if (state.audioContext.state === 'running') {
          state.autoplayBlocked = false;
          tryReconnectMediaElements();
        }
      }).catch(() => {
        // Silent fail in production
      });
    }
  };

  // 1. Standard user interaction events
  const userInteractionEvents = ['click', 'touchstart', 'touchend', 'mousedown', 'keydown', 'pointerdown'];
  userInteractionEvents.forEach(eventType => {
    document.addEventListener(eventType, resumeAudioContext, { passive: true, capture: true });
  });
  
  // 2. Media-specific events that likely represent user intention to play media
  const mediaEvents = ['play', 'playing', 'seeking', 'volumechange'];
  document.addEventListener('play', function(event) {
    if (event.target instanceof HTMLMediaElement) {
      resumeAudioContext();
    }
  }, { capture: true, passive: true });
  
  document.addEventListener('playing', function(event) {
    if (event.target instanceof HTMLMediaElement) {
      resumeAudioContext();
    }
  }, { capture: true, passive: true });
  
  document.addEventListener('seeking', function(event) {
    if (event.target instanceof HTMLMediaElement) {
      resumeAudioContext();
    }
  }, { capture: true, passive: true });
  
  document.addEventListener('volumechange', function(event) {
    if (event.target instanceof HTMLMediaElement) {
      resumeAudioContext();
    }
  }, { capture: true, passive: true });
  
  // 3. Scroll event - this can be important for sites where interaction
  // is primarily through scrolling
  let scrollTimeout;
  document.addEventListener('scroll', function() {
    if (scrollTimeout) clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(resumeAudioContext, 200);
  }, { passive: true });
  
  // 4. Mutation observer to find and watch custom media controls
  // This helps with sites that use custom UI elements like bsky.app
  const mediaControlObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' || mutation.type === 'childList') {
        // Look for potential media controls in the changed elements
        findAndAttachToMediaControls(mutation.target, state);
      }
    }
  });
  
  // Start observing with a delay to let the page load
  setTimeout(() => {
    mediaControlObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'data-state']
    });
    
    // Do an initial scan for media controls
    findAndAttachToMediaControls(document.body, state);
  }, 1000);
  
  // 5. Schedule periodic attempts to resume the context
  // This helps in cases where normal events aren't firing as expected
  state.resumeInterval = setInterval(() => {
    // Only try to auto-resume for a limited time after initialization
    // to avoid infinite attempts
    const timeNow = Date.now();
    if (!state.audioContextInitTime) {
      state.audioContextInitTime = timeNow;
    }
    
    // Try for up to 2 minutes
    if (timeNow - state.audioContextInitTime < 2 * 60 * 1000) {
      if (state.audioContext && state.audioContext.state === 'suspended' && 
          checkForActiveMedia(state)) {
        console.log('Volume control: Attempting scheduled resume of AudioContext');
        resumeAudioContext();
      }
    } else {
      // Stop trying after 2 minutes
      clearInterval(state.resumeInterval);
    }
  }, 5000);
}

/**
 * Find potential media controls in the DOM and attach click listeners
 * This helps with sites using custom media players like bsky.app
 * @param {HTMLElement} rootElement - The root element to search within
 * @param {Object} state - The global state object
 */
export function findAndAttachToMediaControls(rootElement, state) {
  if (!rootElement || !rootElement.querySelectorAll) return;
  
  // Common selectors for media controls across various sites
  const controlSelectors = [
    // General media control selectors
    'button[aria-label*="play"]',
    'button[aria-label*="pause"]',
    'button[aria-label*="mute"]',
    'button[aria-label*="volume"]',
    'div[role="slider"]',
    'input[type="range"]',
    // Classes often used for media controls
    '.play-button',
    '.pause-button',
    '.mute-button',
    '.volume-control',
    '.timeline',
    '.progress-bar',
    '.media-control',
    // Site-specific selectors (add more as needed)
    '.TimelineScrubber', // bsky.app
    '.VolumeControls',   // bsky.app
    '[data-testid="playButton"]'
  ];
  
  try {
    // Find all potential media controls
    const potentialControls = rootElement.querySelectorAll(controlSelectors.join(','));
    
    potentialControls.forEach(control => {
      // Skip if already processed
      if (control._volume_control_processed) return;
      control._volume_control_processed = true;
      
      // Add a capture phase listener to ensure we get the event before it's stopped
      control.addEventListener('click', () => {
        if (state.audioContext && state.audioContext.state === 'suspended') {
          console.log('Volume control: Media control interaction detected, resuming AudioContext');
          state.audioContext.resume().catch(() => {});
        }
      }, { capture: true, passive: true });
      
      // For range inputs (like volume sliders), also listen for input events
      if (control.tagName === 'INPUT' && control.type === 'range') {
        control.addEventListener('input', () => {
          if (state.audioContext && state.audioContext.state === 'suspended') {
            console.log('Volume control: Slider interaction detected, resuming AudioContext');
            state.audioContext.resume().catch(() => {});
          }
        }, { capture: true, passive: true });
      }
    });
  } catch (e) {
    // Silently fail if there's an error in the selector or query
  }
}

/**
 * Check if there's active media playing on the page
 * @param {Object} state - The global state object
 * @returns {boolean} True if active media is found
 */
export function checkForActiveMedia(state) {
  let hasActiveMedia = false;
  
  // Check our tracked audio elements
  state.audioElements.forEach(element => {
    if (!element.paused && !element.ended) {
      hasActiveMedia = true;
    }
  });
  
  // Also check any other media elements we might have missed
  if (!hasActiveMedia) {
    const allMedia = document.querySelectorAll('video, audio');
    for (let i = 0; i < allMedia.length; i++) {
      if (!allMedia[i].paused && !allMedia[i].ended) {
        hasActiveMedia = true;
        break;
      }
    }
  }
  
  return hasActiveMedia;
}

/**
 * Try to reconnect media elements if they were not properly connected
 * due to suspended AudioContext
 * @param {Object} state - The global state object
 * @param {Function} connectElementToGainNode - Function to connect elements to gain node
 * @param {Function} handleMediaElement - Function to handle media elements
 */
export function tryReconnectMediaElements(state, connectElementToGainNode, handleMediaElement) {
  // Reconnect existing elements that might not have connected properly
  state.audioElements.forEach(element => {
    if (!state.mediaSourceNodes.has(element)) {
      connectElementToGainNode(element);
    }
  });
  
  // Look for any media elements we might have missed
  const allMedia = document.querySelectorAll('video, audio');
  for (let i = 0; i < allMedia.length; i++) {
    const element = allMedia[i];
    if (!state.audioElements.has(element)) {
      handleMediaElement(element);
    }
  }
}