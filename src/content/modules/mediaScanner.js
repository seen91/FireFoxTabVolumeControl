/**
 * MediaScanner - Handles detection and scanning for media elements
 */

import { ADDITIONAL_SELECTORS } from './constants.js';

class MediaScanner {
  constructor(mediaRegistry) {
    this.mediaRegistry = mediaRegistry;
    this.mutationObserver = null;
  }

  /**
   * Scan for media elements in the document
   */
  scanForMediaElements() {
    // Scan for direct audio/video elements
    document.querySelectorAll('audio, video').forEach(element => {
      this.mediaRegistry.registerMediaElement(element);
    });
    
    // Scan nested elements in common containers
    ADDITIONAL_SELECTORS.forEach(selector => {
      try {
        document.querySelectorAll(selector).forEach(container => {
          container.querySelectorAll('audio, video').forEach(element => {
            this.mediaRegistry.registerMediaElement(element);
          });
        });
      } catch (e) {
        // Silently handle errors for unsupported selectors
      }
    });
    
    // Scan shadow DOM elements
    this.scanShadowDOMElements();
    
    // Call site-specific detection if available
    if (typeof window.detectSiteAudio === 'function') {
      try { 
        window.detectSiteAudio(); 
      } catch (e) {
        // Silently handle errors from site-specific detection
      }
    }
  }

  /**
   * Scan for media elements in shadow DOM
   */
  scanShadowDOMElements() {
    document.querySelectorAll('*').forEach(element => {
      if (element.shadowRoot) {
        try {
          element.shadowRoot.querySelectorAll('audio, video').forEach(shadowElement => {
            this.mediaRegistry.registerMediaElement(shadowElement);
          });
        } catch (e) {
          // Shadow DOM access might be restricted
        }
      }
    });
  }

  /**
   * Set up observers for dynamic content
   */
  setupObservers() {
    // Watch for new media elements
    this.mutationObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        // Handle added nodes
        mutation.addedNodes.forEach((node) => {
          this.handleAddedNode(node);
        });
        
        // Handle removed nodes
        mutation.removedNodes.forEach((node) => {
          this.handleRemovedNode(node);
        });
      });
    });

    this.mutationObserver.observe(document.body || document.documentElement, { 
      childList: true, 
      subtree: true 
    });
    
    // Listen for play events
    document.addEventListener('play', (event) => {
      if (event.target && (event.target.tagName === 'AUDIO' || event.target.tagName === 'VIDEO')) {
        this.mediaRegistry.registerMediaElement(event.target);
      }
    }, true);
  }

  /**
   * Handle nodes added to the DOM
   */
  handleAddedNode(node) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.tagName === 'AUDIO' || node.tagName === 'VIDEO') {
        this.mediaRegistry.registerMediaElement(node);
      }
      if (node.querySelectorAll) {
        node.querySelectorAll('audio, video').forEach(element => {
          this.mediaRegistry.registerMediaElement(element);
        });
      }
    }
  }

  /**
   * Handle nodes removed from the DOM
   */
  handleRemovedNode(node) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.tagName === 'AUDIO' || node.tagName === 'VIDEO') {
        this.mediaRegistry.cleanupMediaElement(node);
      }
      if (node.querySelectorAll) {
        node.querySelectorAll('audio, video').forEach(element => {
          this.mediaRegistry.cleanupMediaElement(element);
        });
      }
    }
  }

  /**
   * Stop observing for changes
   */
  disconnect() {
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }
  }

  /**
   * Reset scanner state (for navigation)
   */
  reset() {
    this.disconnect();
  }
}

export default MediaScanner;
