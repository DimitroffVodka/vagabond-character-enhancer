# Vagabond Character Enhancer

![Foundry v13](https://img.shields.io/badge/foundry-v13-green?style=for-the-badge)
![System](https://img.shields.io/badge/system-vagabond-blue?style=for-the-badge)
![Version](https://img.shields.io/badge/version-0.4.13-orange?style=for-the-badge)

A character automation module for the **Vagabond RPG** system in Foundry VTT. Auto-detects classes, ancestries, and perks from your character's compendium items and runs the rules for you — class features, magical effects, summons, polymorph, alchemy, and the dozens of edge cases that would otherwise need a sticky note next to the screen.

---

## Headline Features

- **[Class Automation](docs/classes.md)** — All 20 classes automated to varying depth: Barbarian Rage, Bard Virtuoso, Druid Beast Forms, Hunter's Mark, Magus Spell Surge, Pugilist Haymaker, Witch Hex, Wizard Page Master, and more.
- **[Ancestry Traits](docs/ancestries.md)** — Auto-applied traits for all 7 ancestries (Dwarf, Draken, Elf, Goblin, Halfling, Human, Orc) including Draken Breath Attack, Goblin Nimble, Orc Beefy.
- **[Perk Automation](docs/perks.md)** — System AEs and module-driven perks (Spin-to-Win, Treads Lightly, Briar Healer, Bully, Full Swing, Protector, Akimbo Trigger). Tracks all 104 perks.
- **[Spell Automation](docs/spells.md)** — Bless aura, Exalt damage bonus, Imbue (RAW delivery), Polymorph beast forms, Ward (preDamageApply intercept). Tracks all 59 spells.
- **[Companion System](docs/companions.md)** — Unified engine for summons, familiars, raised undead, animal companions, conjured beasts, and hirelings. Companions tab on every PC sheet, save/action routing through the controller.
- **[Polymorph & Beast Form](docs/classes.md#druid)** — 72 modified beasts in a compendium, Beast Form tab on the character sheet, token swap, action rolls. Works for any caster.
- **[Alchemy Cookbook](docs/classes.md#alchemist)** — Crafting UI with search, cost calculation, and craft buttons. Material auto-deducted from inventory. Crafted items work as weapons via the crawler combat strip.
- **[Aura Delivery System](docs/other-automation.md#aura-delivery-system)** — Persistent templates that follow the caster, tick each round on hostiles in range, and fire entry ticks on movement. Works for damage, effect, and buff spells/talents.
- **[Cross-Module Composition](docs/other-automation.md#vagabond-crawler-integration)** — Imbue dice, relic dice (Strike, Bane, Vicious), and silver weakness all stack correctly through the same Roll Damage path.

---

## Requirements

- **Foundry VTT** v13+
- **[Vagabond](https://github.com/mordachai/vagabond)** system v5.0.0+ (v5.3.0+ recommended — Ward, Berserk frighten immunity, and Briar Healer rely on hooks introduced in v5.3.0)

### Optional

- **[Vagabond Crawler](https://github.com/DimitroffVodka/vagabond-crawler)** — Companion module. Adds NPC ability automation, Virtuoso/Step Up integration, relic forge, monster creator, etc.
- **lib-wrapper** — Cleaner method patching (not required)
- **Sequencer + JB2A** — Visual effects for class features, monster attacks, and status conditions (graceful degradation if missing)

---

## Installation

Paste the following manifest URL into Foundry's module installer:

```
https://github.com/DimitroffVodka/vagabond-character-enhancer/releases/latest/download/module.json
```

After installation, enable the module in your world under **Settings → Manage Modules**. Class features, ancestry traits, and perks are auto-detected from the character's compendium items — no per-character configuration needed.

---

## Documentation

- [Classes](docs/classes.md) — All 20 class feature tables, plus deep-dives on Alchemy, Polymorph, and Psychic Talents
- [Ancestries](docs/ancestries.md) — All 7 ancestry trait tables
- [Perks](docs/perks.md) — Currently automated highlights + full reference for all 104 perks
- [Spells](docs/spells.md) — Currently automated spells + full reference for all 59 spells
- [Companion System](docs/companions.md) — Summons, familiars, raised undead, animal companions, hirelings
- [Other Automation](docs/other-automation.md) — Aura delivery, range enforcement, cleave, status rules, cast-time rules, manual rolls
- [Feature FX System](docs/feature-fx-system.md) — Sequencer animation configuration
- [Silver Weakness System](docs/silver-weakness-system.md) — Metal weakness damage details

---

## Status Legend

Used in feature tables across the docs:

| Icon       | Meaning                                                                         |
|------------|---------------------------------------------------------------------------------|
| ✅ Module   | Fully automated with hooks, Active Effects, and/or monkey-patches               |
| ✅ System   | Handled natively by the Vagabond system — no module code needed                 |
| ✅ AE       | Implemented via managed Active Effects applied to the actor                     |
| 📝 Flavor  | Registered for tracking but requires no automation (player decisions, RP rules) |
| 🔲 Todo    | Planned but not yet implemented                                                 |
| 🔲 Partial | Partially implemented — some aspects still need work                            |

---

## Authors

- **DimitroffVodka**

---

*This module is an independent community project for the Vagabond RPG system and is not affiliated with Land of the Blind, LLC.*
