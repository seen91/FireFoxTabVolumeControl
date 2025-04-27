// standard-handler.js - Generic volume control for most sites

// Standard module variables
let stdAudioContext;
let stdGainNode;
let stdCurrentVolume = 1.0;
let stdAudioElements = new Set();
let stdMediaSourceNodes = new Map();
let stdInitialized = false;

// Initialize standard volume control
function initStandardVolumeControl() {
  if (stdInitialized) return;
  stdInitialized = true;
  
  console.log('Volume control: Standard handler initialized');
  
  // Create a MutationObserver to detect when new audio/video elements are added
  const observer = new MutationObserver((mutations) => {
    let newMediaFound = false;

    mutations.forEach((mutation) => {
      if (mutation.addedNodes) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeName === 'AUDIO' || node.nodeName === 'VIDEO') {
            handleStandardMediaElement(node);
            newMediaFound = true;
          } else if (node.querySelectorAll) {
            const mediaElements = node.querySelectorAll('audio, video');
            if (mediaElements.length > 0) {
              mediaElements.forEach(handleStandardMediaElement);
              newMediaFound = true;
            }
          }
        });
      }
    });

    // Initialize audio context if we found new media and haven't initialized yet
    if (newMediaFound && !stdAudioContext) {
      initStandardAudioContext();
    }
  });

  // Start observing the document
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src']
  });

  // Find and handle any audio/video elements that already exist
  const existingMedia = document.querySelectorAll('audio, video');
  if (existingMedia.length > 0) {
    existingMedia.forEach(handleStandardMediaElement);
    initStandardAudioContext();
  }

  // Listen for media playing events at the document level
  document.addEventListener('play', function(event) {
    if (event.target instanceof HTMLMediaElement) {
      if (!stdAudioElements.has(event.target)) {
        handleStandardMediaElement(event.target);
        if (!stdAudioContext) {
          initStandardAudioContext();
        }
      }
    }
  }, true);
  
  // Set up message listener for extension commands
  setupStandardMessageListener();
  
  // Hook media element creation
  hookStandardMediaElementCreation();
}

// Initialize Web Audio API for standard sites
function initStandardAudioContext() {
  if (stdAudioContext) return; // Already initialized
  
  try {
    // Create new AudioContext
    stdAudioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Create a gain node for volume control
    stdGainNode = stdAudioContext.createGain();
    stdGainNode.gain.value = stdCurrentVolume;
    stdGainNode.connect(stdAudioContext.destination);
    
    // Apply the current volume to existing media elements
    stdAudioElements.forEach(element => {
      connectStandardElementToGainNode(element);
    });
    
    console.log('Volume control: Standard AudioContext initialized');
  } catch (e) {
    console.error('Volume control: Web Audio API is not supported in this browser', e);
  }
}

// Handle standard media elements
function handleStandardMediaElement(element) {
  if (stdAudioElements.has(element)) return; // Already handling this element
  
  stdAudioElements.add(element);
  
  // Apply current volume without creating a MediaElementSourceNode yet
  applyStandardVolumeToElement(element, stdCurrentVolume);
  
  // If audio context already exists, connect this element
  if (stdAudioContext && stdGainNode) {
    connectStandardElementToGainNode(element);
  }
  
  // Add an event listener for when the media starts playing
  element.addEventListener('play', () => {
    if (!stdAudioContext) {
      initStandardAudioContext();
    }
  }, { once: true });
}

// Connect standard element to gain node
function connectStandardElementToGainNode(element) {
  // Don't reconnect if already connected
  if (stdMediaSourceNodes.has(element)) return;
  
  try {
    // Create a new MediaElementSourceNode
    const source = stdAudioContext.createMediaElementSource(element);
    stdMediaSourceNodes.set(element, source);
    
    // Connect to our gain node
    source.connect(stdGainNode);
    
    // Set HTML5 volume to 100% as we'll control it with the gain node
    if (element.volume !== 1.0) {
      element.volume = 1.0;
    }
    
    console.log('Volume control: Successfully connected standard element to gain node');
  } catch (e) {
    console.error('Volume control: Error connecting standard element to gain node:', e);
    // If we failed to connect to gain node, use HTML5 volume as fallback
    applyStandardVolumeToElement(element, stdCurrentVolume);
  }
}

// Apply volume directly to standard element
function applyStandardVolumeToElement(element, volumeLevel) {
  try {
    // HTML5 volume is capped at 1.0, so we can only use this for reducing volume
    if (volumeLevel <= 1.0) {
      element.volume = volumeLevel;
    } else {
      element.volume = 1.0; // Max out HTML5 volume
    }
  } catch (e) {
    console.error('Volume control: Error setting standard element volume:', e);
  }
}

// Set volume for standard sites
function setStandardVolume(volumeLevel) {
  stdCurrentVolume = volumeLevel;
  
  // Notify the background script
  browser.runtime.sendMessage({
    action: "volumeChanged",
    volume: volumeLevel
  });

  // Apply volume using the gainNode if available (for amplification)
  if (stdGainNode) {
    try {
      stdGainNode.gain.value = volumeLevel;
    } catch (e) {
      console.error('Volume control: Error updating standard gain node:', e);
    }
  }
  
  // Apply to media elements as fallback or for volume reduction
  stdAudioElements.forEach(element => {
    applyStandardVolumeToElement(element, volumeLevel);
  });
}

// Hook the creation of audio and video elements
function hookStandardMediaElementCreation() {
  const originalAudioConstructor = window.Audio;
  if (originalAudioConstructor) {
    window.Audio = function() {
      const newAudio = new originalAudioConstructor(...arguments);
      setTimeout(() => handleStandardMediaElement(newAudio), 0);
      return newAudio;
    };
    window.Audio.prototype = originalAudioConstructor.prototype;
  }
  
  // Hook createElement to detect video/audio creation
  const originalCreateElement = document.createElement;
  document.createElement = function() {
    const element = originalCreateElement.apply(this, arguments);
    if (arguments[0].toLowerCase() === 'audio' || arguments[0].toLowerCase() === 'video') {
      setTimeout(() => handleStandardMediaElement(element), 0);
    }
    return element;
  };
}

// Setup message listener for standard handling
function setupStandardMessageListener() {
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "setVolume") {
      setStandardVolume(message.volume);
      sendResponse({success: true});
      return true;
    } else if (message.action === "getVolume") {
      sendResponse({volume: stdCurrentVolume});
      return true;
    }
  });
}