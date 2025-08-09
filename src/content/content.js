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
  // For volume reduction (0-100%), use HTML5 volume property
  if (volume <= 100) {
    element.volume = volume / 100;
  } else {
    // For amplification (>100%), set to max and use gain node
    element.volume = 1.0;
    
    // Initialize audio context for amplification if needed
    if (!audioContext && volume > 100) {
      initAudioContext();
    }
    
    // Connect element to gain node for amplification
    if (audioContext && gainNode && volume > 100) {
      try {
        const source = audioContext.createMediaElementSource(element);
        source.connect(gainNode);
      } catch (e) {
        // Element might already be connected or have issues
        console.warn('Could not connect element to audio context:', e);
      }
    }
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
    });
    
    element.addEventListener('ended', () => {
      mediaElements.delete(element);
    });
    
    element.addEventListener('error', () => {
      mediaElements.delete(element);
    });
  }
}

// Scan for media elements
function scanForMediaElements() {
  const existingElements = document.querySelectorAll('audio, video');
  
  // Register any new elements
  existingElements.forEach(registerMediaElement);
  
  // More aggressive scanning for sites that might hide audio/video elements
  const additionalSelectors = [
    '[class*="video"]',
    '[class*="Video"]', 
    '[class*="player"]',
    '[class*="Player"]',
    '[class*="media"]',
    '[class*="Media"]',
    '[data-testid*="video"]',
    '[data-testid*="media"]',
    '[data-testid*="player"]'
  ];
  
  additionalSelectors.forEach(selector => {
    try {
      document.querySelectorAll(selector).forEach(container => {
        // Check for nested audio/video elements
        container.querySelectorAll('audio, video').forEach(element => {
          registerMediaElement(element);
        });
      });
    } catch (e) {
      // Silently handle errors for unsupported selectors
    }
  });
  
  // Check shadow DOM elements
  document.querySelectorAll('*').forEach(element => {
    if (element.shadowRoot) {
      try {
        element.shadowRoot.querySelectorAll('audio, video').forEach(shadowElement => {
          registerMediaElement(shadowElement);
        });
      } catch (e) {
        // Shadow DOM access might be restricted
      }
    }
  });
  
  // Call site-specific detection if available
  if (typeof window.detectSiteAudio === 'function') {
    try { window.detectSiteAudio(); } catch (e) {}
  }
}

// Set up observers for dynamic content
function setupObservers() {
  // Watch for new media elements
  new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      // Handle added nodes
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
      
      // Handle removed nodes - clean up media elements
      mutation.removedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.tagName === 'AUDIO' || node.tagName === 'VIDEO') {
            mediaElements.delete(node);
          }
          if (node.querySelectorAll) {
            node.querySelectorAll('audio, video').forEach(element => {
              mediaElements.delete(element);
            });
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
      // Clean up orphaned elements
      const elementsToRemove = [];
      mediaElements.forEach(element => {
        if (!document.contains(element)) {
          elementsToRemove.push(element);
        }
      });
      elementsToRemove.forEach(element => {
        mediaElements.delete(element);
      });
      // Return whether we have any media elements
      sendResponse({ hasAudio: mediaElements.size > 0 });
      break;
  }
});

// Initialize
function initialize() {
  setupObservers();
  setTimeout(scanForMediaElements, 1000);
  
  // Periodic scan for new media elements
  setInterval(scanForMediaElements, 5000);
}

// Start when ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
