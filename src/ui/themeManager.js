/**
 * Theme Manager for Firefox Tab Volume Control
 * Handles automatic theme detection and application based on Firefox theme and system preferences
 */

class ThemeManager {
  constructor() {
    this.currentTheme = 'light';
    this.listeners = [];
    this.initialized = false;
  }

  /**
   * Initialize the theme manager
   * @returns {Promise<void>}
   */
  async init() {
    if (this.initialized) return;
    
    try {
      await this.detectAndApplyTheme();
      this.setupThemeListeners();
      this.initialized = true;
    } catch (error) {
      console.warn('Theme manager initialization failed:', error);
      this.applyTheme('light'); // Fallback to light theme
    }
  }

  /**
   * Detects and applies the appropriate theme based on the user's Firefox theme
   * @returns {Promise<void>}
   */
  async detectAndApplyTheme() {
    try {
      let isDarkTheme = false;

      // Check if theme API is available
      if (browser.theme && browser.theme.getCurrent) {
        const themeInfo = await browser.theme.getCurrent();
        isDarkTheme = this.detectDarkTheme(themeInfo);
      } else {
        // Fallback to system preference if theme API is not available
        isDarkTheme = window.matchMedia('(prefers-color-scheme: dark)').matches;
      }

      const theme = isDarkTheme ? 'dark' : 'light';
      this.applyTheme(theme);
    } catch (error) {
      console.warn('Theme detection failed, using light theme as default:', error);
      this.applyTheme('light');
    }
  }

  /**
   * Determines if the current theme is dark based on theme colors
   * @param {Object} themeInfo - The theme information from browser.theme.getCurrent()
   * @returns {boolean} True if the theme appears to be dark
   */
  detectDarkTheme(themeInfo) {
    // If no theme info or colors, check system preference
    if (!themeInfo || !themeInfo.colors) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    const colors = themeInfo.colors;

    // Check common dark theme indicators in order of reliability
    const colorChecks = [
      colors.toolbar,
      colors.frame,
      colors.popup,
      colors.sidebar
    ];

    for (const color of colorChecks) {
      if (color) {
        const luminance = this.getColorLuminance(color);
        if (luminance < 0.3) return true;
        if (luminance > 0.7) return false;
      }
    }

    // Fallback to system preference if no conclusive color data
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  /**
   * Calculates the relative luminance of a color
   * @param {string} color - Color in hex, rgb, rgba, or named format
   * @returns {number} Luminance value between 0 (darkest) and 1 (lightest)
   */
  getColorLuminance(color) {
    const rgb = this.parseColor(color);
    if (!rgb) return 0.5; // Default to middle luminance if parsing fails

    // Calculate relative luminance using the standard formula (WCAG)
    const [r, g, b] = rgb.map(c => {
      c = c / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });

    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  /**
   * Parses a color string into RGB values
   * @param {string} color - Color string in various formats
   * @returns {Array<number>|null} RGB values [r, g, b] or null if parsing fails
   */
  parseColor(color) {
    if (!color) return null;

    // Handle hex colors
    if (color.startsWith('#')) {
      const hex = color.slice(1);
      if (hex.length === 3) {
        return [
          parseInt(hex[0] + hex[0], 16),
          parseInt(hex[1] + hex[1], 16),
          parseInt(hex[2] + hex[2], 16)
        ];
      } else if (hex.length === 6) {
        return [
          parseInt(hex.slice(0, 2), 16),
          parseInt(hex.slice(2, 4), 16),
          parseInt(hex.slice(4, 6), 16)
        ];
      }
    }

    // Handle rgb/rgba colors
    const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (rgbMatch) {
      return [
        parseInt(rgbMatch[1]),
        parseInt(rgbMatch[2]),
        parseInt(rgbMatch[3])
      ];
    }

    // For named colors or other formats, create a temporary element to get computed style
    try {
      const div = document.createElement('div');
      div.style.color = color;
      div.style.display = 'none';
      document.body.appendChild(div);
      const computedColor = window.getComputedStyle(div).color;
      document.body.removeChild(div);

      const match = computedColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (match) {
        return [
          parseInt(match[1]),
          parseInt(match[2]),
          parseInt(match[3])
        ];
      }
    } catch (e) {
      // Ignore errors in color parsing
    }

    return null;
  }

  /**
   * Apply the specified theme to the document
   * @param {string} theme - Theme name ('light' or 'dark')
   */
  applyTheme(theme) {
    const previousTheme = this.currentTheme;
    this.currentTheme = theme;

    // Apply theme class to body
    if (theme === 'dark') {
      document.body.classList.add('dark-theme');
    } else {
      document.body.classList.remove('dark-theme');
    }

    // Notify listeners if theme changed
    if (previousTheme !== theme) {
      this.notifyListeners(theme, previousTheme);
    }
  }

  /**
   * Set up listeners for theme changes
   */
  setupThemeListeners() {
    // Listen for Firefox theme changes
    try {
      if (browser.theme && browser.theme.onUpdated) {
        browser.theme.onUpdated.addListener(() => {
          this.detectAndApplyTheme();
        });
      }
    } catch (error) {
      console.warn('Failed to add Firefox theme change listener:', error);
    }

    // Listen for system theme changes as fallback
    try {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => this.detectAndApplyTheme();

      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', handler);
      } else if (mediaQuery.addListener) {
        // Fallback for older browsers
        mediaQuery.addListener(handler);
      }
    } catch (error) {
      console.warn('Failed to add system theme change listener:', error);
    }
  }

  /**
   * Add a listener for theme changes
   * @param {Function} callback - Function called when theme changes (theme, previousTheme) => void
   */
  addThemeChangeListener(callback) {
    if (typeof callback === 'function') {
      this.listeners.push(callback);
    }
  }

  /**
   * Remove a theme change listener
   * @param {Function} callback - The callback function to remove
   */
  removeThemeChangeListener(callback) {
    const index = this.listeners.indexOf(callback);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * Notify all listeners of theme change
   * @param {string} newTheme - The new theme
   * @param {string} previousTheme - The previous theme
   */
  notifyListeners(newTheme, previousTheme) {
    this.listeners.forEach(callback => {
      try {
        callback(newTheme, previousTheme);
      } catch (error) {
        console.warn('Theme change listener error:', error);
      }
    });
  }

  /**
   * Get the current theme
   * @returns {string} Current theme ('light' or 'dark')
   */
  getCurrentTheme() {
    return this.currentTheme;
  }

  /**
   * Check if the current theme is dark
   * @returns {boolean} True if current theme is dark
   */
  isDarkTheme() {
    return this.currentTheme === 'dark';
  }

  /**
   * Manually set the theme (useful for testing)
   * @param {string} theme - Theme to apply ('light' or 'dark')
   */
  setTheme(theme) {
    if (theme === 'light' || theme === 'dark') {
      this.applyTheme(theme);
    }
  }

  /**
   * Toggle between light and dark themes
   */
  toggleTheme() {
    const newTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
    this.setTheme(newTheme);
  }

  /**
   * Clean up resources
   */
  destroy() {
    this.listeners = [];
    this.initialized = false;
  }
}

// Create and export a singleton instance
const themeManager = new ThemeManager();

// For use in popup context
if (typeof window !== 'undefined') {
  window.themeManager = themeManager;
}

// For module usage (if needed in the future)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = themeManager;
}
