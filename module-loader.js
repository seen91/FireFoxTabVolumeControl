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
    path: 'site-handlers/youtube-handler.js'
  },
  reddit: {
    pattern: /reddit\.com/,
    name: 'Reddit',
    path: 'site-handlers/reddit-handler.js'
  },
  ninegag: {
    pattern: /9gag\.com/,
    name: '9GAG',
    path: 'site-handlers/9gag-handler.js'
  },
  standard: {
    pattern: /.*/,
    name: 'Standard',
    path: 'site-handlers/standard-handler.js'
  }
};

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
    const script = document.createElement('script');
    script.src = browser.runtime.getURL(path);
    script.onload = () => {
      console.log(`Volume Control: Successfully loaded ${path}`);
      
      // Notify content script that module has loaded
      window.postMessage({
        source: "module-loader",
        action: "moduleLoaded",
        modulePath: path,
        success: true
      }, "*");
      
      // For 9gag, use a different approach to ensure functions are available
      if (path.includes('9gag-handler.js')) {
        // Verify handler functions are available
        setTimeout(() => {
          const handlerAvailable = typeof window.init9GagVolumeControl === 'function';
          console.log(`Module Loader: 9GAG handler availability: ${handlerAvailable}`);
          
          if (handlerAvailable) {
            console.log('Module Loader: Initializing 9GAG handler directly');
            try {
              // Initialize with default volume
              window.init9GagVolumeControl(1.0);
              
              // Notify about initialization
              window.postMessage({
                source: "module-loader",
                action: "moduleInitialized",
                moduleName: "9GAG",
                success: true
              }, "*");
            } catch (err) {
              console.error('Module Loader: Error initializing 9GAG handler:', err);
              window.postMessage({
                source: "module-loader",
                action: "moduleInitError",
                moduleName: "9GAG",
                error: err.message
              }, "*");
            }
          } else {
            console.warn('Module Loader: 9GAG handler functions not found after load');
          }
        }, 100);
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
    document.head.appendChild(script);
  } catch (error) {
    console.error('Volume Control: Error loading module', error);
  }
}

// Start the module loading process when the script runs
loadVolumeControlModules();

// Set a flag to indicate the module loader is active
window.volumeControlModuleLoaderActive = true;