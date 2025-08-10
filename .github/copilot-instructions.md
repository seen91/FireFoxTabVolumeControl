# GitHub Copilot Instructions for Firefox Tab Volume Control

This document provides comprehensive guidance for GitHub Copilot when assisting with the Firefox Tab Volume Control extension.

## Project Overview

Firefox Tab Volume Control is a browser extension that enables users to control volume of individual browser tabs from 0% to 500%

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
   - Dont create new markdown files unless explicitly requested

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