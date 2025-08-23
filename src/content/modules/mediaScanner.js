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
    const directElements = document.querySelectorAll('audio, video');
    directElements.forEach(element => {
      this.mediaRegistry.registerMediaElement(element);
    });
    
    // Scan nested elements in common containers
    ADDITIONAL_SELECTORS.forEach(selector => {
      try {
        const containers = document.querySelectorAll(selector);
        
        containers.forEach(container => {
          // Look for nested audio/video
          const nestedElements = container.querySelectorAll('audio, video');
          nestedElements.forEach(element => {
            this.mediaRegistry.registerMediaElement(element);
          });
          
          // Special handling for custom players with shadow DOM
          if (container.tagName && container.tagName.toLowerCase().includes('shreddit')) {
            this.handleCustomPlayer(container);
          }
        });
      } catch (e) {
        console.warn(`Error scanning selector "${selector}":`, e);
      }
    });
    
    // Scan shadow DOM elements
    this.scanShadowDOMElements();
    
    // Call site-specific detection if available
    if (typeof window.detectSiteAudio === 'function') {
      try { 
        window.detectSiteAudio(); 
      } catch (e) {
        console.warn('Error in site-specific detection:', e);
      }
    }
  }

  /**
   * Handle custom video player components with shadow DOM
   * @param {Element} playerElement - The custom player element
   */
  handleCustomPlayer(playerElement) {
    // Check if shadow root exists and scan it
    if (playerElement.shadowRoot) {
      playerElement.shadowRoot.querySelectorAll('audio, video').forEach(element => {
        this.mediaRegistry.registerMediaElement(element);
      });
    }
    
    // Set up observer for when media elements are added to this player
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
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
        });
      });
    });
    
    observer.observe(playerElement, { childList: true, subtree: true });
    
    // Also wait a bit and re-scan, as custom players may load media elements asynchronously
    setTimeout(() => {
      playerElement.querySelectorAll('audio, video').forEach(element => {
        this.mediaRegistry.registerMediaElement(element);
      });
    }, 1000);
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
        // Force disconnect since element is being removed from DOM
        this.mediaRegistry.cleanupMediaElement(node, true);
      }
      if (node.querySelectorAll) {
        node.querySelectorAll('audio, video').forEach(element => {
          // Force disconnect since element is being removed from DOM
          this.mediaRegistry.cleanupMediaElement(element, true);
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
