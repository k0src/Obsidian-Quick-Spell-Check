# Select Spell Check

An Obsidian plugin for checking spelling and accepting suggestions using keyboard shortcuts, without needing to use the mouse.

## Features

-   **Accept top suggestion**: Automatically replaces the nearest misspelled word on the current line with the top spelling suggestion
-   **Open spelling menu**: Opens a menu with spelling suggestions for the nearest misspelled word. Press the hotkey again to cycle through other misspelled words on the line
-   **Custom dictionary**: Add words to a custom dictionary through settings or directly from the spelling menu

## Installation

### Manual Installation

1. Download the latest release from the [Releases page](https://github.com/yourusername/select-spell-check/releases)
2. Extract the zip file to your vault's plugins folder: `VaultFolder/.obsidian/plugins/select-spell-check/`
3. The folder should contain:
    - `main.js`
    - `manifest.json`
    - `index.aff`
    - `index.dic`
4. Reload Obsidian
5. Enable "Select Spell Check" in Settings > Community plugins

### From Community Plugins

_Coming soon_

## Usage

### Setup

1. Go to Settings > Hotkeys
2. Search for "Select Spell Check"
3. Assign hotkeys to:
    - "Accept top spelling suggestion"
    - "Open spelling menu"

## Credits

Spell checking powered by [nspell](https://github.com/wooorm/nspell).

## License

[LICENSE](LICENSE)
