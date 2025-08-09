/**
 * Constants for the Tab Volume Control extension
 */

// Volume configuration
export const VOLUME_MAX = 100;
export const VOLUME_MIN = 0;
export const VOLUME_AMPLIFICATION_THRESHOLD = 100;
export const VOLUME_NATIVE_MAX = 1.0;

// Timing configuration
export const SCAN_INTERVAL = 5000;
export const INITIAL_SCAN_DELAY = 1000;
export const HOSTNAME_CHECK_INTERVAL = 2000;

// Media element selectors for aggressive scanning
export const ADDITIONAL_SELECTORS = [
  '[class*="video"]',
  '[class*="Video"]', 
  '[class*="player"]',
  '[class*="Player"]',
  '[class*="media"]',
  '[class*="Media"]',
  '[data-testid*="video"]',
  '[data-testid*="media"]',
  '[data-testid*="player"]'
];

// Default values
export const DEFAULT_VOLUME = 100;
