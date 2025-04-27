# Firefox Tab Volume Control

A Firefox add-on that lets you control the volume of individual browser tabs from 0% to 500%.

## Features

- **Individual Tab Control**: Adjust volume separately for each tab playing audio
- **Volume Amplification**: Boost quiet audio up to 500% of the original volume
- **Multi-Tab Interface**: See and control all audio tabs from a single popup
- **Master Volume Control**: Apply the same volume level to all tabs at once
- **Volume Presets**: Quick buttons for common volume levels (Mute, 100%, 200%, 500%)
- **Special Site Support**: Enhanced compatibility with YouTube and other media sites
- **Auto-Expanded Controls**: Automatically expands controls when 5 or fewer tabs have audio

## Why I Created This

I originally built this add-on for my personal use because I often found myself needing to:

- Boost the volume of quiet videos beyond what browsers normally allow
- Control multiple audio sources independently without changing my system volume
- Quickly mute specific tabs while keeping others playing

I was also tired of looking for shady add-ons with overreaching permissions that asked for unnecessary access to my browsing data. I wanted something simple, focused, and trustworthy that only did what it claimed to do.

After finding it useful myself, I decided to share it with the Firefox community in case others might benefit from it too.

## Installation

### From Firefox Add-ons
[Firefox Add-ons page](https://addons.mozilla.org/en-US/firefox/addon/tab-volume-control/)

### Manual Installation
1. Download the latest release from [GitHub](https://github.com/seen91/FireFoxTabVolumeControl/releases)
2. In Firefox, go to `about:debugging` → This Firefox → Load Temporary Add-on
3. Select any file from the downloaded extension folder

## Usage

1. Click the volume icon in the toolbar to open the control panel
2. Each tab with audio will be listed with its own volume control
3. Use the slider or preset buttons to adjust volume for each tab
4. Use the master volume control at the top to adjust all tabs at once
5. Changes apply immediately as you adjust the volume

## Project Structure

The extension has been refactored for better organization:

- **src/background/** - Background service worker files for tab monitoring and state management
- **src/core/** - Core audio functionality and content scripts
- **src/site-handlers/** - Site-specific implementations (YouTube, Reddit, etc.)
- **src/ui/** - Popup interface and UI management
- **src/utils/** - Utility functions and shared services
- **src/icons/** - Extension icons

See [src/README.md](src/README.md) for a detailed breakdown of the project structure.

## Technical Details

The add-on uses the Web Audio API to modify audio output:
- Values below 100% reduce volume normally
- Values above 100% amplify the audio (similar to a preamplifier)
- Maximum amplification is 500%, which is usually sufficient for most quiet media

### How it Works

1. **Audio Detection**: The extension detects tabs playing audio using Firefox's built-in audio indicators and additional detection methods.

2. **Volume Control**:
   - For standard volume reduction (0-100%): Uses the native HTML5 media element volume property.
   - For volume amplification (100-500%): Creates an AudioContext with a GainNode to boost the audio signal.

3. **Site-Specific Handling**: Custom handlers for sites like YouTube and Reddit which implement audio in non-standard ways.

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.

## Contributing

Feel free to fork the repository, make changes, and submit pull requests. I welcome any improvements or bug fixes!

## Acknowledgments

- The Firefox WebExtensions API
- Web Audio API
