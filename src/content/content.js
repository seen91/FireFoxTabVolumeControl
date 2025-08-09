/**
 * Firefox Tab Volume Control - Content Script
 * Main coordinator for volume control functionality
 */

// Global module instances
let audioManager;
let mediaRegistry;
let volumeController;
let mediaScanner;
let navigationHandler;

// Module loading and initialization
let modulesLoaded = false;

/**
 * Load modules dynamically using dynamic imports
 */
async function loadModules() {
  try {
    const baseUrl = browser.runtime.getURL('src/content/modules/');
    
    // Load all modules
    const [
      { SCAN_INTERVAL, INITIAL_SCAN_DELAY },
      AudioManager,
      MediaElementRegistry,
      VolumeController,
      MediaScanner,
      NavigationHandler
    ] = await Promise.all([
      import(baseUrl + 'constants.js'),
      import(baseUrl + 'audioManager.js').then(m => m.default),
      import(baseUrl + 'mediaElementRegistry.js').then(m => m.default),
      import(baseUrl + 'volumeController.js').then(m => m.default),
      import(baseUrl + 'mediaScanner.js').then(m => m.default),
      import(baseUrl + 'navigationHandler.js').then(m => m.default)
    ]);

    // Store constants globally for use in other functions
    window.SCAN_INTERVAL = SCAN_INTERVAL;
    window.INITIAL_SCAN_DELAY = INITIAL_SCAN_DELAY;

    // Initialize modules
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
 * Initialize all modules (legacy fallback)
 */
function initializeModules() {
  // This is now handled by loadModules()
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
  // Load modules first
  const modulesLoadSuccess = await loadModules();
  if (!modulesLoadSuccess) {
    console.error('Failed to load modules, extension may not work properly');
    return;
  }
  
  // Set up media scanning and observation
  mediaScanner.setupObservers();
  setTimeout(() => mediaScanner.scanForMediaElements(), window.INITIAL_SCAN_DELAY);
  
  // Set up periodic scanning for new media elements
  setInterval(() => mediaScanner.scanForMediaElements(), window.SCAN_INTERVAL);
  
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
