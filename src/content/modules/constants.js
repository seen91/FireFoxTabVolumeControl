/**
 * Constants for the Tab Volume Control extension
 */

// Volume configuration - N (native) × AM (amplitude modification) = Output
export const VOLUME_MAX = 100; // Base volume percentage for calculations
export const VOLUME_AMPLIFICATION_THRESHOLD = 100; // Threshold for amplification detection
export const VOLUME_NATIVE_MAX = 1.0; // Native HTML5 volume (N in formula)

// Timing configuration  
export const HOSTNAME_CHECK_INTERVAL = 2000;

// Media element selectors for scanning
export const ADDITIONAL_SELECTORS = [
  '[class*="video"]',
  '[class*="player"]',
  '[class*="media"]',
  '[data-testid*="video"]',
  '[data-testid*="media"]',
  '[data-testid*="player"]'
];

// Default values
export const DEFAULT_VOLUME = 100;
