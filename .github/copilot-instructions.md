# GitHub Copilot Instructions for Firefox Tab Volume Control

This document provides comprehensive guidance for GitHub Copilot when assisting with the Firefox Tab Volume Control extension.

## Project Overview

Firefox Tab Volume Control is a browser extension that enables users to control volume of individual browser tabs from 0% to 500%

## Architecture

### Key Components:

1. **Content Scripts**: 
   - `content.js` - Main content script with core audio manipulation logic
   - `siteHandlers/*.js` - Site-specific implementations, example standard-handler.js

2. **Background Service Worker**:
   - `background.js` - Manages tab state, volume settings, and cross-tab coordination
   - Tracks which tabs have audio capabilities
   - Maintains volume settings per tab and per domain

3. **User Interface**:
   - `popup.html`, `popup.js` - Extension popup with multi-tab controls
   - `popup.css` - Styling for the interface (included inline in HTML)
   - Uses color-coded visual indicators for volume states

4. **Module Loading**:
   - `module-loader.js` - Intelligently loads appropriate site handlers
   - Uses pattern matching to identify sites
   - Implements fallback mechanisms if specific handlers fail

## Technical Approach

The extension uses the Web Audio API to modify audio output:

- **Volume Reduction (0-100%)**:
  - Uses standard HTML5 audio `volume` property for most sites
  - Falls back gracefully if Web Audio API isn't available

- **Volume Amplification (100-500%)**:
  - Creates an `AudioContext` with a `GainNode` for amplification
  - Connects media elements to the gain node
  - Sets gain value for amplification (1.0-5.0)

- **Audio Detection**:
  - Proactively identifies tabs with audio capabilities
  - Monitors DOM for dynamically added media elements
  - Special handling for sites that load media in non-standard ways

### Site-Specific Handlers

Site handlers implement specialized logic for websites with unique audio implementations.

## State Management

1. **Tab Volume State**:
   - Maintain volume settings per tab ID
   - Track which tabs have audio capabilities
   - Persist domain-specific settings
   - Handle tab creation, updates, and removal events

2. **User Interface State**:
   - Dynamically generate UI for tabs with audio
   - Auto-expand controls when ≤5 tabs are present
   - Update visual indicators based on volume levels
   - Provide consistent feedback for user actions

## Coding Guidelines

1. **Code Organization**:
   - Use modular structure with clear separation of concerns
   - Group related functions together
   - Keep files focused on specific responsibilities
   - Use constants for magic numbers and repeated values

2. **Naming and Documentation**:
   - Use descriptive function and variable names
   - Add JSDoc comments for all functions
   - Include parameter and return type documentation
   - Explain complex logic with inline comments

3. **Error Handling**:
   - Use try/catch blocks around risky operations
   - Log meaningful error messages
   - Implement fallback mechanisms
   - Never let errors bubble up to the user interface

4. **Performance Considerations**:
   - Throttle/debounce expensive operations
   - Minimize DOM manipulation
   - Use efficient selectors
   - Avoid memory leaks (clear intervals, remove listeners)

## Firefox Extension-Specific Considerations

1. **Browser API Usage**:
   - Use `browser.*` APIs consistently (not `chrome.*`)
   - Apply appropriate permissions in manifest.json
   - Handle asynchronous API calls properly
   - Be aware of Firefox's sandboxing limitations

2. **Content Security**:
   - Follow Firefox's security policies
   - Use web_accessible_resources for required files
   - Avoid inline script execution in injected content
   - Follow Mozilla Add-on store guidelines

3. **Manifest Configuration**:
   - Use manifest_version 3 format
   - Include only necessary permissions
   - Specify correct content script matches
   - Configure appropriate run_at timing

## Resources

- [Web Audio API Documentation](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [Firefox WebExtensions API](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions)
- [Firefox Add-on Policies](https://extensionworkshop.com/documentation/publish/add-on-policies/)
- [MutationObserver API](https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver)
- [Browser Storage API](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage)