/**
 * NavigationHandler - Handles page navigation and state reset
 */

import { HOSTNAME_CHECK_INTERVAL, DEFAULT_VOLUME } from './constants.js';

class NavigationHandler {
  constructor(audioManager, mediaRegistry, volumeController, mediaScanner) {
    this.audioManager = audioManager;
    this.mediaRegistry = mediaRegistry;
    this.volumeController = volumeController;
    this.mediaScanner = mediaScanner;
    this.currentHostname = window.location.hostname.toLowerCase();
    this.navigationCheckTimeoutId = null;
  }

  /**
   * Start monitoring for hostname changes (page navigation)
   */
  startNavigationMonitoring() {
    this.checkForHostnameChange();
  }

  /**
   * Check if the hostname has changed (page navigation) and reset volume if so
   */
  checkForHostnameChange() {
    const newHostname = window.location.hostname.toLowerCase();
    
    if (this.currentHostname !== newHostname) {
      this.handleNavigation(newHostname);
    }
    
    // Schedule next check
    this.navigationCheckTimeoutId = setTimeout(() => {
      this.checkForHostnameChange();
    }, HOSTNAME_CHECK_INTERVAL);
  }

  /**
   * Handle navigation to a new hostname
   * @param {string} newHostname - The new hostname
   */
  async handleNavigation(newHostname) {
    // Update current hostname
    this.currentHostname = newHostname;
    
    // Reset all module states
    this.resetAllModules();
    
    // Get volume from background (should be reset to default)
    try {
      const response = await browser.runtime.sendMessage({ action: 'getVolume' });
      if (response && response.volume !== undefined) {
        this.volumeController.setVolume(response.volume, this.mediaRegistry);
      }
    } catch (e) {
      // If background communication fails, use default volume
      this.volumeController.setVolume(DEFAULT_VOLUME, this.mediaRegistry);
    }
  }

  /**
   * Reset all module states for navigation
   */
  resetAllModules() {
    // Reset volume controller
    this.volumeController.reset(DEFAULT_VOLUME);
    
    // Reset audio manager
    this.audioManager.reset();
    
    // Reset media registry
    this.mediaRegistry.reset();
    
    // Reset media scanner
    this.mediaScanner.reset();
  }

  /**
   * Stop navigation monitoring
   */
  stopNavigationMonitoring() {
    if (this.navigationCheckTimeoutId) {
      clearTimeout(this.navigationCheckTimeoutId);
      this.navigationCheckTimeoutId = null;
    }
  }

  /**
   * Get current hostname
   * @returns {string} Current hostname
   */
  getCurrentHostname() {
    return this.currentHostname;
  }

  /**
   * Clean up navigation handler
   */
  cleanup() {
    this.stopNavigationMonitoring();
  }
}

export default NavigationHandler;
