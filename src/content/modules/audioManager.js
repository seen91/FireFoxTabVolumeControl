/**
 * AudioManager - Handles Web Audio API operations for volume amplification
 */

import { VOLUME_MAX } from './constants.js';

class AudioManager {
  constructor() {
    this.audioContext = null;
    this.gainNode = null;
    this.connectedElements = new Set();
    this.blockedSites = new Set();
  }

  /**
   * Initialize Web Audio API for amplification
   * @returns {boolean} True if initialization was successful
   */
  initAudioContext() {
    if (!this.audioContext) {
      try {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.gainNode = this.audioContext.createGain();
        this.gainNode.connect(this.audioContext.destination);
        return true;
      } catch (error) {
        console.warn('AudioContext not available:', error);
        return false;
      }
    }
    return true;
  }

  /**
   * Check if current site is blocked from using Web Audio API
   * @returns {boolean} True if site is blocked
   */
  isSiteBlocked() {
    const hostname = window.location.hostname.toLowerCase();
    return this.blockedSites.has(hostname);
  }

  /**
   * Mark current site as blocked from Web Audio API
   */
  markSiteAsBlocked() {
    const hostname = window.location.hostname.toLowerCase();
    this.blockedSites.add(hostname);
  }

  /**
   * Check if media element is served from a different origin
   * @param {HTMLMediaElement} element - Audio or video element to check
   * @returns {boolean} True if element is cross-origin
   */
  isCrossOriginElement(element) {
    const sources = [
      element.src,
      element.currentSrc,
      element.querySelector('source')?.src
    ].filter(Boolean);
    
    if (sources.length === 0) return false;
    
    try {
      const pageOrigin = window.location.origin;
      return sources.some(src => new URL(src).origin !== pageOrigin);
    } catch (e) {
      return true; // Assume cross-origin if URL parsing fails
    }
  }

  /**
   * Check if amplification should be blocked for this element/site
   * @param {HTMLMediaElement} element - Audio or video element to check
   * @returns {boolean} True if amplification should be blocked
   */
  shouldBlockAmplification(element) {
    if (this.isSiteBlocked()) return true;
    
    if (this.isCrossOriginElement(element)) {
      this.markSiteAsBlocked();
      return true;
    }
    
    return false;
  }

  /**
   * Try to connect element to Web Audio API, detect if blocked
   * @param {HTMLMediaElement} element - Media element to connect
   * @returns {boolean} True if connection was successful
   */
  tryConnectToAudioContext(element) {
    if (!this.audioContext || !this.gainNode) return false;
    
    // Check if already connected
    if (this.connectedElements.has(element)) return true;
    
    try {
      const source = this.audioContext.createMediaElementSource(element);
      source.connect(this.gainNode);
      this.connectedElements.add(element);
      
      // Store reference to source for cleanup
      element._audioSource = source;
      return true;
    } catch (e) {
      // Site blocks Web Audio API connection - mark as blocked
      this.markSiteAsBlocked();
      return false;
    }
  }

  /**
   * Set the gain value for amplification
   * @param {number} volume - Volume percentage (0-500)
   */
  setGainValue(volume) {
    if (this.gainNode && !this.isSiteBlocked() && this.connectedElements.size > 0) {
      // For amplification, we want to amplify based on the extension volume setting
      // The gain represents how much to amplify beyond 100%
      // For example: 200% extension volume = 2x amplification
      this.gainNode.gain.value = volume / VOLUME_MAX;
    }
  }

  /**
   * Check if amplification is available on this site
   * @returns {boolean} True if amplification is available
   */
  isAmplificationAvailable() {
    return !this.isSiteBlocked() && (this.audioContext || this.initAudioContext());
  }

  /**
   * Cleanup audio source for a specific element
   * @param {HTMLMediaElement} element - Element to cleanup
   */
  cleanupAudioSource(element) {
    if (element._audioSource) {
      try {
        element._audioSource.disconnect();
      } catch (e) {}
      delete element._audioSource;
    }
    this.connectedElements.delete(element);
  }

  /**
   * Reset audio manager state (for navigation)
   */
  reset() {
    // Clear blocked sites cache since we're on a new site
    this.blockedSites.clear();
    
    // Clean up existing audio context and connected elements
    if (this.audioContext) {
      try {
        this.audioContext.close();
      } catch (e) {}
      this.audioContext = null;
      this.gainNode = null;
    }
    
    // Clear connected elements
    this.connectedElements.clear();
  }

  /**
   * Get the number of connected elements
   * @returns {number} Number of connected elements
   */
  getConnectedElementsCount() {
    return this.connectedElements.size;
  }
}

export default AudioManager;
