// 9gag-handler.js - 9GAG-specific volume control

// 9GAG-specific module variables
let gagCurrentVolume = 1.0;
let gagAudioElements = new Set();
let gagInitialized = false;

// Initialize 9GAG-specific volume control
function init9GAGVolumeControl() {
  if (gagInitialized) return;
  gagInitialized = true;
  
  console.log('Volume control: 9GAG-specific handler initialized');
  console.log('Volume control: Note - 9GAG volume amplification limited to 100% to prevent audio issues');
  
  // Immediately notify the background script that this page has audio
  // This ensures 9GAG tabs appear in the list even before detecting specific audio elements
  notifyHasAudio();
  
  // Create a MutationObserver to detect when new audio/video elements are added
  const gagObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.addedNodes) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeName === 'AUDIO' || node.nodeName === 'VIDEO') {
            handle9GAGMediaElement(node);
            notifyHasAudio();
          } else if (node.querySelectorAll) {
            const mediaElements = node.querySelectorAll('audio, video');
            if (mediaElements.length > 0) {
              mediaElements.forEach(handle9GAGMediaElement);
              notifyHasAudio();
            }
          }
        });
      }
    });
  });

  // Start observing the document
  gagObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src']
  });

  // Find and handle any audio/video elements that already exist
  document.querySelectorAll('audio, video').forEach(handle9GAGMediaElement);

  // Special handling for 9GAG: Check for video posts even if they don't have active audio
  check9GAGVideoPosts();
  
  // Listen for 9GAG's custom video player events
  document.addEventListener('play', function(event) {
    if (event.target instanceof HTMLMediaElement) {
      if (!gagAudioElements.has(event.target)) {
        handle9GAGMediaElement(event.target);
        notifyHasAudio();
      }
    }
  }, true);
  
  // Setup message listener
  setup9GAGMessageListener();
}

// Special function to detect 9GAG video posts
function check9GAGVideoPosts() {
  // 9GAG video posts typically have these classes or elements
  const videoContainers = document.querySelectorAll('.video-post, .post-video, video');
  
  if (videoContainers.length > 0) {
    // Page has video elements, notify even if they're not currently playing
    notifyHasAudio();
    
    // Check again after a delay to catch dynamically loaded videos
    setTimeout(check9GAGVideoPosts, 3000);
  }
}

// Handle 9GAG media elements specifically
function handle9GAGMediaElement(element) {
  if (gagAudioElements.has(element)) return; // Already handling this element
  
  gagAudioElements.add(element);
  console.log('Volume control: Found 9GAG media element');
  
  // Apply current volume directly
  apply9GAGVolumeToElement(element, gagCurrentVolume);
  
  // Notify background script that this tab has audio
  notifyHasAudio();
}

// Apply volume directly to 9GAG element
function apply9GAGVolumeToElement(element, volumeLevel) {
  try {
    // Apply volume - for 9GAG we only use standard HTML5 volume 
    // to prevent breaking their audio system
    if (volumeLevel <= 1.0) {
      element.volume = volumeLevel;
    } else {
      // For 9GAG, we cap at 100% to prevent audio breakage
      element.volume = 1.0;
    }
  } catch (e) {
    console.error('Volume control: Error setting 9GAG element volume:', e);
  }
}

// Set volume for 9GAG specifically - no amplification to prevent breakage
function set9GAGVolume(volumeLevel) {
  gagCurrentVolume = volumeLevel;
  
  // Notify the background script about the volume change
  browser.runtime.sendMessage({
    action: "volumeChanged",
    volume: volumeLevel
  });

  // Apply to all elements - with caution for 9GAG
  gagAudioElements.forEach(element => {
    apply9GAGVolumeToElement(element, volumeLevel);
  });
  
  // Log warning when user tries to amplify 9GAG audio
  if (volumeLevel > 1.0) {
    console.log('Volume control: 9GAG volume amplification limited to 100% to prevent audio issues');
  }
}

// Notify background script that this page has audio
function notifyHasAudio() {
  browser.runtime.sendMessage({
    action: "notifyAudio"
  }).catch(() => {
    // Ignore errors
  });
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
    } else if (message.action === "checkForAudio") {
      // Always report that 9GAG has audio to ensure it appears in the list
      sendResponse({hasAudio: true});
      return true;
    }
  });
}

// Initialize immediately
init9GAGVolumeControl();