// Global state
let currentVolume = 100;
let audioContext = null;
let gainNode = null;
let mediaElements = new Set();

// Initialize Web Audio API for amplification
function initAudioContext() {
  if (!audioContext) {
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      gainNode = audioContext.createGain();
      gainNode.connect(audioContext.destination);
      return true;
    } catch (error) {
      console.warn('AudioContext not available:', error);
      return false;
    }
  }
  return true;
}

// Apply volume to media element
function applyVolumeToElement(element, volume) {
  try {
    if (volume <= 100) {
      // For volume <= 100%, use HTML5 volume property
      element.volume = volume / 100;
      
      // If we have Web Audio API connection, we need to maintain it
      // but set gain to 1.0 and rely on element.volume for reduction
      if (element.volumeSource && gainNode) {
        gainNode.gain.value = 1.0;
      }
    } else {
      // For amplification (>100%), we need Web Audio API
      if (initAudioContext() && !element.volumeSource) {
        try {
          const source = audioContext.createMediaElementSource(element);
          source.connect(gainNode);
          element.volumeSource = source;
          element.volume = 1; // Keep element at full volume
          gainNode.gain.value = volume / 100;
        } catch (error) {
          console.warn('Web Audio setup failed, using fallback:', error);
          element.volume = 1; // Fallback to max volume
        }
      } else if (gainNode) {
        // Already connected to Web Audio, just update gain
        element.volume = 1;
        gainNode.gain.value = volume / 100;
      }
    }
  } catch (error) {
    console.error('Volume application failed:', error);
  }
}

// Set volume for all media elements
function setVolume(volume) {
  currentVolume = volume;
  mediaElements.forEach(element => {
    if (element && !element.paused) {
      applyVolumeToElement(element, volume);
    }
  });
  
  // Update gain node for amplification
  if (gainNode) gainNode.gain.value = volume / 100;
  
  // Call site-specific handler if available
  if (typeof window.setSiteVolume === 'function') {
    try { window.setSiteVolume(volume); } catch (e) {}
  }
}

// Register and track media elements
function registerMediaElement(element) {
  if ((element.tagName === 'AUDIO' || element.tagName === 'VIDEO') && !mediaElements.has(element)) {
    mediaElements.add(element);
    applyVolumeToElement(element, currentVolume);
    
    element.addEventListener('play', () => {
      applyVolumeToElement(element, currentVolume);
      browser.runtime.sendMessage({ action: 'notifyAudio' }).catch(() => {});
    });
    
    element.addEventListener('ended', () => mediaElements.delete(element));
    browser.runtime.sendMessage({ action: 'notifyAudio' }).catch(() => {});
  }
}

// Scan for media elements
function scanForMediaElements() {
  document.querySelectorAll('audio, video').forEach(registerMediaElement);
  if (typeof window.detectSiteAudio === 'function') {
    try { window.detectSiteAudio(); } catch (e) {}
  }
}

// Set up observers for dynamic content
function setupObservers() {
  // Watch for new media elements
  new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.tagName === 'AUDIO' || node.tagName === 'VIDEO') {
            registerMediaElement(node);
          }
          if (node.querySelectorAll) {
            node.querySelectorAll('audio, video').forEach(registerMediaElement);
          }
        }
      });
    });
  }).observe(document.body || document.documentElement, { childList: true, subtree: true });
  
  // Listen for play events
  document.addEventListener('play', (event) => {
    if (event.target && (event.target.tagName === 'AUDIO' || event.target.tagName === 'VIDEO')) {
      registerMediaElement(event.target);
    }
  }, true);
}

// Handle messages and initialize
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'setVolume':
      if (message.volume !== undefined) {
        setVolume(message.volume);
        sendResponse({ success: true });
      }
      break;
    case 'getVolume':
      sendResponse({ volume: currentVolume });
      break;
    case 'checkForAudio':
      scanForMediaElements();
      sendResponse({ success: true });
      break;
  }
});

// Initialize
function initialize() {
  setupObservers();
  setTimeout(scanForMediaElements, 1000);
  setInterval(scanForMediaElements, 5000);
}

// Start when ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
