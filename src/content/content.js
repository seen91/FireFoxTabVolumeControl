// Global state
let currentVolume = 100;
let audioContext = null;
let gainNode = null;
let mediaElements = new Set();
let connectedElements = new Set();
let blockedSites = new Set();
let currentHostname = window.location.hostname.toLowerCase();

// Constants
const VOLUME_MAX = 100;
const VOLUME_MIN = 0;
const VOLUME_AMPLIFICATION_THRESHOLD = 100;
const VOLUME_NATIVE_MAX = 1.0;
const SCAN_INTERVAL = 5000;
const INITIAL_SCAN_DELAY = 1000;
const ADDITIONAL_SELECTORS = [
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

/**
 * Initialize Web Audio API for amplification
 * @returns {boolean} True if initialization was successful
 */
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

/**
 * Check if current site is blocked from using Web Audio API
 * @returns {boolean} True if site is blocked
 */
function isSiteBlocked() {
  const hostname = window.location.hostname.toLowerCase();
  return blockedSites.has(hostname);
}

/**
 * Mark current site as blocked from Web Audio API
 */
function markSiteAsBlocked() {
  const hostname = window.location.hostname.toLowerCase();
  blockedSites.add(hostname);
}

/**
 * Check if media element is served from a different origin
 * @param {HTMLMediaElement} element - Audio or video element to check
 * @returns {boolean} True if element is cross-origin
 */
function isCrossOriginElement(element) {
  const sources = [
    element.src,
    element.currentSrc,
    element.querySelector('source')?.src
  ].filter(Boolean);
  
  if (sources.length === 0) return false;
  
  try {
    const pageOrigin = window.location.origin;
    return sources.some(src => new URL(src).origin !== pageOrigin);
  } catch (e) {
    return true; // Assume cross-origin if URL parsing fails
  }
}

/**
 * Check if amplification should be blocked for this element/site
 * @param {HTMLMediaElement} element - Audio or video element to check
 * @returns {boolean} True if amplification should be blocked
 */
function shouldBlockAmplification(element) {
  if (isSiteBlocked()) return true;
  
  if (isCrossOriginElement(element)) {
    markSiteAsBlocked();
    return true;
  }
  
  return false;
}

// Try to connect element to Web Audio API, detect if blocked
function tryConnectToAudioContext(element) {
  if (!audioContext || !gainNode) return false;
  
  // Check if already connected
  if (connectedElements.has(element)) return true;
  
  try {
    const source = audioContext.createMediaElementSource(element);
    source.connect(gainNode);
    connectedElements.add(element);
    
    // Store reference to source for cleanup
    element._audioSource = source;
    return true;
  } catch (e) {
    // Site blocks Web Audio API connection - mark as blocked
    markSiteAsBlocked();
    return false;
  }
}

// Apply volume to media element
function applyVolumeToElement(element, volume) {
  // For volume reduction (0-100%), always use HTML5 volume property
  if (volume <= VOLUME_AMPLIFICATION_THRESHOLD) {
    element.volume = volume / VOLUME_MAX;
    return;
  }
  
  // For amplification (>100%), check if we should block this element/site
  element.volume = VOLUME_NATIVE_MAX;
  
  // Early check for cross-origin or blocked sites
  if (shouldBlockAmplification(element)) {
    // Don't attempt Web Audio API - element is cross-origin or site is blocked
    return;
  }
  
  // Initialize audio context if needed
  if (!audioContext && !initAudioContext()) {
    markSiteAsBlocked();
    return;
  }
  
  // Try to connect THIS specific element to gain node
  if (audioContext && gainNode) {
    const connected = tryConnectToAudioContext(element);
    if (!connected) {
      // If connection failed, this site doesn't support Web Audio API properly
      return;
    }
  }
}

// Set volume for all media elements
function setVolume(volume) {
  currentVolume = volume;
  
  // Apply volume to all registered media elements
  mediaElements.forEach(element => {
    if (element && !element.paused) {
      applyVolumeToElement(element, volume);
    }
  });
  
  // Only update gain node if we have successfully connected elements and site isn't blocked
  if (gainNode && !isSiteBlocked() && connectedElements.size > 0) {
    gainNode.gain.value = volume / VOLUME_MAX;
  }
  
  // Call site-specific handler if available
  if (typeof window.setSiteVolume === 'function') {
    try { window.setSiteVolume(volume); } catch (e) {}
  }
}

// Check if amplification is available on this site
function isAmplificationAvailable() {
  return !isSiteBlocked() && (audioContext || initAudioContext());
}

// Cleanup utilities
function cleanupAudioSource(element) {
  if (element._audioSource) {
    try {
      element._audioSource.disconnect();
    } catch (e) {}
    delete element._audioSource;
  }
}

function cleanupMediaElement(element) {
  cleanupAudioSource(element);
  mediaElements.delete(element);
  connectedElements.delete(element);
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
      cleanupMediaElement(element);
    });
    
    element.addEventListener('error', () => {
      cleanupMediaElement(element);
    });
  }
}

// Scan for media elements
function scanForMediaElements() {
  const existingElements = document.querySelectorAll('audio, video');
  
  // Register any new elements
  existingElements.forEach(registerMediaElement);
  
  // More aggressive scanning for sites that might hide audio/video elements
  ADDITIONAL_SELECTORS.forEach(selector => {
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
            cleanupMediaElement(node);
          }
          if (node.querySelectorAll) {
            node.querySelectorAll('audio, video').forEach(cleanupMediaElement);
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
      elementsToRemove.forEach(cleanupMediaElement);
      // Return whether we have any media elements and amplification availability
      sendResponse({ 
        hasAudio: mediaElements.size > 0,
        canAmplify: isAmplificationAvailable(),
        siteBlocked: isSiteBlocked()
      });
      break;
    case 'checkAmplification':
      sendResponse({ 
        canAmplify: isAmplificationAvailable(),
        siteBlocked: isSiteBlocked()
      });
      break;
  }
});

// Initialize
function initialize() {
  setupObservers();
  setTimeout(scanForMediaElements, INITIAL_SCAN_DELAY);
  
  // Periodic scan for new media elements
  setInterval(scanForMediaElements, SCAN_INTERVAL);
  
  // Check for page navigation (hostname change) and reset volume
  checkForHostnameChange();
}

/**
 * Check if the hostname has changed (page navigation) and reset volume if so
 */
function checkForHostnameChange() {
  const newHostname = window.location.hostname.toLowerCase();
  
  if (currentHostname !== newHostname) {
    // Reset internal state
    currentVolume = 100;
    currentHostname = newHostname;
    
    // Clear blocked sites cache since we're on a new site
    blockedSites.clear();
    
    // Clean up existing audio context and connected elements
    if (audioContext) {
      try {
        audioContext.close();
      } catch (e) {}
      audioContext = null;
      gainNode = null;
    }
    
    // Clear connected elements
    connectedElements.clear();
    
    // Clean up media elements
    mediaElements.forEach(element => {
      cleanupAudioSource(element);
    });
    mediaElements.clear();
    
    // Get volume from background (should be reset to 100)
    browser.runtime.sendMessage({ action: 'getVolume' })
      .then(response => {
        if (response && response.volume !== undefined) {
          setVolume(response.volume);
        }
      })
      .catch(() => {});
  }
  
  // Check again less frequently to reduce CPU usage
  setTimeout(checkForHostnameChange, 2000);
}

// Start when ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
