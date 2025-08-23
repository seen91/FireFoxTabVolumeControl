/**
 * MediaElementRegistry - Manages tracking and lifecycle of media elements
 */

class MediaElementRegistry {
  constructor(volumeController) {
    this.mediaElements = new Set();
    this.volumeController = volumeController;
  }

  /**
   * Register and track a media element
   * @param {HTMLMediaElement} element - Audio or video element to register
   */
  registerMediaElement(element) {
    if ((element.tagName === 'AUDIO' || element.tagName === 'VIDEO') && !this.mediaElements.has(element)) {
      this.mediaElements.add(element);
      
      // Apply current volume to the element
      if (this.volumeController) {
        this.volumeController.applyVolumeToElement(element);
      }
      
      // Set up event listeners
      this.setupElementEventListeners(element);
    }
  }

  /**
   * Set up event listeners for a media element
   * @param {HTMLMediaElement} element - Element to set up listeners for
   */
  setupElementEventListeners(element) {
    element.addEventListener('play', () => {
      if (this.volumeController) {
        this.volumeController.applyVolumeToElement(element);
      }
    });
    
    // Don't clean up on 'ended' or 'error' events for elements still in DOM
    // Reddit and similar sites may trigger these events during normal operation
    // but the element remains in DOM and may play again
    element.addEventListener('ended', () => {
      // Only remove from active tracking, keep audio connection for potential reuse
      // Don't force disconnect unless element is actually removed from DOM
    });
    
    element.addEventListener('error', () => {
      // Only remove from active tracking, keep audio connection for potential reuse
      // Don't force disconnect unless element is actually removed from DOM
    });
  }

  /**
   * Clean up a media element and remove it from tracking
   * @param {HTMLMediaElement} element - Element to cleanup
   * @param {boolean} forceDisconnect - Force disconnect audio source
   */
  cleanupMediaElement(element, forceDisconnect = false) {
    if (this.volumeController && this.volumeController.audioManager) {
      this.volumeController.audioManager.cleanupAudioSource(element, forceDisconnect);
    }
    this.mediaElements.delete(element);
  }

  /**
   * Get all registered media elements
   * @returns {Set} Set of media elements
   */
  getMediaElements() {
    return this.mediaElements;
  }

  /**
   * Get count of registered media elements
   * @returns {number} Number of registered elements
   */
  getMediaElementsCount() {
    return this.mediaElements.size;
  }

  /**
   * Check if element is registered
   * @param {HTMLMediaElement} element - Element to check
   * @returns {boolean} True if element is registered
   */
  hasMediaElement(element) {
    return this.mediaElements.has(element);
  }

  /**
   * Clean up orphaned elements that are no longer in the DOM
   */
  cleanupOrphanedElements() {
    const elementsToRemove = [];
    this.mediaElements.forEach(element => {
      if (!document.contains(element)) {
        elementsToRemove.push(element);
      }
    });
    // Force disconnect for elements that are actually removed from DOM
    elementsToRemove.forEach(element => this.cleanupMediaElement(element, true));
  }

  /**
   * Reset registry state (for navigation)
   */
  reset() {
    // Clean up all media elements with forced disconnect for navigation
    this.mediaElements.forEach(element => {
      if (this.volumeController && this.volumeController.audioManager) {
        this.volumeController.audioManager.cleanupAudioSource(element, true);
      }
    });
    this.mediaElements.clear();
  }

  /**
   * Apply volume to all registered elements
   * @param {function} applyFunction - Function to apply volume to each element
   */
  applyToAllElements(applyFunction) {
    this.mediaElements.forEach(element => {
      if (element && !element.paused) {
        applyFunction(element);
      }
    });
  }
}

export default MediaElementRegistry;
