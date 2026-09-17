/**
 * Configuration constants for the popup UI.
 *
 * VOLUMES.DEFAULT is a cross-context invariant: it must match
 * TabManager.DEFAULT_VOLUME (src/background/tabManager.js) and
 * DEFAULT_VOLUME (src/content/modules/constants.js).
 */
export const CONFIG = {
  VOLUMES: { MIN: 0, MAX: 500, DEFAULT: 100, PRESETS: [0, 50, 100, 200, 500] },
  VOLUME_THRESHOLDS: { LOW: 50, HIGH: 150 },
  UI: { DEFAULT_FAVICON: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="%23ccc"/></svg>' },
  CLASSES: { VOLUME_NORMAL: 'volume-normal', VOLUME_LOW: 'volume-low', VOLUME_HIGH: 'volume-high', VOLUME_MUTED: 'volume-muted' }
};

/**
 * Why a tab probably cannot be amplified, keyed by the reason codes the
 * content script reports (see AudioManager.amplificationBlockReason). Shown
 * as a warning only: the full range stays available so the user can try
 * anyway in case the detection is wrong.
 */
export const AMPLIFICATION_LIMITS = {
  'page-audio': 'This site processes its audio through the Web Audio API itself. Firefox lets only one party do that per media element, so the extension can lower the volume but not boost it.',
  'detached': "This site's player keeps its audio element outside the page, where the extension cannot route it for amplification.",
  'cross-origin': 'The media is served from another domain without CORS headers, so Firefox does not allow the extension to process its audio.',
  'rejected': 'Firefox refused to route this media through the Web Audio API.'
};

export const AMPLIFICATION_OVERRIDE_HINT =
  'Values above 100% are still applied in case this detection is wrong.';

/**
 * Format a volume percentage as a compact preset label.
 * Expressed as a multiplier: "0x", "0.5x", "1x", "2x", "5x".
 * @param {number} volume - Volume percentage
 * @returns {string} Button label
 */
export function formatPresetLabel(volume) {
  return `${volume / 100}x`;
}

