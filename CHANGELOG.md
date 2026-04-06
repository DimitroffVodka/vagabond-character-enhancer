# Changelog

## v0.2.0

### New Features — Monk Class
- **Martial Arts (L1):** Full automation — 1 target applies Keen (finesseCritBonus -1 via temp AE), 2 targets applies Cleave (half damage to second target). Damage die escalates per Finesse attack each round (d4→d6→d8→d10→d12, capped). Forces auto-roll damage to ensure escalation applies.
- **Fleet of Foot (L1):** System-handled via class item AE (reflexCritBonus scaling). Flag detection only.
- **Fluid Motion (L2):** Flavor (walk on walls/water).
- **Impetus (L4):** Passed Reflex saves now remove the **two** highest damage dice instead of one. Patched `_removeHighestDie` to support removing N dice.
- **Flurry of Blows (L6):** Flavor (player-tracked action economy).
- **Empowered Strikes (L8):** Managed AE — `finesseDamageDieSizeBonus +2` (d4→d6).

### New Features — Treads Lightly Perk
- **Region Movement Cost Bypass:** Characters with the Treads Lightly perk (Monks, Dancers, or anyone who takes it) ignore walk-type `modifyMovementCost` region behaviors. Patches both Foundry's `_getTerrainEffects` and Vagabond Crawler's `_getTerrainDifficulty`.

### New Features — Evasive / Impetus (Two Dice on Dodge)
- **Dancer Evasive (L2):** Now posts a chat reminder AND removes 2 highest dice on passed Reflex saves (was TODO for the dice removal).
- **Monk Impetus (L4):** Same mechanic — removes 2 highest dice on passed Reflex saves.
- **Implementation:** Patched `VagabondDamageHelper._removeHighestDie` to accept a configurable count. `handleSaveRoll` wrapper sets count to 2 when target has `dancer_evasive` or `monk_impetus`.

### Bug Fixes
- **Save Card Parsing:** Fixed Impetus, Prowess, and Evasive chat reminder hooks to parse `header-title` instead of nonexistent `roll-skill-label` in save chat cards. All three were silently failing to detect saves.
- **Pugilist Prowess:** Now correctly triggers on passed Endure (Block) saves.

## v0.1.9

### Bug Fixes
- **Focusing Status Triple-Apply:** Fixed race condition where focusing a spell created 3 "Focusing" Active Effects instead of 1. The module's `_syncFocusingStatus` now checks embedded effects directly (not the laggy derived `statuses` Set) and only runs when feature focus is active — the system handles spell-only focus.
- **Bless Aura Duplicate on Allies:** Fixed `_setBlessAuraMode` being called twice (direct call + createChatMessage hook) causing a race condition that applied duplicate Bless buff AEs to allies. Removed the redundant direct call.
- **Bless Aura Cleanup:** `_removeAllBuffs` now uses `filter()` instead of `find()` to remove all matching buff AEs, not just the first — prevents stale effects lingering after aura deactivation.
- **Bless Player Console Errors:** Added permission check before attempting to inject Bless mode buttons into chat messages, preventing "lacks permission to update ChatMessage" errors on player clients.
- **Aura Radius Always 10ft:** Fixed regex that parsed aura radius from chat cards. The system outputs `"Aura 15' radius"` but the regex expected digits at the start of the attribute value, so it always fell back to 10ft.
- **Imbue Double Armor:** Imbue spell damage is now combined into the weapon's damage formula (same pattern as Exalt/Silver weakness) instead of rolling as a separate chat card. Armor is applied once to the combined total instead of twice. Forces auto-roll when imbued to ensure the patched `rollDamage` path is used.

## v0.1.8

### Major Fixes
- **Silver/Metal Weakness Overhaul:** Completely reworked how silvered weapon bonus damage works across all code paths (character sheet, Crawler, auto-roll, manual button). Fixed system gap where typeless weapons never triggered metal weakness.
  - Extra weakness die now visible in the damage roll (not silently added at apply time)
  - `_weaknessPreRolled` flag prevents double-counting between roll-time and apply-time
  - Armor bypass for silvered weapons on typeless damage in `calculateFinalDamage`
  - Target stashing in `rollAttack` ensures correct target detection regardless of timing
  - Works with both "Roll Damage With Check" ON and OFF settings
- **Bless Aura — GM Confirmation Flow:** Player choices (Allies/Weapons mode) now route through GM confirmation for permission-safe application. Aura mode stored in `activeAura` flag for persistent range tracking.
- **Bless Aura — Self-Buff:** Caster now receives their own aura buff (previously excluded).
- **Bless Aura — Weapon Restoration on Leave:** Silvered weapons properly restored when tokens leave aura range or aura deactivates.
- **Aura Expiry Without Focus:** Unfocused auras now expire after 1 round (checked on combat round change).
- **Focusing Status Race Condition:** No longer tries to remove Focusing status ourselves — let the system handle removal to avoid "does not exist" errors.
- **Sequencer FX Fix:** `endEffects` uses string name instead of regex (Sequencer requires string).
- **Chat Message Permission:** Bless button injection wrapped in try/catch for player permission errors.

### Documentation
- **`docs/silver-weakness-system.md`**: Comprehensive technical documentation of all silver weakness code paths, system gaps, module fixes, and gotchas. Essential reading for future development.

## v0.1.7

### New Features — Witch Class
- **Hex (L1):** Mark targets as Hexed via button on spell chat cards. Tracks hex slots (max = ceil(level/2)), auto-removes oldest when over capacity. "Hexed (WitchName)" AE visible on target.
- **Things Betwixt (L4):** Once per Scene, become invisible until next Turn. Requires Focus. Automatically removed on round change. API: `game.vagabondCharacterEnhancer.betwixt(actor)`.
- **Widdershins (L8):** Hexed targets are Weak to the witch's damage — armor bypassed in calculateFinalDamage. Does not ignore Immunity.

### New Features — Bless Spell
- **Bless Mode Selection:** After casting Bless, chat card shows "Bless Allies (+d4 Saves)" and "Bless Weapons (Silvered)" buttons.
- **Bless Allies — Actual d4 per Save:** Rolls a real 1d4 and adds it to the save roll formula (visible as a die, like Favor's d6). Patches the roll builder temporarily per save.
- **Bless Weapons — Silvered:** Sets equipped weapon metal to "silver" for the duration. Restores original metal when Bless expires.
- **Duration Tracking:** Bless AEs auto-expire on round change unless the caster is Focusing on Bless. Aura Bless managed by AuraManager lifecycle.
- **Silver Weakness Fix:** The system skips metal weakness checks for typeless ("-") damage. Module now handles this: silvered weapons bypass armor on silver-weak targets, and the extra weakness die is added to the visible damage roll formula.

### Bug Fixes
- Fixed aura template duplication (4x templates on cast) — added message ID de-duplication guard.
- Fixed stuck Sequencer aura FX — deactivate now stops effects by both name and token source, plus safety net regex cleanup.
- Fixed `_checkFocusDrop` not awaited, causing incomplete aura cleanup.
- Bless aura AEs now include `blessAE` flag for d4 save detection.

### API
- `game.vagabondCharacterEnhancer.hex(actor, targetId, targetName, targetImg)` — Apply hex
- `game.vagabondCharacterEnhancer.unhex(actor, targetId)` — Remove hex
- `game.vagabondCharacterEnhancer.betwixt(actor)` — Use Things Betwixt

## v0.1.6

### New Features
- **Second Nature (L4):** When conjuring, choose between Focus (1 Mana/round) or Cd4 duration (no focus needed). Countdown die rolled each round — summon expires when it shrinks past d4.
- **Avatar Emergence (L6):** Once per Shift, conjure a Summon without spending Mana. Dialog offers free conjure or pay mana. Resets when mana is restored to max (on Rest).
- **Guardian Force (L8):** If summoner drops to 0 HP with a Summon conjured, the summon persists on a Cd4 countdown. When the countdown expires, the summoner is revived at 1 HP and gains 1 Fatigue.
- **Improved Summon Tab:** Active summon panel now shows full NPC stat block — portrait, HD/Size/Type tags, HP bar, armor overlay, speed group, movement types, senses, immunities, weaknesses, clickable actions, and abilities. Matches the Druid Beast Form panel styling.
- **Custom Compendium Packs:** Module now ships with 3 new compendiums:
  - **VCE: Custom Classes** — Dragoon, Summoner, Samurai, Jester, Psychic, Monk
  - **VCE: Custom Perks** — Summoner (Conjurer) perk
  - **VCE: Custom Ancestries** — Harpy, Fiend, Mimic, Satyr, Varmi, Centaur, Golem, Changeling, Pollywog, Rook, Pixie, Lepus

### Bug Fixes
- Fixed Soulbonder armor bonus using wrong Active Effect key (`system.bonuses.armor` → `system.armorBonus`).

## v0.1.5

### New Features
- **Summoner Class Support:** Core automation for the Summoner class from the "From the Archive" supplement.
  - **Creature Codex:** Right-click creatures in the Summon tab to add/remove from your personal Codex. Only Codex creatures can be conjured.
  - **Conjure Flow:** Click a Codex creature to conjure it — deducts Mana (= creature's HD), places a token on the canvas, and acquires Focus.
  - **Summon Actions:** Click summon actions in the Summon tab to roll them using the summoner's Mysticism check. Uses the system's native chat card styling with proper d20 roll, damage, and Apply Direct/Save buttons.
  - **Banish:** Banish button on the Summon tab, or auto-banish on 0 HP, focus drop, or out of mana. Tokens cleaned up automatically.
  - **Soulbonder (L2):** Summoner gains the summon's Armor and Immunities as managed Active Effects while the summon is conjured.
  - **Combat Mana Drain:** 1 Mana automatically drained per round while maintaining Focus on a summon.
  - **Crawler Integration:** Summon actions appear as a new tab on the Vagabond Crawler strip with the creature's name. Includes Banish option.
  - **Ultimate Weapon (L10):** Summon HD cap increases by +5.
- **Feature Detection:** Summoner class features (Arcanum, Creature Codex, Soulbonder, Second Nature, Avatar Emergence, Guardian Force, Ultimate Weapon) auto-detected from compendium data.

### API
- `game.vagabondCharacterEnhancer.conjure(actor)` — Open conjure dialog
- `game.vagabondCharacterEnhancer.banish(actor)` — Banish active summon
- `game.vagabondCharacterEnhancer.getSummonData(actor)` — Crawler integration data

## v0.1.4

### New Features
- **Draconic Resilience (Draken ancestry):** Choose Acid, Cold, Fire, or Shock — take half damage from that type (applied after saves, before armor). Visible as an Active Effect on the character sheet with chat notifications on trigger. Re-pick via `game.vagabondCharacterEnhancer.setDraconicResilience(actor)`.
- **Imbue Spell Delivery:** Full automation of the Imbue delivery type. Casting a spell with Imbue skips d20/damage rolls, deducts mana, and opens a weapon selection dialog. On the next hit, imbued spell damage is rolled separately with the spell's damage type and its own Apply Direct button. Consumed on hit or miss. Works from both the character sheet and the Vagabond Crawler strip.
- **Exalt Per-Die Damage Bonus:** Exalt now correctly adds +1 per damage die (+2 vs Undead/Hellspawn) to weapon damage rolls. Triggers when focusing on Exalt (any delivery) or when receiving the Exalt aura buff. Will save bonus remains as an Active Effect.
- **Light Focus — Token Light Emission:** When the Light spell is focused, the caster's token emits 30' bright light with a warm golden torch animation. Light settings are saved and restored when focus drops. Persists across scene changes.

### Bug Fixes
- Fixed duplicate "Focusing" status effect when casting with Focus via the Vagabond Crawler.

## v0.1.3
- Brawl intent system (Grapple/Shove) for Brawl and Shield weapons
- Spell Surge cast-only filter fix
- Luminary postScan hook and icon fixes
- Luminary healing feature rewrites (Radiant Healer, Overheal, Ever-Cure)
