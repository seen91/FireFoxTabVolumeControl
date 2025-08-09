/**
 * Firefox Tab Volume Control - Popup Script
 * Manages the popup interface for controlling tab volumes
 */

// Configuration constants
const CONFIG = {
  VOLUMES: { MIN: 0, MAX: 500, DEFAULT: 100, PRESETS: [0, 100, 200, 500] },
  TIMING: { MASTER_VOLUME_DELAY: 1000, REFRESH_DELAY: 500 },
  VOLUME_THRESHOLDS: { LOW: 50, HIGH: 150 },
  UI: { DEFAULT_FAVICON: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="%23ccc"/></svg>' },
  CLASSES: { VOLUME_NORMAL: 'volume-normal', VOLUME_LOW: 'volume-low', VOLUME_HIGH: 'volume-high', VOLUME_MUTED: 'volume-muted' }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const popupController = new PopupController();
  popupController.init();
});
