# Vagabond Character Enhancer

A Foundry VTT module that automates ancestry traits, class features, and perks for the [Vagabond](https://vagabond.game/) RPG system. Detects class features from compendium data and applies managed Active Effects for gameplay automation.

## Installation

### Method 1: Manifest URL (Recommended)

1. Open Foundry VTT and go to the **Add-on Modules** tab
2. Click **Install Module**
3. Paste the following URL into the **Manifest URL** field at the bottom:

```
https://github.com/DimitroffVodka/vagabond-character-enhancer/releases/latest/download/module.json
```

4. Click **Install**
5. Launch your world and enable the module under **Settings → Manage Modules**

This method will allow Foundry to automatically detect future updates.

### Method 2: Manual Download

1. Go to the [latest release](https://github.com/DimitroffVodka/vagabond-character-enhancer/releases/latest)
2. Download `module.zip`
3. Extract the zip into your Foundry VTT modules folder:
   - **Windows:** `%localappdata%/FoundryVTT/Data/modules/`
   - **macOS:** `~/Library/Application Support/FoundryVTT/Data/modules/`
   - **Linux:** `~/.local/share/FoundryVTT/Data/modules/`
4. Ensure the extracted folder is named `vagabond-character-enhancer`
5. Launch your world and enable the module under **Settings → Manage Modules**

## Compatibility

- **Foundry VTT:** v13+
- **Vagabond System:** v5.0.0+

## Optional Dependencies

- **Vagabond Crawler** — Enables NPC ability automation (Morale, abilities, etc.)

## Features

The module automatically detects class features, ancestry traits, and perks on character sheets and applies automation where possible. Features are categorized as:

- **Module** — Fully automated with hooks, Active Effects, and/or monkey-patches
- **AE** — Implemented via Active Effects applied to the actor
- **Flavor** — Registered for tracking but requires no automation (player decisions)

### Supported Classes

- Alchemist
- Barbarian
- Bard
- Dancer
- Fighter
- Gunslinger
- Luminary
- Ranger

### Other Automation

- Ancestry trait detection and AE application
- Perk detection and AE application
- Alchemy crafting helpers and cookbook
- Countdown dice overlay
- NPC ability automation (with Vagabond Crawler)
