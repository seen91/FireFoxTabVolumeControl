# GitHub Copilot Instructions for Firefox Tab Volume Control

This document provides comprehensive guidance for GitHub Copilot when assisting with the Firefox Tab Volume Control extension.

## Project Overview

Firefox Tab Volume Control is a browser extension that enables users to control volume of individual browser tabs from 0% to 500%

## Architecture

### Key Components:

1. **Content Scripts**: 
   - `content.js` - Main content script with core audio manipulation logic
   - `site-handlers/*.js` - Site-specific implementations, example standard-handler.js

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

## Common Patterns

1. **Audio Element Detection**:
   - Use MutationObserver to track DOM changes
   - Hook original methods (createElement, Audio constructor)
   - Monitor "play" events at document level
   - Use site-specific selectors when necessary

2. **Volume Control**:
   - Apply volume using GainNode for amplification (>100%)
   - Use direct volume property for reduction (≤100%)
   - Implement site-specific volume control when needed
   - Handle both standard and custom media elements

3. **Message Handling**:
   - Standard action types:
     - `"setVolume"` - Change volume for a tab
     - `"getVolume"` - Retrieve current volume
     - `"checkForAudio"` - Detect audio capabilities
     - `"notifyAudio"` - Report that a tab has audio
     - `"volumeChanged"` - Notify about volume change
     - `"getTabAudioStatus"` - Get audio status for all tabs
     - `"saveDomainVolume"` - Save volume settings per domain

4. **Error Handling**:
   - Graceful fallbacks when APIs aren't available
   - Comprehensive try/catch blocks
   - Recovery mechanisms for edge cases
   - Informative logging for debugging

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

## Common Implementation Tasks

When extending the extension:

1. **Adding Support for a New Site**:
   ```javascript
   // 1. Create a new handler file in site-handlers/
   // example: site-handlers/spotify-handler.js
   
   // 2. Update module-loader.js to include the new site
   const MODULES = {
     // existing modules...
     spotify: {
       pattern: /spotify\.com/,
       name: 'Spotify',
       path: 'site-handlers/spotify-handler.js'
     },
   };
   
   // 3. Implement site-specific functions in the handler:
   function initSpotifyVolumeControl() {
     // Spotify-specific initialization
   }
   
   function setSpotifyVolume(volumeLevel) {
     // Spotify-specific volume control
   }
   ```

2. **Fixing Audio Detection Issues**:
   ```javascript
   // Improve detection for specific site elements
   function findCustomAudioElements() {
     // Find elements by site-specific selectors
     const customPlayers = document.querySelectorAll('.site-player, .audio-container');
     
     customPlayers.forEach(player => {
       // Look for audio/video elements or custom controls
       const mediaElements = player.querySelectorAll('audio, video');
       mediaElements.forEach(handleMediaElement);
       
       // Check for custom controls
       if (player.querySelector('.volume-slider')) {
         // Handle custom controls
       }
     });
   }
   ```

3. **Enhancing Message Handling**:
   ```javascript
   // Add a new message action
   browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
     // Existing handlers...
     
     if (message.action === "newCustomAction") {
       // Handle the new action
       const result = performCustomAction(message.params);
       sendResponse({ success: true, data: result });
       return true; // Indicates async response
     }
   });
   ```

## Resources

- [Web Audio API Documentation](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [Firefox WebExtensions API](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions)
- [Firefox Add-on Policies](https://extensionworkshop.com/documentation/publish/add-on-policies/)
- [MutationObserver API](https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver)
- [Browser Storage API](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage)