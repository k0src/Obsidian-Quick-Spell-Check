# Quick Spell Check

An Obsidian plugin for checking spelling and accepting suggestions using keyboard shortcuts, without needing to move your mouse.

<p align="center">
  <img src="/assets/screenshot.png" alt="screenshot" width="400" />
</p>

Realistically, it's not as accurate as the native Obsidian spell-check, but it's much faster, and works ~90% of the time.

## Features

-   **Accept top suggestion**: Automatically replaces the nearest misspelled word on the current line with the top spelling suggestion
-   **Open spelling menu**: Opens a menu with spelling suggestions for the nearest misspelled word. Press the hotkey again to cycle through other misspelled words on the line
-   **Custom dictionary**: Add words to a custom dictionary through settings or directly from the spelling menu

## Installation

### Manual Installation

1. Download the latest release from the [Releases page](https://github.com/k0src/obsidian-quick-spell-check/releases)
2. Extract the zip file to your vault's plugins folder: `YourVault/.obsidian/plugins/quick-spell-check/`
3. Reload Obsidian
4. Enable "Quick Spell Check" in Settings > Community plugins

The English dictionary is bundled by default. Additional languages can be downloaded from the plugin settings.

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

Dictionaries are downloaded from [wooorm/dictionaries](https://github.com/wooorm/dictionaries").

## License

[LICENSE](LICENSE)
