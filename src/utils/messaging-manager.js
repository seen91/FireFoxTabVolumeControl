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
        if (data.action === 'notifyAudio') {
          state.pageHasAudio = true;
          state.pageHasActiveAudio = data.hasActiveAudio;
          notifyHasAudio();
        }
        return;
      }
      
      // Handle other site handler messages
      if (data.action === 'notifyAudio') {
        state.pageHasAudio = true;
        state.pageHasActiveAudio = data.hasActiveAudio;
        notifyHasAudio();
      } else if (data.action === 'volumeChanged') {
        // Update the current volume in state and notify background
        state.currentVolume = data.volume;
        MessagingManager.notifyHasAudio(state.pageHasActiveAudio);
        
        // Also send volume change notification to background
        if (typeof browser !== 'undefined' && browser.runtime) {
          browser.runtime.sendMessage({
            action: "volumeChanged",
            volume: data.volume
          }).catch(() => {
            // Ignore errors
          });
        }
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

/**
 * Send a message to site handlers via window messaging
 * @param {string} action - The action to perform
 * @param {Object} data - Additional data to send
 * @returns {Promise} - Promise that resolves with the response
 */
MessagingManager.sendToSiteHandler = function(action, data = {}) {
  return new Promise((resolve, reject) => {
    const requestId = `req_${Date.now()}_${Math.random()}`;
    
    // Set up listener for response
    const responseHandler = (event) => {
      if (event.source !== window) return;
      
      const responseData = event.data;
      if (responseData && 
          responseData.requestId === requestId &&
          (responseData.source === 'reddit-handler' || 
           responseData.source === 'youtube-handler' || 
           responseData.source === 'standard-handler')) {
        
        window.removeEventListener('message', responseHandler);
        resolve(responseData);
      }
    };
    
    window.addEventListener('message', responseHandler);
    
    // Send the message
    window.postMessage({
      source: 'volume-control-content',
      action: action,
      requestId: requestId,
      ...data
    }, "*");
    
    // Set timeout to avoid hanging
    setTimeout(() => {
      window.removeEventListener('message', responseHandler);
      reject(new Error('Site handler response timeout'));
    }, 5000);
  });
};