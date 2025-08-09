// Standard HTML5 media handler
function initVolumeControl() {
  // Override Audio constructor for dynamic elements
  const originalAudio = window.Audio;
  window.Audio = function(...args) {
    const audio = new originalAudio(...args);
    setTimeout(() => {
      if (typeof registerMediaElement === 'function') registerMediaElement(audio);
    }, 100);
    return audio;
  };
  
  // Override createElement for audio/video elements
  const originalCreateElement = document.createElement;
  document.createElement = function(tagName, ...args) {
    const element = originalCreateElement.call(this, tagName, ...args);
    if (tagName && ['audio', 'video'].includes(tagName.toLowerCase())) {
      setTimeout(() => {
        if (typeof registerMediaElement === 'function') registerMediaElement(element);
      }, 100);
    }
    return element;
  };
  
  detectSiteAudio();
}

function detectSiteAudio() {
  // Find all media elements
  document.querySelectorAll('audio, video').forEach(element => {
    if (typeof registerMediaElement === 'function') registerMediaElement(element);
  });
  
  // Check common containers
  const selectors = ['[class*="video"]', '[class*="audio"]', '[class*="player"]', '[class*="media"]'];
  selectors.forEach(selector => {
    try {
      document.querySelectorAll(selector).forEach(container => {
        container.querySelectorAll('audio, video').forEach(element => {
          if (typeof registerMediaElement === 'function') registerMediaElement(element);
        });
      });
    } catch (e) {}
  });
}

function setSiteVolume(volume) {
  // Standard implementation relies on main content script
}

// Export functions
window.initVolumeControl = initVolumeControl;
window.detectSiteAudio = detectSiteAudio;
window.setSiteVolume = setSiteVolume;
