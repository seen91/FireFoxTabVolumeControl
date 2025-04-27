/**
 * Volume Control Manager
 * Handles volume manipulation across different types of media elements
 */

// Create namespace to avoid global pollution
const VolumeControlManager = {};

/**
 * Set the volume for all media elements
 * @param {Object} state - Global state object
 * @param {number} volumeLevel - Volume level (0.0 to 5.0)
 * @param {Function} applyVolumeToElement - Function to apply volume to element
 * @param {Function} setYouTubeVolume - Function to set YouTube volume
 */
VolumeControlManager.setVolume = function(state, volumeLevel, applyVolumeToElement, setYouTubeVolume) {
  const DEFAULT_VOLUME = 1.0; // Default volume (100%)
  
  // If volume is at default 100% (1.0)
  if (volumeLevel === DEFAULT_VOLUME) {
    // For 100% volume we need to:
    // 1. Reset gain node to 1.0 if it exists
    if (state.gainNode) {
      try {
        state.gainNode.gain.value = DEFAULT_VOLUME;
      } catch (e) {
        console.error('[Content] Error resetting gain node:', e);
      }
    }
    
    // 2. Apply 100% volume to all audio elements 
    state.audioElements.forEach(element => {
      applyVolumeToElement(element, DEFAULT_VOLUME);
    });
    
    // 3. Handle site-specific cases
    const hostname = window.location.hostname;
    if (hostname.includes('youtube.com')) {
      setYouTubeVolume(DEFAULT_VOLUME);
    }
    
    // 4. Update state and notify background script
    if (state.currentVolume !== volumeLevel) {
      state.currentVolume = volumeLevel;
      
      // Notify the background script about the volume change
      browser.runtime.sendMessage({
        action: "volumeChanged",
        volume: volumeLevel
      }).catch(err => {
        console.warn("[Content] Error notifying background:", err);
      });
      
      console.log("[Content] Volume set to default (100%)");
    }
    return;
  }

  // If we reach here, the volume is not 100%, so continue with normal processing
  state.currentVolume = volumeLevel;
  
  // Notify the background script about the volume change
  browser.runtime.sendMessage({
    action: "volumeChanged",
    volume: volumeLevel
  }).catch(err => {
    console.warn("[Content] Error notifying background:", err);
  });

  // Determine if we need to use site-specific volume handling
  const hostname = window.location.hostname;
  
  // For 9GAG, use direct volume control always
  if (hostname.includes('9gag.com')) {
    VolumeControlManager.set9GAGVolume(volumeLevel, applyVolumeToElement);
    return;
  } else if (hostname.includes('youtube.com')) {
    setYouTubeVolume(volumeLevel);
    return;
  }

  // Standard volume handling for non-site-specific cases
  VolumeControlManager.setStandardVolume(state, volumeLevel, applyVolumeToElement);
};

/**
 * Set volume for 9GAG videos
 * @param {number} volumeLevel - Volume level (0.0 to 5.0)
 * @param {Function} applyVolumeToElement - Function to apply volume to element
 */
VolumeControlManager.set9GAGVolume = function(volumeLevel, applyVolumeToElement) {
  // For 9GAG, we cap the volume at 100% as amplification doesn't work properly
  const cappedVolume = Math.min(volumeLevel, 1.0);
  console.log("[Content] Setting 9GAG volume directly to:", cappedVolume);
  
  const videos = document.querySelectorAll('video');
  let successCount = 0;
  
  videos.forEach(video => {
    try {
      // Mark as managed
      video._managed_by_9gag_handler = true;
      video.volume = cappedVolume;
      successCount++;
    } catch (videoError) {
      console.error("[Content] Error setting video volume:", videoError);
    }
  });
  
  console.log(`[Content] Directly set volume on ${successCount} of ${videos.length} videos`);
  
  // Handle future videos - this applies volume to any late-loading videos
  setTimeout(() => {
    const lateVideos = document.querySelectorAll('video');
    lateVideos.forEach(video => {
      try {
        if (video.volume !== cappedVolume) {
          video.volume = cappedVolume;
        }
      } catch (e) {}
    });
  }, 200);
};

/**
 * Set volume using standard method for most sites
 * @param {Object} state - Global state object
 * @param {number} volumeLevel - Volume level (0.0 to 5.0)
 * @param {Function} applyVolumeToElement - Function to apply volume to element
 */
VolumeControlManager.setStandardVolume = function(state, volumeLevel, applyVolumeToElement) {
  // Apply volume using the gainNode if available (for amplification)
  if (state.gainNode) {
    try {
      state.gainNode.gain.value = volumeLevel;
    } catch (e) {
      console.error('Volume control: Error updating gain node:', e);
    }
  }
  
  // Apply to media elements as fallback or for volume reduction
  state.audioElements.forEach(element => {
    applyVolumeToElement(element, volumeLevel);
  });
};