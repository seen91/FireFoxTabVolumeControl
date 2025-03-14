/**
 * 9GAG-specific volume control handler
 */

// Immediately make functions available in the global scope
window.init9GagVolumeControl = init9GagVolumeControl;
window.set9GagVolume = set9GagVolume;
window.test9GagVolume = test9GagVolume;

// Initialize variables
let currentVolume = 1.0;
let observer = null;
let isSettingVolume = false;
let isInitialized = false;

console.log("[9GAG Handler] Script loaded, functions exported");

/**
 * Initialize volume control for 9GAG
 */
function init9GagVolumeControl(initialVolume) {
  if (isInitialized) {
    console.log("[9GAG Handler] Already initialized, updating volume to:", initialVolume);
    if (initialVolume !== undefined) {
      currentVolume = Math.min(initialVolume, 1.0);
      applyVolumeToAllVideos();
    }
    return;
  }
  
  console.log("[9GAG Handler] Initializing with volume:", initialVolume);
  
  // Set initial volume (capped at 1.0)
  currentVolume = Math.min(initialVolume !== undefined ? initialVolume : 1.0, 1.0);
  
  // Mark as initialized
  isInitialized = true;
  window._9gagVolumeHandlerActive = true;
  
  // Set up handlers
  setupVideoObserver();
  setupVideoEventListeners();
  
  // Apply initial volume after a short delay
  setTimeout(applyVolumeToAllVideos, 200);
  setTimeout(applyVolumeToAllVideos, 1000);
  
  // Notify that we're ready
  notifyHasAudio();
  
  console.log("[9GAG Handler] Initialization complete");
  return true;
}

/**
 * Set up event listeners for video play events
 */
function setupVideoEventListeners() {
  // Catch videos when they start playing
  document.addEventListener('play', function(event) {
    if (event.target instanceof HTMLVideoElement) {
      console.log("[9GAG Handler] Play event detected");
      applyVolumeToVideo(event.target);
      notifyHasAudio();
    }
  }, true);
}

/**
 * Set up observer to watch for new video elements
 */
function setupVideoObserver() {
  // Create a mutation observer to watch for added videos
  observer = new MutationObserver(function(mutations) {
    let videoFound = false;
    
    mutations.forEach(function(mutation) {
      if (mutation.addedNodes) {
        mutation.addedNodes.forEach(function(node) {
          if (node instanceof HTMLVideoElement) {
            videoFound = true;
            applyVolumeToVideo(node);
          } else if (node.querySelectorAll) {
            // Look for videos in the added node
            const videos = node.querySelectorAll('video');
            if (videos.length > 0) {
              videoFound = true;
              videos.forEach(applyVolumeToVideo);
            }
          }
        });
      }
    });
    
    if (videoFound) {
      notifyHasAudio();
    }
  });
  
  // Start observing the entire document
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
}

/**
 * Apply volume to a single video element
 */
function applyVolumeToVideo(video) {
  if (!video || !(video instanceof HTMLVideoElement)) return;
  
  try {
    // Mark the video as handled by us
    video._managed_by_9gag_handler = true;
    
    // Set volume directly
    video.volume = currentVolume;
    
    console.log("[9GAG Handler] Volume set to", currentVolume, "on", video);
  } catch (error) {
    console.error("[9GAG Handler] Error setting volume:", error);
  }
}

/**
 * Apply volume to all video elements on the page
 */
function applyVolumeToAllVideos() {
  const videos = document.querySelectorAll('video');
  console.log("[9GAG Handler] Found", videos.length, "videos");
  
  videos.forEach(applyVolumeToVideo);
  
  // Return true if we found any videos
  return videos.length > 0;
}

/**
 * Set volume for all 9GAG videos (called from content script)
 */
function set9GagVolume(volume) {
  // Cap at 100% (1.0)
  currentVolume = Math.min(volume, 1.0);
  
  console.log("[9GAG Handler] Setting volume to", currentVolume);
  
  // Apply to all videos
  const result = applyVolumeToAllVideos();
  
  // Try again after a short delay to catch any videos that might be loading
  setTimeout(applyVolumeToAllVideos, 200);
  
  return result;
}

/**
 * Notify content script that this page has audio
 */
function notifyHasAudio() {
  window.postMessage({
    source: "9gag-handler",
    action: "notifyAudio",
    hasActiveAudio: true
  }, "*");
}

/**
 * Test function to check video volume levels
 */
function test9GagVolume() {
  const videos = document.querySelectorAll('video');
  console.log("[9GAG Handler] Found", videos.length, "videos for testing");
  
  videos.forEach(function(video, index) {
    console.log(`[9GAG Handler] Video ${index} volume:`, video.volume);
  });
  
  return videos.length;
}