/**
 * Firefox Tab Volume Control - Content Script
 * Main coordinator for volume control functionality
 */

// Constants
const SCAN_INTERVAL = 5000;
const INITIAL_SCAN_DELAY = 1000;

// Global module instances
let audioManager;
let mediaRegistry;
let volumeController;
let mediaScanner;
let navigationHandler;
let modulesLoaded = false;

/**
 * Initialize site-specific handlers
 */
async function initializeSiteHandlers() {
  // Override Audio constructor for dynamic elements
  const originalAudio = window.Audio;
  if (originalAudio) {
    window.Audio = function(...args) {
      const audio = new originalAudio(...args);
      setTimeout(() => {
        if (mediaRegistry) mediaRegistry.registerMediaElement(audio);
      }, 100);
      return audio;
    };
  }
  
  // Override createElement for audio/video elements
  const originalCreateElement = document.createElement;
  document.createElement = function(tagName, ...args) {
    const element = originalCreateElement.call(this, tagName, ...args);
    if (tagName && ['audio', 'video'].includes(tagName.toLowerCase())) {
      setTimeout(() => {
        if (mediaRegistry) mediaRegistry.registerMediaElement(element);
      }, 100);
    }
    return element;
  };

  // Load and execute the standard site handler
  try {
    const handlerUrl = browser.runtime.getURL('src/content/siteHandlers/standardHandler.js');
    const response = await fetch(handlerUrl);
    const handlerCode = await response.text();
    
    // Execute the handler code
    const script = document.createElement('script');
    script.textContent = handlerCode;
    document.head.appendChild(script);
    document.head.removeChild(script);
    
    // Set up global function for media registry access
    window.registerMediaElement = (element) => {
      if (mediaRegistry) {
        mediaRegistry.registerMediaElement(element);
      }
    };
  } catch (error) {
    console.warn('Failed to load site handler:', error);
  }
}

/**
 * Load and initialize all modules
 */
async function initializeModules() {
  try {
    const baseUrl = browser.runtime.getURL('src/content/modules/');
    
    // Load all modules in parallel
    const [
      AudioManager,
      MediaElementRegistry,
      VolumeController,
      MediaScanner,
      NavigationHandler
    ] = await Promise.all([
      import(baseUrl + 'audioManager.js').then(m => m.default),
      import(baseUrl + 'mediaElementRegistry.js').then(m => m.default),
      import(baseUrl + 'volumeController.js').then(m => m.default),
      import(baseUrl + 'mediaScanner.js').then(m => m.default),
      import(baseUrl + 'navigationHandler.js').then(m => m.default)
    ]);

    // Initialize modules with proper dependencies
    audioManager = new AudioManager();
    volumeController = new VolumeController(audioManager);
    mediaRegistry = new MediaElementRegistry(volumeController);
    mediaScanner = new MediaScanner(mediaRegistry);
    navigationHandler = new NavigationHandler(audioManager, mediaRegistry, volumeController, mediaScanner);

    modulesLoaded = true;
    return true;
  } catch (error) {
    console.error('Failed to load modules:', error);
    return false;
  }
}

/**
 * Handle messages from background script and popup
 */
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!modulesLoaded) {
    sendResponse({ error: 'Modules not loaded yet' });
    return;
  }

  if (!volumeController || !mediaRegistry || !mediaScanner) {
    sendResponse({ error: 'Modules not initialized' });
    return;
  }

  switch (message.action) {
    case 'setVolume':
      if (message.volume !== undefined) {
        volumeController.setVolume(message.volume, mediaRegistry);
        sendResponse({ success: true });
      }
      break;
      
    case 'getVolume':
      sendResponse({ volume: volumeController.getCurrentVolume() });
      break;
      
    case 'checkForAudio':
      mediaScanner.scanForMediaElements();
      // Clean up orphaned elements
      mediaRegistry.cleanupOrphanedElements();
      // Return current state information
      sendResponse({ 
        hasAudio: mediaRegistry.getMediaElementsCount() > 0,
        canAmplify: volumeController.isAmplificationAvailable(),
        siteBlocked: volumeController.isSiteBlocked()
      });
      break;
      
    case 'checkAmplification':
      sendResponse({ 
        canAmplify: volumeController.isAmplificationAvailable(),
        siteBlocked: volumeController.isSiteBlocked()
      });
      break;
  }
});

/**
 * Initialize the extension
 */
async function initialize() {
  // Initialize site handlers first
  await initializeSiteHandlers();
  
  // Load and initialize modules
  const success = await initializeModules();
  if (!success) {
    console.error('Failed to initialize modules, extension may not work properly');
    return;
  }
  
  // Set up media scanning and monitoring
  mediaScanner.setupObservers();
  setTimeout(() => mediaScanner.scanForMediaElements(), INITIAL_SCAN_DELAY);
  setInterval(() => mediaScanner.scanForMediaElements(), SCAN_INTERVAL);
  
  // Start navigation monitoring
  navigationHandler.startNavigationMonitoring();
}

/**
 * Start when DOM is ready
 */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
