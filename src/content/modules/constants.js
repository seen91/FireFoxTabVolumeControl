/**
 * Constants for the Tab Volume Control extension
 */

// Volume configuration
export const VOLUME_MAX = 100;
export const VOLUME_AMPLIFICATION_THRESHOLD = 100;

// Timing configuration  
export const HOSTNAME_CHECK_INTERVAL = 2000;

// Media element selectors for scanning
export const ADDITIONAL_SELECTORS = [
  '[class*="video"]',
  '[class*="player"]',
  '[class*="media"]',
  '[data-testid*="video"]',
  '[data-testid*="media"]',
  '[data-testid*="player"]',
  // Site-specific selectors
  'shreddit-player-2',
  'shreddit-player',
  '[class*="shreddit"]'
];

// Default values
export const DEFAULT_VOLUME = 100;
