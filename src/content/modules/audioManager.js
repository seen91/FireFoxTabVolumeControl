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
    this.blockedElements = new WeakSet(); // Track elements that failed Web Audio API connection
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
    // First check: if element has crossOrigin attribute set but not to 'anonymous' or 'use-credentials'
    // this indicates potential cross-origin issues
    if (element.crossOrigin === null && element.currentSrc) {
      // Element doesn't have crossOrigin set but has a source - check if source is cross-origin
      try {
        const srcOrigin = new URL(element.currentSrc).origin;
        const pageOrigin = window.location.origin;
        if (srcOrigin !== pageOrigin) {
          return true; // Cross-origin without CORS setup
        }
      } catch (e) {
        return true; // URL parsing failed, assume cross-origin for safety
      }
    }
    
    const sources = [
      element.src,
      element.currentSrc,
      element.querySelector('source')?.src
    ].filter(Boolean);
    
    if (sources.length === 0) {
      return false;
    }
    
    try {
      const pageOrigin = window.location.origin;
      return sources.some(src => {
        // Handle blob URLs - they are always same-origin
        if (src.startsWith('blob:')) {
          return false;
        }
        
        // Handle data URLs - they are always same-origin
        if (src.startsWith('data:')) {
          return false;
        }
        
        // Check if the source origin differs from the page origin
        const srcOrigin = new URL(src).origin;
        return srcOrigin !== pageOrigin;
      });
    } catch (e) {
      // If URL parsing fails, assume cross-origin for safety
      return true;
    }
  }

  /**
   * Check if amplification should be blocked for this element
   * @param {HTMLMediaElement} element - Audio or video element to check
   * @returns {boolean} True if amplification should be blocked for this specific element
   */
  shouldBlockAmplification(element) {
    // Check if this specific element was previously blocked
    if (this.blockedElements.has(element)) {
      return true;
    }
    
    // Check this specific element for cross-origin issues
    // Don't block the entire site - just this element
    return this.isCrossOriginElement(element);
  }

  /**
   * Try to connect element to Web Audio API
   * @param {HTMLMediaElement} element - Media element to connect
   * @returns {boolean} True if connection was successful
   */
  tryConnectToAudioContext(element) {
    if (!this.audioContext || !this.gainNode) return false;
    
    // Check if already connected
    if (this.connectedElements.has(element)) return true;
    
    // Check if element already has an audio source attached (from previous connection)
    if (element._audioSource) {
      // Element was previously connected, just add it back to our tracking
      this.connectedElements.add(element);
      return true;
    }
    
    // Double-check for cross-origin issues right before attempting connection
    // This is important because element sources can change dynamically (like on Reddit)
    if (this.shouldBlockAmplification(element)) {
      console.warn('Cross-origin content detected, skipping Web Audio API connection');
      return false;
    }
    
    try {
      const source = this.audioContext.createMediaElementSource(element);
      source.connect(this.gainNode);
      this.connectedElements.add(element);
      
      // Store reference to source for cleanup
      element._audioSource = source;
      return true;
    } catch (e) {
      // Connection failed - this element cannot use Web Audio API
      // This could be due to cross-origin restrictions or element already being connected
      console.warn('Failed to connect media element to AudioContext:', e.message);
      
      // Mark this element as blocked to prevent future attempts
      this.blockedElements.add(element);
      
      // If this was a cross-origin error, mark the site as problematic
      if (e.message.includes('cross-origin') || e.message.includes('Cross-origin')) {
        console.warn('Cross-origin error detected, this element will use HTML5 fallback');
      }
      
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
   * @param {boolean} forceDisconnect - Force disconnect even if element is still in DOM
   */
  cleanupAudioSource(element, forceDisconnect = false) {
    // Only fully disconnect if the element is being removed from DOM or explicitly forced
    // For temporary pauses/stops, keep the connection intact for reuse
    if (forceDisconnect || !document.contains(element)) {
      if (element._audioSource) {
        try {
          element._audioSource.disconnect();
        } catch (e) {}
        delete element._audioSource;
      }
      this.connectedElements.delete(element);
    } else {
      // Element is still in DOM, just remove from active tracking but keep the connection
      // This allows for quick reconnection when audio resumes
      this.connectedElements.delete(element);
    }
  }

  /**
   * Reset audio manager state (for navigation)
   */
  reset() {
    // Clear blocked sites cache since we're on a new site
    this.blockedSites.clear();
    
    // Clear blocked elements cache
    this.blockedElements = new WeakSet();
    
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
