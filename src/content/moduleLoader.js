// Simple module loader for site-specific handlers
const handlers = {
  standard: 'src/content/siteHandlers/standardHandler.js'
};

// Determine which handler to use based on hostname
function getHandler() {
  const hostname = window.location.hostname.toLowerCase();
  
  // Check for specific site handlers
  for (const [site, handlerPath] of Object.entries(handlers)) {
    if (site !== 'standard' && hostname.includes(site)) {
      return { name: `${site.replace('.com', '')}Handler`, path: handlerPath };
    }
  }
  
  // Default to standard handler
  return { name: 'standard', path: handlers.standard };
}

// Load and initialize the appropriate handler
async function loadHandler() {
  try {
    const handler = getHandler();
    const script = document.createElement('script');
    script.src = browser.runtime.getURL(handler.path);
    
    return new Promise((resolve) => {
      script.onload = () => {
        document.head.removeChild(script);
        if (typeof window.initVolumeControl === 'function') {
          window.initVolumeControl();
        }
        
        // Give a small delay for handlerName to be set, then notify background
        setTimeout(() => {
          if (typeof browser !== 'undefined' && browser.runtime) {
            const handlerNameToSend = window.handlerName || handler.name;
            browser.runtime.sendMessage({ 
              action: 'setHandlerName', 
              handlerName: handlerNameToSend
            }).catch(() => {});
          }
        }, 100);
        
        resolve();
      };
      script.onerror = (error) => {
        console.error('ModuleLoader: Failed to load handler script:', handler.path, error);
        // Fallback to standard handler if specific handler fails
        if (handler.name !== 'standard') {
          console.warn(`Failed to load ${handler.name} handler, falling back to standard`);
          loadStandardHandler().then(resolve);
        } else {
          resolve();
        }
      };
      document.head.appendChild(script);
    });
  } catch (error) {
    console.warn('Handler loading failed:', error);
  }
}

// Fallback function to load standard handler
async function loadStandardHandler() {
  try {
    const script = document.createElement('script');
    script.src = browser.runtime.getURL(handlers.standard);
    
    return new Promise((resolve) => {
      script.onload = () => {
        document.head.removeChild(script);
        if (typeof window.initVolumeControl === 'function') {
          window.initVolumeControl();
        }
        
        // Notify background script about fallback to standard handler
        setTimeout(() => {
          if (typeof browser !== 'undefined' && browser.runtime) {
            const handlerNameToSend = window.handlerName || 'standardHandler';
            browser.runtime.sendMessage({ 
              action: 'setHandlerName', 
              handlerName: handlerNameToSend
            }).catch(() => {});
          }
        }, 100);
        
        resolve();
      };
      script.onerror = resolve;
      document.head.appendChild(script);
    });
  } catch (error) {
    console.warn('Standard handler loading failed:', error);
  }
}

// Initialize when ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadHandler);
} else {
  loadHandler();
}
