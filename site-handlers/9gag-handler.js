// 9gag-handler.js - 9GAG-specific volume control

// 9GAG-specific module variables
let gagAudioContext;
let gagGainNode;
let gagCurrentVolume = 1.0;
let gagAudioElements = new Set();
let gagMediaSourceNodes = new Map();
let gagInitialized = false;
let gagUsingWebAudio = false; // Track if we're using Web Audio API

// Initialize 9GAG-specific volume control
function init9GAGVolumeControl() {
  if (gagInitialized) return;
  gagInitialized = true;
  
  console.log('Volume control: 9GAG-specific handler initialized');
  
  // Create a MutationObserver to detect when new audio/video elements are added
  const gagObserver = new MutationObserver((mutations) => {
    let newMediaFound = false;
    
    mutations.forEach((mutation) => {
      if (mutation.addedNodes) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeName === 'AUDIO' || node.nodeName === 'VIDEO') {
            handle9GAGMediaElement(node);
            newMediaFound = true;
          } else if (node.querySelectorAll) {
            const mediaElements = node.querySelectorAll('audio, video');
            if (mediaElements.length > 0) {
              mediaElements.forEach(handle9GAGMediaElement);
              newMediaFound = true;
            }
          }
        });
      }
    });

    // Initialize audio context if we found new media and haven't initialized yet
    if (newMediaFound && !gagAudioContext && !gagUsingWebAudio) {
      // First try the direct HTML5 approach, if amplification is needed,
      // we'll switch to Web Audio API cautiously
      if (gagCurrentVolume > 1.0) {
        tryInit9GAGAudioContext();
      }
    }
  });

  // Start observing the document
  gagObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src']
  });

  // Find and handle any audio/video elements that already exist
  const existingMedia = document.querySelectorAll('audio, video');
  if (existingMedia.length > 0) {
    existingMedia.forEach(handle9GAGMediaElement);
    
    // Only initialize Web Audio if needed for amplification
    if (gagCurrentVolume > 1.0) {
      tryInit9GAGAudioContext();
    }
  }

  // Listen for 9GAG's custom video player events
  document.addEventListener('play', function(event) {
    if (event.target instanceof HTMLMediaElement) {
      if (!gagAudioElements.has(event.target)) {
        handle9GAGMediaElement(event.target);
        
        // Only initialize Web Audio if needed for amplification
        if (gagCurrentVolume > 1.0 && !gagAudioContext && !gagUsingWebAudio) {
          tryInit9GAGAudioContext();
        }
      }
    }
  }, true);
  
  // Setup message listener
  setup9GAGMessageListener();
}

// Try to initialize Web Audio API cautiously for 9GAG
function tryInit9GAGAudioContext() {
  // This is a special case for 9GAG to try to get amplification working
  // We'll implement a delayed and careful approach
  
  // First delay the initialization slightly to let 9GAG's player fully initialize
  setTimeout(() => {
    // Only proceed if we need amplification
    if (gagCurrentVolume <= 1.0) return;
    
    try {
      gagAudioContext = new (window.AudioContext || window.webkitAudioContext)();
      
      // Try to create a detached gain node first (not connected to any media)
      gagGainNode = gagAudioContext.createGain();
      gagGainNode.gain.value = gagCurrentVolume;
      gagGainNode.connect(gagAudioContext.destination);
      
      console.log('Volume control: 9GAG AudioContext initialized');
      
      // Mark that we're using Web Audio
      gagUsingWebAudio = true;
      
      // Wait a bit more before attempting to connect media elements
      setTimeout(() => {
        // Try to connect existing media elements one by one
        gagAudioElements.forEach(element => {
          try {
            connect9GAGElementToGainNode(element);
          } catch (e) {
            // If connecting fails, we'll revert to HTML5 control
            console.error('Volume control: Failed to connect 9GAG element, reverting to HTML5 volume');
            gagUsingWebAudio = false;
          }
        });
      }, 1000);
    } catch (e) {
      console.error('Volume control: 9GAG Web Audio API initialization failed', e);
      gagUsingWebAudio = false;
    }
  }, 500);
}

// Handle 9GAG media elements specifically
function handle9GAGMediaElement(element) {
  if (gagAudioElements.has(element)) return; // Already handling this element
  
  gagAudioElements.add(element);
  console.log('Volume control: Found 9GAG media element');
  
  // Set a flag on the element to mark it's from 9GAG
  element._is9GAGElement = true;
  
  // First, apply the current volume directly
  apply9GAGVolumeToElement(element, gagCurrentVolume);
  
  // If amplification is needed and Web Audio API is available, try to connect
  if (gagCurrentVolume > 1.0 && gagAudioContext && gagGainNode && gagUsingWebAudio) {
    // Try to connect to Web Audio API for amplification
    try {
      connect9GAGElementToGainNode(element);
    } catch (e) {
      console.error('Volume control: Error connecting 9GAG element, using direct volume control', e);
      // Keep using the direct volume control since connection failed
    }
  }
  
  // Watch for errors to detect if our volume control is breaking 9GAG's player
  element.addEventListener('error', function(e) {
    // If we get an error while using Web Audio, revert to HTML5 control
    if (gagUsingWebAudio) {
      console.error('Volume control: 9GAG media error detected, reverting to HTML5 volume control');
      gagUsingWebAudio = false;
      disconnect9GAGElements();
      
      // Reset the element's volume
      applyStandard9GAGVolumeToElement(element, Math.min(1.0, gagCurrentVolume));
    }
  });
}

// Connect 9GAG element to gain node (for amplification)
function connect9GAGElementToGainNode(element) {
  // Don't reconnect if already connected
  if (gagMediaSourceNodes.has(element)) return;
  
  try {
    // Create a new MediaElementSourceNode
    const source = gagAudioContext.createMediaElementSource(element);
    gagMediaSourceNodes.set(element, source);
    
    // Connect to our gain node
    source.connect(gagGainNode);
    
    // Set HTML5 volume to 100% as we'll control it with the gain node
    if (element.volume !== 1.0) {
      element.volume = 1.0;
    }
    
    console.log('Volume control: Successfully connected 9GAG element to gain node');
  } catch (e) {
    console.error('Volume control: Error connecting 9GAG element to gain node:', e);
    // If connection fails, revert to direct volume control
    gagUsingWebAudio = false;
    throw e; // Re-throw to allow caller to handle
  }
}

// Disconnect all 9GAG elements from Web Audio (used when reverting to HTML5 control)
function disconnect9GAGElements() {
  if (!gagAudioContext) return;
  
  // Disconnect all elements
  gagMediaSourceNodes.forEach((source, element) => {
    try {
      source.disconnect();
      console.log('Volume control: Disconnected 9GAG element from Web Audio');
    } catch (e) {
      console.error('Volume control: Error disconnecting 9GAG element', e);
    }
  });
  
  // Clear the map
  gagMediaSourceNodes.clear();
  
  // Close the audio context to clean up
  try {
    gagAudioContext.close();
    gagAudioContext = null;
    gagGainNode = null;
  } catch (e) {
    console.error('Volume control: Error closing 9GAG audio context', e);
  }
}

// Apply volume to 9GAG element
function apply9GAGVolumeToElement(element, volumeLevel) {
  try {
    if (gagUsingWebAudio && volumeLevel > 1.0) {
      // Using Web Audio API for amplification
      if (gagGainNode) {
        gagGainNode.gain.value = volumeLevel;
      }
      // Make sure HTML5 volume is at max
      element.volume = 1.0;
    } else {
      // Using direct HTML5 volume control
      applyStandard9GAGVolumeToElement(element, volumeLevel);
    }
  } catch (e) {
    console.error('Volume control: Error setting 9GAG element volume:', e);
    // Revert to standard HTML5 control
    applyStandard9GAGVolumeToElement(element, Math.min(1.0, volumeLevel));
  }
}

// Apply standard HTML5 volume
function applyStandard9GAGVolumeToElement(element, volumeLevel) {
  try {
    // For standard HTML5 control, limit to 1.0
    element.volume = Math.min(1.0, volumeLevel);
  } catch (e) {
    console.error('Volume control: Error setting standard 9GAG volume:', e);
  }
}

// Set volume for 9GAG
function set9GAGVolume(volumeLevel) {
  gagCurrentVolume = volumeLevel;
  
  // Notify the background script
  browser.runtime.sendMessage({
    action: "volumeChanged",
    volume: volumeLevel
  });

  // Check if we need amplification
  if (volumeLevel > 1.0) {
    // If not using Web Audio yet, try to initialize it
    if (!gagUsingWebAudio && !gagAudioContext) {
      tryInit9GAGAudioContext();
    }
    
    // If using Web Audio API, apply to gain node
    if (gagUsingWebAudio && gagGainNode) {
      try {
        gagGainNode.gain.value = volumeLevel;
      } catch (e) {
        console.error('Volume control: Error updating 9GAG gain node:', e);
      }
    } else {
      // If not using Web Audio, apply direct volume (capped at 1.0)
      gagAudioElements.forEach(element => {
        applyStandard9GAGVolumeToElement(element, 1.0);
      });
    }
  } else {
    // For reduction, use standard HTML5 volume
    gagAudioElements.forEach(element => {
      applyStandard9GAGVolumeToElement(element, volumeLevel);
    });
  }
}

// Setup message listener for 9GAG-specific handling
function setup9GAGMessageListener() {
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "setVolume") {
      set9GAGVolume(message.volume);
      sendResponse({success: true});
      return true;
    } else if (message.action === "getVolume") {
      sendResponse({volume: gagCurrentVolume});
      return true;
    }
  });
}