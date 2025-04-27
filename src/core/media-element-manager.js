/**
 * Media Element Manager
 * Handles detection, tracking, and manipulation of media elements
 */

// Create namespace to avoid global pollution
const MediaElementManager = {};

/**
 * Handle a media element (audio or video)
 * @param {HTMLMediaElement} element - The media element to handle
 * @param {Object} state - Global state object
 * @param {Function} applyVolumeToElement - Function to apply volume to element
 * @param {Function} connectElementToGainNode - Function to connect element to gain node
 * @param {Function} notifyHasAudio - Function to notify that audio is present
 */
MediaElementManager.handleMediaElement = function(element, state, applyVolumeToElement, connectElementToGainNode, notifyHasAudio) {
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
      if (typeof AudioContextManager !== 'undefined') {
        AudioContextManager.initializeAudioContext(state, connectElementToGainNode);
      }
    }
    state.pageHasActiveAudio = true;
    notifyHasAudio();
  }, { once: false });
};

/**
 * Connect a media element to the gain node
 * @param {HTMLMediaElement} element - The media element to connect
 * @param {Object} state - Global state object
 * @param {Function} applyVolumeToElement - Function to apply volume to element
 */
MediaElementManager.connectElementToGainNode = function(element, state, applyVolumeToElement) {
  // Don't reconnect if already connected
  if (state.mediaSourceNodes.has(element)) return;
  
  // Skip if this is a 9GAG video - they don't work well with AudioContext
  if (element._managed_by_9gag_handler || window._9gagVolumeHandlerActive || 
      window.location.hostname.includes('9gag.com')) {
    console.log('Volume control: Skipping AudioContext for 9GAG video');
    return;
  }
  
  // Check if this element has cross-origin content
  let hasCrossOrigin = false;
  if (typeof AudioContextManager !== 'undefined' && AudioContextManager.hasCrossOriginContent) {
    hasCrossOrigin = AudioContextManager.hasCrossOriginContent(element);
    if (hasCrossOrigin) {
      console.log('Volume control: Detected cross-origin content, using HTML5 volume instead of AudioContext', element);
      // Mark this element as cross-origin to prevent future connection attempts
      element._has_cross_origin_content = true;
      // Fall back to using direct volume control
      applyVolumeToElement(element, state.currentVolume);
      return;
    }
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
    
    // If the error message contains "cross-origin", mark the element
    if (e.message && e.message.includes('cross-origin')) {
      element._has_cross_origin_content = true;
      console.log('Volume control: Cross-origin issue detected, falling back to HTML5 volume');
    }
    
    // If we failed to connect to gain node, use HTML5 volume as fallback
    applyVolumeToElement(element, state.currentVolume);
  }
};

/**
 * Apply volume directly to a media element
 * @param {HTMLMediaElement} element - The media element
 * @param {number} volumeLevel - Volume level (0.0 to 5.0)
 */
MediaElementManager.applyVolumeToElement = function(element, volumeLevel) {
  try {
    // HTML5 volume is capped at 1.0, so we can only use this for reducing volume
    if (volumeLevel <= 1.0) {
      element.volume = volumeLevel;
    } else {
      // For cross-origin content, we can't amplify beyond 1.0
      // However, if we have access to a gain node that's already connected, we can still use that
      if (element._has_cross_origin_content) {
        console.log('Volume control: Using HTML5 volume for cross-origin content (limited to 100%)');
        element.volume = 1.0; // Max out HTML5 volume since we can't amplify
      } else {
        element.volume = 1.0; // Max out HTML5 volume
      }
    }
  } catch (e) {
    console.error('Volume control: Error setting element volume:', e);
  }
};

/**
 * Set up a MutationObserver to detect dynamically added media elements
 * @param {Object} state - Global state object
 * @param {Function} handleMediaElement - Function to handle media elements
 * @param {Function} isMediaElement - Function to check if node is a media element
 * @param {Function} checkForActiveAudio - Function to check for active audio
 */
MediaElementManager.setupMutationObserver = function(state, handleMediaElement, isMediaElement, checkForActiveAudio) {
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
      if (typeof AudioContextManager !== 'undefined') {
        AudioContextManager.initializeAudioContext(state, (element) => {
          MediaElementManager.connectElementToGainNode(element, state, MediaElementManager.applyVolumeToElement);
        });
      }
      checkForActiveAudio(); // Check if any are active
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src']
  });
  
  return observer;
};

/**
 * Find any media elements that already exist in the page
 * @param {Object} state - Global state object
 * @param {Function} handleMediaElement - Function to handle media elements
 * @param {Function} checkForActiveAudio - Function to check for active audio
 */
MediaElementManager.findExistingMediaElements = function(state, handleMediaElement, checkForActiveAudio) {
  const existingMedia = document.querySelectorAll('audio, video');
  if (existingMedia.length > 0) {
    state.pageHasAudio = true;
    existingMedia.forEach(handleMediaElement);
    
    if (typeof AudioContextManager !== 'undefined') {
      AudioContextManager.initializeAudioContext(state, (element) => {
        MediaElementManager.connectElementToGainNode(element, state, MediaElementManager.applyVolumeToElement);
      });
    }
    
    checkForActiveAudio(); // Check if any are active
    return true;
  }
  
  return false;
};

/**
 * Check if any audio/video elements are actually playing
 * @param {Object} state - Global state object
 * @param {Function} notifyHasAudio - Function to notify that audio is present
 * @returns {boolean} True if active audio is found
 */
MediaElementManager.checkForActiveAudio = function(state, notifyHasAudio) {
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
};

/**
 * Set up a listener for media play events
 * @param {Object} state - Global state object
 * @param {Function} handleMediaElement - Function to handle media elements
 * @param {Function} notifyHasAudio - Function to notify that audio is present
 * @param {Function} checkForActiveAudio - Function to check for active audio
 */
MediaElementManager.setupPlayEventListener = function(state, handleMediaElement, notifyHasAudio, checkForActiveAudio) {
  document.addEventListener('play', function(event) {
    if (event.target instanceof HTMLMediaElement) {
      if (!state.audioElements.has(event.target)) {
        handleMediaElement(event.target);
        if (!state.audioContext && typeof AudioContextManager !== 'undefined') {
          AudioContextManager.initializeAudioContext(state, (element) => {
            MediaElementManager.connectElementToGainNode(element, state, MediaElementManager.applyVolumeToElement);
          });
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
};

/**
 * Hook the creation of audio and video elements to catch dynamically created ones
 * @param {Function} handleMediaElement - Function to handle media elements
 */
MediaElementManager.hookMediaElementCreation = function(handleMediaElement) {
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
};

/**
 * Check if node is a media element (audio or video)
 * @param {Node} node - DOM node to check
 * @returns {boolean} True if the node is a media element
 */
MediaElementManager.isMediaElement = function(node) {
  return node.nodeName === 'AUDIO' || node.nodeName === 'VIDEO';
};