/**
 * VolumeController - Handles volume application logic and coordination
 */

import { VOLUME_MAX, VOLUME_AMPLIFICATION_THRESHOLD } from './constants.js';

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
    // Try to use Web Audio API for full volume control (both reduction and amplification)
    // This preserves the native volume controls and applies our changes as amplification
    
    // Early check for cross-origin or blocked sites
    if (this.audioManager.shouldBlockAmplification(element)) {
      // Fallback: Use HTML5 volume property, but limit to 0-100% range
      const clampedVolume = Math.min(volume, VOLUME_AMPLIFICATION_THRESHOLD);
      element.volume = clampedVolume / VOLUME_MAX;
      
      console.log('📉 Tab Volume Control: Using HTML5 fallback (0-100% only)', {
        element: element.tagName,
        requestedVolume: volume,
        appliedVolume: clampedVolume,
        reason: 'Cross-origin or blocked site'
      });
      return;
    }
    
    // Initialize audio context if needed
    if (!this.audioManager.audioContext && !this.audioManager.initAudioContext()) {
      // Fallback: Use HTML5 volume property, but limit to 0-100% range
      const clampedVolume = Math.min(volume, VOLUME_AMPLIFICATION_THRESHOLD);
      element.volume = clampedVolume / VOLUME_MAX;
      
      console.log('📉 Tab Volume Control: Using HTML5 fallback (0-100% only)', {
        element: element.tagName,
        requestedVolume: volume,
        appliedVolume: clampedVolume,
        reason: 'AudioContext initialization failed'
      });
      return;
    }
    
    // Try to connect THIS specific element to gain node
    if (this.audioManager.audioContext && this.audioManager.gainNode) {
      const connected = this.audioManager.tryConnectToAudioContext(element);
      if (!connected) {
        // If connection failed, fallback to HTML5 volume property (0-100% only)
        const clampedVolume = Math.min(volume, VOLUME_AMPLIFICATION_THRESHOLD);
        element.volume = clampedVolume / VOLUME_MAX;
        
        console.log('📉 Tab Volume Control: Using HTML5 fallback (0-100% only)', {
          element: element.tagName,
          requestedVolume: volume,
          appliedVolume: clampedVolume,
          reason: 'Web Audio API connection failed'
        });
        return;
      }
      
      console.log('🔊 Tab Volume Control: Web Audio API mode (0-500% possible)', {
        element: element.tagName,
        requestedVolume: volume,
        gainValue: volume / VOLUME_MAX
      });
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
    
    // Set gain for Web Audio API (only if we have connected elements and site isn't blocked)
    // For sites that don't support Web Audio API, volume is handled in applyVolumeToElement
    if (!this.audioManager.isSiteBlocked() && this.audioManager.getConnectedElementsCount() > 0) {
      this.audioManager.setGainValue(volume);
    }
    
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
