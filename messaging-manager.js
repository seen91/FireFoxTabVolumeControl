/**
 * Messaging Manager
 * Handles communication between content script, background script, and site handlers
 */

// Create namespace to avoid global pollution
const MessagingManager = {};

/**
 * Set up message listener for extension communication
 * @param {Object} state - Global state object
 * @param {Function} setVolume - Function to set volume
 * @returns {Function} - Cleanup function to remove listeners
 */
MessagingManager.setupMessageListener = function(state, setVolume) {
  // Create handler function
  const messageHandler = (message, sender, sendResponse) => {
    if (message.action === "setVolume") {
      setVolume(message.volume);
      sendResponse({success: true});
      return true;
    } else if (message.action === "getVolume") {
      sendResponse({volume: state.currentVolume});
      return true;
    } else if (message.action === "checkForAudio") {
      // Special case for 9GAG - always report as having audio
      if (window.location.hostname.includes('9gag.com')) {
        sendResponse({hasAudio: true});
      } else {
        sendResponse({hasAudio: state.pageHasAudio});
      }
      return true;
    }
  };

  // Add listener
  browser.runtime.onMessage.addListener(messageHandler);
  
  // Return function to clean up listener if needed
  return () => {
    browser.runtime.onMessage.removeListener(messageHandler);
  };
};

/**
 * Set up listener for window messages from site handlers and module loader
 * @param {Object} state - Global state object
 * @param {Function} notifyHasAudio - Function to notify background script about audio
 * @returns {Function} - Cleanup function to remove listeners
 */
MessagingManager.setupWindowMessageListener = function(state, notifyHasAudio) {
  const messageHandler = function(event) {
    // Only accept messages from the same window
    if (event.source !== window) return;
    
    const data = event.data;
    
    // Handle messages from site handlers
    if (data && data.source) {
      // For 9GAG, we handle everything directly in content.js
      if (data.source === "9gag-handler") {
        console.log("[MessagingManager] Received message from 9GAG handler, but using direct handling");
        return;
      }
      
      // Handle other site handler messages normally
      if (data.action === 'notifyAudio') {
        state.pageHasAudio = true;
        state.pageHasActiveAudio = data.hasActiveAudio;
        notifyHasAudio();
      }
    }
  };

  window.addEventListener('message', messageHandler, false);
  
  // Return function to clean up listener if needed
  return () => {
    window.removeEventListener('message', messageHandler, false);
  };
};

/**
 * Notify background script that this page has audio
 * @param {boolean} hasActiveAudio - Whether the page has active audio playing
 */
MessagingManager.notifyHasAudio = function(hasActiveAudio) {
  browser.runtime.sendMessage({
    action: "notifyAudio",
    hasActiveAudio: hasActiveAudio
  }).catch(() => {
    // Ignore errors
  });
};