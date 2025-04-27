# Firefox Tab Volume Control - Refactored Structure

This directory contains a logically organized structure for the Firefox Tab Volume Control extension.

## Directory Structure

- **background/** - Background service worker files
  - `background.js` - Main background script
  - `notification-manager.js` - Handles notifications to UI
  - `state-manager.js` - State management functions
  - `tab-audio-detector.js` - Detects audio in tabs
  - `tab-manager.js` - Manages tab state and operations

- **core/** - Core audio functionality
  - `audio-context-manager.js` - Manages Web Audio API contexts
  - `content.js` - Main content script injected into pages
  - `media-element-manager.js` - Manages HTML media elements
  - `volume-control.js` - Volume control functions
  - `volume-controller.js` - Higher-level volume control logic

- **site-handlers/** - Site-specific implementations
  - `9gag-handler.js` - Handler for 9GAG site
  - `reddit-handler.js` - Handler for Reddit
  - `standard-handler.js` - Default handler for most sites
  - `youtube-handler.js` - Handler for YouTube

- **ui/** - User interface components
  - `popup.html` - Main extension popup
  - `popup.js` - Popup functionality
  - `popup.css` - Popup styling (included inline in HTML)
  - `ui-manager.js` - Manages UI creation and updates

- **utils/** - Utility functions and shared services
  - `event-manager.js` - Event handling and coordination
  - `messaging-manager.js` - Communication between contexts
  - `module-loader.js` - Dynamic loading of site-specific modules

- **icons/** - Extension icons in various sizes

## Module Dependencies

```
background.js
├── state-manager.js
├── tab-audio-detector.js
└── notification-manager.js

content.js
├── audio-context-manager.js
├── media-element-manager.js
├── volume-control.js
└── messaging-manager.js

popup.js
├── ui-manager.js
├── tab-manager.js
├── volume-controller.js
└── event-manager.js
```