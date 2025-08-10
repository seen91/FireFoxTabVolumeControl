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
   * N (native controller) × AM (amplitude modification) = Output volume
   * Respects user's native volume setting and applies amplification on top
   * @param {HTMLMediaElement} element - Element to apply volume to
   * @param {number} volume - Volume percentage (optional, uses current volume if not provided)
   */
  applyVolumeToElement(element, volume = this.currentVolume) {
    // Store the current native volume to preserve user's setting
    const currentNativeVolume = element.volume;
    
    // Early check for cross-origin or blocked sites
    if (this.audioManager.shouldBlockAmplification(element)) {
      // Fallback: use only native volume control if Web Audio API is blocked
      element.volume = Math.min(volume / VOLUME_MAX, VOLUME_NATIVE_MAX);
      return;
    }
    
    // Initialize audio context if needed
    if (!this.audioManager.audioContext && !this.audioManager.initAudioContext()) {
      this.audioManager.markSiteAsBlocked();
      // Fallback: use only native volume control
      element.volume = Math.min(volume / VOLUME_MAX, VOLUME_NATIVE_MAX);
      return;
    }
    
    // Try to connect THIS specific element to gain node
    if (this.audioManager.audioContext && this.audioManager.gainNode) {
      const connected = this.audioManager.tryConnectToAudioContext(element);
      if (!connected) {
        // If connection failed, fallback to native volume control
        element.volume = Math.min(volume / VOLUME_MAX, VOLUME_NATIVE_MAX);
        return;
      }
      
      // If Web Audio API is available, preserve the user's native volume setting
      // The gain node will handle amplification: N (current native) × AM (gain) = Output
      // Don't override the native volume - let user control it naturally
    }
  }

  /**
   * Set volume for all media elements
   * Uses formula: N (native controller) × AM (amplitude modification) = Output volume
   * Where N is the user's current native volume setting, and AM is the extension's gain
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
    
    // Update gain node with the amplitude modification value
    // This multiplies with whatever the user's native volume is set to
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
