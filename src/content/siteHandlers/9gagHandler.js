// 9gag specific media handler
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
  
  // 9gag specific selectors - currently using standard approach
  // TODO: Add 9gag-specific logic for video containers and dynamic content
  const selectors = [
    '[class*="video"]', 
    '[class*="audio"]', 
    '[class*="player"]', 
    '[class*="media"]',
    '.post-container video',
    '.gif-video',
    '.video-post'
  ];
  
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
  // TODO: Add 9gag-specific volume control logic if needed
}

// Export functions
window.initVolumeControl = initVolumeControl;
window.detectSiteAudio = detectSiteAudio;
window.setSiteVolume = setSiteVolume;

// Set handler name for identification
window.handlerName = '9gagHandler';
