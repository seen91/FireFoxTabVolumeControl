/**
 * Standard HTML5 Media Handler
 * Basic detection functions for media elements
 */

/**
 * Detect and register all media elements
 */
function detectSiteAudio() {
  // Find all media elements
  document.querySelectorAll('audio, video').forEach(element => {
    if (typeof window.registerMediaElement === 'function') {
      window.registerMediaElement(element);
    }
  });
  
  // Check common containers for nested media
  const selectors = ['[class*="video"]', '[class*="audio"]', '[class*="player"]', '[class*="media"]'];
  selectors.forEach(selector => {
    try {
      document.querySelectorAll(selector).forEach(container => {
        container.querySelectorAll('audio, video').forEach(element => {
          if (typeof window.registerMediaElement === 'function') {
            window.registerMediaElement(element);
          }
        });
      });
    } catch (e) {
      // Silently handle selector errors
    }
  });
}

/**
 * Site-specific volume setting (placeholder for future use)
 */
function setSiteVolume(volume) {
  // Standard implementation relies on main content script
}

// Export functions to global scope
window.detectSiteAudio = detectSiteAudio;
window.setSiteVolume = setSiteVolume;
