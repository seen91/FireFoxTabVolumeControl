/**
 * VolumeController - Handles volume application logic and coordination
 */

import { VOLUME_MAX, VOLUME_AMPLIFICATION_THRESHOLD, VOLUME_NATIVE_MAX } from './constants.js';

class VolumeController {
  constructor(audioManager) {
    this.audioManager = audioManager;
    this.currentVolume = 100;
  }

  /**
   * Apply volume to a specific media element
   * @param {HTMLMediaElement} element - Element to apply volume to
   * @param {number} volume - Volume percentage (optional, uses current volume if not provided)
   */
  applyVolumeToElement(element, volume = this.currentVolume) {
    // For volume reduction (0-100%), always use HTML5 volume property
    if (volume <= VOLUME_AMPLIFICATION_THRESHOLD) {
      element.volume = volume / VOLUME_MAX;
      return;
    }
    
    // For amplification (>100%), check if we should block this element/site
    element.volume = VOLUME_NATIVE_MAX;
    
    // Early check for cross-origin or blocked sites
    if (this.audioManager.shouldBlockAmplification(element)) {
      // Don't attempt Web Audio API - element is cross-origin or site is blocked
      return;
    }
    
    // Initialize audio context if needed
    if (!this.audioManager.audioContext && !this.audioManager.initAudioContext()) {
      this.audioManager.markSiteAsBlocked();
      return;
    }
    
    // Try to connect THIS specific element to gain node
    if (this.audioManager.audioContext && this.audioManager.gainNode) {
      const connected = this.audioManager.tryConnectToAudioContext(element);
      if (!connected) {
        // If connection failed, this site doesn't support Web Audio API properly
        return;
      }
    }
  }

  /**
   * Set volume for all media elements
   * @param {number} volume - Volume percentage
   * @param {MediaElementRegistry} mediaRegistry - Registry of media elements
   */
  setVolume(volume, mediaRegistry) {
    this.currentVolume = volume;
    
    // Apply volume to all registered media elements
    if (mediaRegistry) {
      mediaRegistry.applyToAllElements((element) => {
        this.applyVolumeToElement(element, volume);
      });
    }
    
    // Only update gain node if we have successfully connected elements and site isn't blocked
    this.audioManager.setGainValue(volume);
    
    // Call site-specific handler if available
    if (typeof window.setSiteVolume === 'function') {
      try { 
        window.setSiteVolume(volume); 
      } catch (e) {
        // Silently handle errors from site-specific handlers
      }
    }
  }

  /**
   * Get current volume
   * @returns {number} Current volume percentage
   */
  getCurrentVolume() {
    return this.currentVolume;
  }

  /**
   * Check if amplification is available
   * @returns {boolean} True if amplification is available
   */
  isAmplificationAvailable() {
    return this.audioManager.isAmplificationAvailable();
  }

  /**
   * Check if site is blocked
   * @returns {boolean} True if site is blocked
   */
  isSiteBlocked() {
    return this.audioManager.isSiteBlocked();
  }

  /**
   * Reset volume controller state (for navigation)
   * @param {number} defaultVolume - Default volume to reset to
   */
  reset(defaultVolume = 100) {
    this.currentVolume = defaultVolume;
  }
}

export default VolumeController;
