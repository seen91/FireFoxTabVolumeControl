// Simple module loader for site-specific handlers
const handlers = {
  standard: 'src/content/site-handlers/standardHandler.js'
};

// Load and initialize the standard handler
async function loadHandler() {
  try {
    const script = document.createElement('script');
    script.src = browser.runtime.getURL(handlers.standard);
    
    return new Promise((resolve) => {
      script.onload = () => {
        document.head.removeChild(script);
        if (typeof window.initVolumeControl === 'function') {
          window.initVolumeControl();
        }
        resolve();
      };
      script.onerror = resolve; // Continue even if handler fails
      document.head.appendChild(script);
    });
  } catch (error) {
    console.warn('Handler loading failed:', error);
  }
}

// Initialize when ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadHandler);
} else {
  loadHandler();
}
