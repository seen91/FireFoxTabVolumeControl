// content.js - Runs in the context of web pages
// This script creates an AudioContext and controls volume using a GainNode

// Wait for the document to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeVolumeControl);
} else {
  initializeVolumeControl();
}

// Track active audio contexts and nodes
let audioContext;
let gainNode;
let currentVolume = 1.0; // Default volume (100%)
const audioElements = new Set();
const mediaSourceNodes = new Map(); // Map to track source nodes for each element
let initialized = false;
let pageHasAudio = false;

function initializeVolumeControl() {
  if (initialized) return;
  initialized = true;

  // Check if we're on a site with special handling
  const hostname = window.location.hostname;
  
  // Apply site-specific handling if needed
  if (hostname.includes('youtube.com')) {
    // Use YouTube-specific handling
    initYouTubeVolumeControl();
    return;
  } else if (hostname.includes('9gag.com')) {
    // Use 9GAG-specific handling
    init9GAGVolumeControl();
    return;
  }

  // Standard initialization for most sites
  initStandardVolumeControl();

  // Listen for messages from the extension
  setupMessageListener();
}

function initStandardVolumeControl() {
  // Create a MutationObserver to detect when new audio/video elements are added
  const observer = new MutationObserver((mutations) => {
    let newMediaFound = false;

    mutations.forEach((mutation) => {
      if (mutation.addedNodes) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeName === 'AUDIO' || node.nodeName === 'VIDEO') {
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

    // Initialize audio context if we found new media and haven't initialized yet
    if (newMediaFound && !audioContext) {
      initializeAudioContext();
      
      // Notify background script that this page has audio
      notifyHasAudio();
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
    pageHasAudio = true;
    existingMedia.forEach(handleMediaElement);
    initializeAudioContext();
    
    // Notify background script that this page has audio
    notifyHasAudio();
  }

  // Listen for media playing events at the document level
  document.addEventListener('play', function(event) {
    if (event.target instanceof HTMLMediaElement) {
      if (!audioElements.has(event.target)) {
        handleMediaElement(event.target);
        if (!audioContext) {
          initializeAudioContext();
        }
        
        // Notify background script that this page has audio
        notifyHasAudio();
      }
    }
  }, true);
  
  // Hook media element creation
  hookMediaElementCreation();
}

function initializeAudioContext() {
  if (audioContext) return; // Already initialized
  
  try {
    // Create new AudioContext
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Create a gain node for volume control
    gainNode = audioContext.createGain();
    gainNode.gain.value = currentVolume;
    gainNode.connect(audioContext.destination);
    
    // Apply the current volume to existing media elements
    audioElements.forEach(element => {
      connectElementToGainNode(element);
    });
    
    console.log('Volume control: AudioContext initialized');
  } catch (e) {
    console.error('Volume control: Web Audio API is not supported in this browser', e);
  }
}

function handleMediaElement(element) {
  if (audioElements.has(element)) return; // Already handling this element
  
  pageHasAudio = true;
  audioElements.add(element);
  
  // Apply current volume without creating a MediaElementSourceNode yet
  applyVolumeToElement(element, currentVolume);
  
  // If audio context already exists, connect this element
  if (audioContext && gainNode) {
    connectElementToGainNode(element);
  }
  
  // Add an event listener for when the media starts playing
  element.addEventListener('play', () => {
    if (!audioContext) {
      initializeAudioContext();
    }
    
    // Notify background script that this page has audio
    notifyHasAudio();
  }, { once: true });
}

function connectElementToGainNode(element) {
  // Don't reconnect if already connected
  if (mediaSourceNodes.has(element)) return;
  
  try {
    // Create a new MediaElementSourceNode
    const source = audioContext.createMediaElementSource(element);
    mediaSourceNodes.set(element, source);
    
    // Connect to our gain node
    source.connect(gainNode);
    
    // Set HTML5 volume to 100% as we'll control it with the gain node
    if (element.volume !== 1.0) {
      element.volume = 1.0;
    }
    
    console.log('Volume control: Successfully connected element to gain node');
  } catch (e) {
    console.error('Volume control: Error connecting media element to gain node:', e);
    // If we failed to connect to gain node, use HTML5 volume as fallback
    applyVolumeToElement(element, currentVolume);
  }
}

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

function setVolume(volumeLevel) {
  currentVolume = volumeLevel;
  
  // Notify the background script about the volume change
  browser.runtime.sendMessage({
    action: "volumeChanged",
    volume: volumeLevel
  });

  // Determine if we need to use site-specific volume handling
  const hostname = window.location.hostname;
  
  if (hostname.includes('youtube.com')) {
    setYouTubeVolume(volumeLevel);
    return;
  } else if (hostname.includes('9gag.com')) {
    set9GAGVolume(volumeLevel);
    return;
  }

  // Standard volume handling
  setStandardVolume(volumeLevel);
}

function setStandardVolume(volumeLevel) {
  // Apply volume using the gainNode if available (for amplification)
  if (gainNode) {
    try {
      gainNode.gain.value = volumeLevel;
    } catch (e) {
      console.error('Volume control: Error updating gain node:', e);
    }
  }
  
  // Apply to media elements as fallback or for volume reduction
  audioElements.forEach(element => {
    applyVolumeToElement(element, volumeLevel);
  });
}

function setupMessageListener() {
  // Listen for messages from the extension
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "setVolume") {
      setVolume(message.volume);
      sendResponse({success: true});
      return true;
    } else if (message.action === "getVolume") {
      sendResponse({volume: currentVolume});
      return true;
    } else if (message.action === "checkForAudio") {
      sendResponse({hasAudio: pageHasAudio});
      return true;
    }
  });
}

// Notify background script that this page has audio
function notifyHasAudio() {
  browser.runtime.sendMessage({
    action: "notifyAudio"
  }).catch(() => {
    // Ignore errors
  });
}

// Hook the creation of audio and video elements to catch dynamically created ones
function hookMediaElementCreation() {
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

// Function definitions for site-specific handling
// These would normally be in separate files
function initYouTubeVolumeControl() {
  // YouTube-specific code would be here
  console.log('YouTube volume control initialized');
}

function setYouTubeVolume(volumeLevel) {
  // YouTube-specific volume code would be here
  console.log('Setting YouTube volume to', volumeLevel);
}

function init9GAGVolumeControl() {
  // 9GAG-specific code would be here
  console.log('9GAG volume control initialized');
}

function set9GAGVolume(volumeLevel) {
  // 9GAG-specific volume code would be here
  console.log('Setting 9GAG volume to', volumeLevel);
}