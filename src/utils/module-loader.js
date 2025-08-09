/**
 * Module Loader for Volume Control Add-on
 * 
 * Loads the appropriate site-specific modules based on the current website
 */

// Constants
const MODULES = {
  youtube: {
    pattern: /youtube\.com/,
    name: 'YouTube',
    path: 'src/site-handlers/youtube-handler.js'
  },
  reddit: {
    pattern: /reddit\.com/,
    name: 'Reddit',
    path: 'src/site-handlers/reddit-handler.js'
  },
  ninegag: {
    pattern: /9gag\.com/,
    name: '9GAG',
    path: 'src/site-handlers/9gag-handler.js'
  },
  standard: {
    pattern: /.*/,
    name: 'Standard',
    path: 'src/site-handlers/standard-handler.js'
  }
};

/**
 * Wait for document.head to be available before executing callback
 * @param {Function} callback - Function to execute when document.head is available
 */
function waitForDocumentHead(callback) {
  // If document.head already exists, execute callback immediately
  if (document.head) {
    callback();
    return;
  }
  
  // If document.head doesn't exist, wait for it
  const observer = new MutationObserver((mutations) => {
    if (document.head) {
      observer.disconnect();
      callback();
    }
  });
  
  // Start observing the document for changes
  if (document.documentElement) {
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  } else {
    // Fallback: wait for DOMContentLoaded if even documentElement doesn't exist
    document.addEventListener('DOMContentLoaded', () => {
      observer.disconnect();
      if (document.head) {
        callback();
      } else {
        // Final fallback: try again after a short delay
        setTimeout(() => {
          if (document.head) {
            callback();
          } else {
            console.error('Volume Control: document.head still not available, cannot load module');
          }
        }, 100);
      }
    });
  }
}

/**
 * Main entry point - load appropriate modules
 */
function loadVolumeControlModules() {
  const hostname = window.location.hostname;
  const moduleToLoad = findModuleForHostname(hostname);
  
  console.log(`Volume Control: Loading ${moduleToLoad.name} module`);
  
  // Signal that we're starting the module loading process
  window.postMessage({
    source: "module-loader",
    action: "moduleLoading",
    moduleName: moduleToLoad.name
  }, "*");
  
  loadModule(moduleToLoad.path);
}

/**
 * Find the appropriate module for the current hostname
 * @param {string} hostname - The current site's hostname
 * @returns {object} The module configuration to load
 */
function findModuleForHostname(hostname) {
  // Find a matching module or use standard as fallback
  for (const [key, module] of Object.entries(MODULES)) {
    if (module.pattern.test(hostname)) {
      return module;
    }
  }
  
  // This should never happen because standard matches everything
  return MODULES.standard;
}

/**
 * Load a module by path
 * @param {string} path - Path to the module
 */
function loadModule(path) {
  try {
    // For 9gag site, we'll skip module loading entirely
    // The content script will handle everything directly
    if (path.includes('9gag-handler.js')) {
      console.log('Module Loader: Skipping 9GAG handler loading, using direct content script handling');
      
      // Notify content script that we're skipping the module
      window.postMessage({
        source: "module-loader",
        action: "moduleSkipped",
        modulePath: path,
        reason: "Using direct content script handling for 9GAG"
      }, "*");
      
      return;
    }
    
    // Regular script loading for other modules
    const script = document.createElement('script');
    script.src = browser.runtime.getURL(path);
    
    script.onload = () => {
      console.log(`Volume Control: Successfully loaded ${path}`);
      
      // For 9gag specifically, verify handler functions were properly exposed
      if (path.includes('9gag-handler.js')) {
        if (window.init9GagVolumeControl && window.set9GagVolume) {
          console.log('Module Loader: 9GAG handler functions successfully exposed');
        } else {
          console.error('Module Loader: 9GAG handler functions not exposed after loading!');
        }
      }
      
      // Notify content script that module has loaded
      window.postMessage({
        source: "module-loader",
        action: "moduleLoaded",
        modulePath: path,
        success: true,
        hasFunctions: path.includes('9gag-handler.js') ? {
          init: !!window.init9GagVolumeControl,
          setVolume: !!window.set9GagVolume
        } : null
      }, "*");
      
      // For 9gag specifically, directly initialize the handler after loading
      if (path.includes('9gag-handler.js') && window.init9GagVolumeControl) {
        // Use default volume for now, content script will update it later
        console.log('Module Loader: Initializing 9GAG handler directly after load');
        try {
          window.init9GagVolumeControl(1.0);
          
          // Notify about direct initialization
          window.postMessage({
            source: "module-loader",
            action: "moduleInitialized",
            moduleName: "9GAG"
          }, "*");
        } catch (error) {
          console.error('Module Loader: Error initializing 9GAG handler:', error);
        }
      }
    };
    
    script.onerror = (error) => {
      console.error(`Volume Control: Error loading ${path}`, error);
      
      // Notify content script about the failure
      window.postMessage({
        source: "module-loader",
        action: "moduleLoadFailed",
        modulePath: path
      }, "*");
      
      // If a specific module fails, fall back to standard handler
      if (path !== MODULES.standard.path) {
        console.log('Volume Control: Falling back to standard module');
        loadModule(MODULES.standard.path);
      }
    };
    
    // Ensure document.head exists before appending script
    waitForDocumentHead(() => {
      document.head.appendChild(script);
    });
  } catch (error) {
    console.error('Volume Control: Error loading module', error);
  }
}

// Start the module loading process when the DOM is ready
function initializeModuleLoader() {
  // If DOM is already loaded, start immediately
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadVolumeControlModules);
  } else {
    // DOM is already loaded, start module loading
    loadVolumeControlModules();
  }
}

// Initialize the module loader
initializeModuleLoader();

// Set a flag to indicate the module loader is active
window.volumeControlModuleLoaderActive = true;