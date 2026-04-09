# Changelog

## v0.2.6

### New Features — Generic Polymorph Support
- **Polymorph for any caster:** The Beast Form tab, focus-triggered transform, beast favorites, and beast action rolls now work for any character with the Polymorph spell — not just Druids. A Wizard, Sorcerer, or any caster who learns Polymorph gets full automation. Beast action rolls use the caster's own Cast Skill (Arcana for Wizards, Influence for Sorcerers, etc.).
- **Polymorph Mana Drain:** 1 Mana is automatically deducted per round while focusing Polymorph in combat. Chat notification shows mana spent. If mana reaches 0, the polymorph auto-reverts with a warning. The Shapechanger perk correctly exempts from this cost (no Mana to Focus on self-Polymorph).
- **Feature Detector spell scanning:** The feature detector now scans spell items. Adding/removing a Polymorph spell triggers an automatic rescan and updates the Beast Form tab visibility.
- **Generic Polymorph FX:** Non-Druid casters get a separately configurable `polymorph_shift` animation in the Feature FX settings. Druids keep their existing `druid_feralShift` FX.

### Bug Fixes — Exalt Spell
- **Exalt +2 vs Undead/Hellspawn:** Fixed Exalt not applying the doubled bonus against Undead/Hellspawn targets. The target check now uses stashed attack targets (`_vceAttackTargets`) instead of `game.user.targets`, which could be cleared by the time `rollDamage` fires.
- **Exalt bonus dice count:** Moved Exalt damage calculation to run after silver weakness and imbue dice injection, so bonus dice from those sources are counted toward Exalt's per-die bonus. Previously Exalt only counted base weapon dice.
- **Exalt damage restore order:** Fixed formula restoration order in rollDamage (last applied = first restored) to prevent stale formulas leaking between rolls.

### Bug Fixes — Aura Manager
- **Exalt aura icon 404:** Fixed typo in Exalt aura icon path (`prayer-hands-glowing-yellow-light.webp` → `prayer-hands-glowing-yellow.webp`). Eliminates console 404 errors on every token movement near an Exalt aura.

### Druid-Specific Changes
- **Savagery +1 Armor:** Remains gated to Druid L8+ only — non-Druid casters don't get the armor bonus.
- **Polymorph AE flag:** Changed from `druid_polymorph` to generic `polymorph` for class-agnostic tracking.

## v0.2.5

### Code Cleanup
- **Vanguard size logic:** Replaced inline `SIZE_ORDER` constant and size comparison logic in Guard Shove with shared helpers from brawl-intent.mjs (`getActorSize`, `getEffectiveShoveSize`).
- **Rogue combat hooks:** Removed 2 redundant hooks (`combatTurnChange`, `combatRound`); the single `updateCombat` hook already covers both.
- **Parallel DB writes:** Parallelized sequential `await` calls in Wizard Page Master, Vanguard `_clearGuardFlags`, and Vanguard Protector block rolls using `Promise.all()`.
- **Revelator Selfless regex:** Eliminated duplicate regex executions — `damage-final` and `HP` patterns now parsed once and cached.
- **Main module cleanup:** Removed noisy Page Master comment block and console.log from vagabond-character-enhancer.mjs.

## v0.2.5 (initial)

### New Features — Wizard Class
- **Page Master (L1):** "Spend Studied Die (+1d6)" button injected onto spell damage chat cards. Rolls 1d6, updates the damage total and all save/apply button amounts on the card, decrements studied dice. Works from both character sheet and crawler strip.
- **Sculpt Spell (L2) / Archwizard (L10):** Changed from Module AE to System status — the Vagabond system already handles these via AEs on the class compendium item. Removed duplicate managed AEs that were double-dipping delivery mana cost reduction.
- **Extracurricular (L6):** Changed from Todo to Flavor (player-tracked).

### New Features — Brawl Intent
- **Grapple auto-execute on hit:** Choosing Grapple from the intent dialog and hitting now automatically applies Restrained/Grappling statuses via the system's `handleGrapple`. No extra button click needed.
- **Shove auto-execute on hit:** Choosing Shove and hitting shows the Push 5' / Prone dialog immediately.
- **Orc Beefy favor:** Now correctly grants Favor on Grapple/Shove attack checks from the intent dialog.

### Documentation
- **Spell Damage Path Limitations:** Added comprehensive CLAUDE.md documentation on why static method patches, prototype patches, instance patches, and in-memory actor data modifications all fail for the spell damage path, and why `renderChatMessage` button injection is the only reliable approach.

### Bug Fixes
- **Wizard Sculpt Spell double-dip:** Removed managed AE that duplicated the system's built-in delivery mana cost reduction. Was giving -2 instead of -1 at level 2.

### README Updates
- Updated Wizard, Witch, and Vanguard sections to reflect current implementation status.

## v0.2.4

### New Features — Vanguard Class
- **Stalwart / Protector Perk (L1):** When an ally fails a save, auto-rolls an Endure (Block) save for any Protector within 5ft of the attacker. On pass, heals the ally for the highest damage die (retroactive block). Works for both GM and the Protector's owning player.
- **Guard (L1):** Two triggers — enemy enters Close range or Vanguard passes a Block save. Posts a prompt card with a "Shove" button. On click, rolls a Brawl check (with Orc Beefy and Bully perk Favor) and offers Push 5' / Prone on pass. Once per round, cleared on combat turn change.
- **Wall (L4/L8):** Fixed feature detection — registry keys now match compendium names ("Wall (Large)" / "Wall (Huge)"). Managed AE + shove size override lets Vanguards shove Large/Huge targets via brawl-intent system.
- **Indestructible (L10):** Immune to melee/ranged attack damage while Armor ≥ 1 and not Incapacitated. Spell/cast damage still applies. Posts "Indestructible" chat card when triggered.

### New Features — Brawl Intent Improvements
- **Brawl Intent Dialog moved to rollAttack level:** The Damage/Grapple/Shove intent dialog now works from BOTH the character sheet AND the vagabond-crawler action strip. Previously only triggered from the character sheet.
- **Auto-execute on hit:** Grapple auto-applies Restrained/Grappling statuses on hit. Shove shows Push/Prone dialog immediately on hit. No extra chat card button clicks needed.
- **Orc Beefy Favor:** Orc ancestry Beefy trait now grants Favor on Grapple/Shove attack checks (was previously only tracked for Bully perk).
- **Grapple button click handler:** Module now wires its own click handler for Grapple buttons, fixing hook ordering issues with the system's renderChatMessageHTML.

### New Features — Sorcerer Class
- **Tap, Arcane Anomaly, Spell Twinning:** Changed from Todo to Flavor (player-tracked, no automation needed).

### Bug Fixes
- **measureDistance token size:** Distance calculation now accounts for Large/Huge/Colossal token footprints. Uses grid-square gap instead of corner-to-corner pixels, so a Medium token adjacent to a 3x3 Huge token correctly reads 5ft from any angle.
- **Wall (Large) icon 404:** Replaced missing `wall-shield.webp` with valid `heater-crystal-blue.webp`.
- **Protector icon 404:** Replaced missing `heater-steel-sword-blue.webp` with valid `heater-crystal-blue.webp`.
- **Protector attacker detection:** `_saveSourceActorId` is cleared before createChatMessage fires. Added fallback that parses attacker from the preceding damage card in chat.
- **Protector HP field:** Fixed `system.hp.value` → `system.health.value` (Vagabond uses `health`, not `hp`).

### Architecture
- **Dual Code Path Documentation:** Added CLAUDE.md table documenting which patch levels work from both the character sheet and the crawler strip. Rule: always patch at `VagabondItem.prototype.rollAttack` / `rollDamage` or lower, never rely on `RollHandler`.
- **Exported measureDistance:** `range-validator.mjs` now exports `measureDistance` for use by other modules (Guard, Protector distance checks).

## v0.2.3

### New Features — Rogue Class
- **Sneak Attack (L1):** Favored attacks that hit deal bonus d4 damage and ignore Armor equal to the number of bonus dice. Scales: 1d4 at L1, 2d4 at L4, 3d4 at L7, 4d4 at L10. Bonus dice injected into the damage roll formula. Armor penetration applied in `calculateFinalDamage`. Chat notification on trigger.
- **Evasive (L4):** Ignore Hinder on Reflex Saves while not Incapacitated. Remove two highest Dodge damage dice instead of one on passed saves. Shares infrastructure with Dancer Evasive.
- **Lethal Weapon (L6):** Removes the "first attack only" restriction from Sneak Attack — all favored hits on a turn trigger Sneak Attack.

### Bug Fixes
- **Feature Name Collision:** Feature detector now correctly resolves features that share names across classes (e.g., "Evasive" in both Rogue and Dancer, "Fleet of Foot" in both Monk and Dancer). Previously the last-registered class always won, causing Rogues to get `dancer_evasive` instead of `rogue_evasive`. New multi-map lookup matches by actor's class.
- **Holy Diver Icon:** Replaced missing `projectiles-blades-702702-yellow.webp` with valid `beam-rays-yellow.webp`.

## v0.2.2

### New Features — Revelator Class
- **Selfless (L1):** When an ally takes damage, a prompt offers to redirect the damage to the Revelator. Uses raw pre-armor damage amount (can't be reduced). Once per turn.
- **Lay on Hands (L2):** "Heal" button injected directly into the character sheet Features panel. Clicking posts a chat card with a Heal button — target a token and click to restore d6 + Level HP. 2 uses per Rest (auto-resets). Divine Resolve (L6) also cures Blinded/Paralyzed/Sickened on heal targets.
- **Paragon's Aura (L4):** Status changed to partial — +1 Focus AE and AuraManager template tracking work, but free Aura Mana delivery is not enforced.

### Bug Fixes
- **Divine Resolve AE:** Status immunities were stored as a single comma-separated string (`"blinded,paralyzed,sickened"`) instead of three separate array entries. The system's `Array.includes()` check never matched. Now creates one AE change per status.
- **Sacrosanct AE:** Save bonus keys were missing `system.` prefix and endure used `difficulty` instead of `bonus`. Fixed registry and recreated AEs.
- **Sacrosanct Icon:** Replaced missing `saint-glass-portrait-halo-yellow.webp` with valid `chalice-glowing-gold.webp`.
- **Summoner Soulbonder Immunities:** Same comma-separated string bug as Divine Resolve — `immunities.join(",")` now maps to separate AE changes.
- **Sheet Injection Hook:** Lay on Hands button used `renderActorSheet` which never fires for Foundry v13 ApplicationV2 sheets. Changed to `renderApplicationV2`.

## v0.2.1

### New Features — Weapon Range Enforcement
- **Range Validation:** Blocks attacks on out-of-range targets with a warning showing weapon max range vs target distance. Supports Close (5ft), Near (30ft), Far (unlimited) range bands plus Long (+5ft), Ranged, Thrown, and Near weapon properties. World setting (`enforceWeaponRange`), on by default.
- **Auto-Hinder:** Ranged weapons at Close range (≤5ft) automatically apply Hinder (unless character has Akimbo Trigger perk). Thrown weapons at Far range (>30ft) also auto-Hinder.
- **Target Count Enforcement:** Non-Cleave weapons can only target 1 enemy. Cleave weapons limited to 2. Spin-to-Win perk removes the cap. Monk Martial Arts grants implicit Cleave on Finesse weapons (2 targets).

### New Features — Cleave Damage Fix
- **Half Damage to All Targets:** Cleave now correctly deals half damage to all targets (not full to first, half to rest). Odd damage rounds up for the first target, down for the rest (e.g., 7 → 4 + 3). Minimum 1 damage per target.
- **Both Damage Paths:** Works through both direct damage (`handleApplyDirect`) and save-based damage (`handleSaveRoll`).
- **Monk Martial Arts Cleave:** Also updated to half damage to both targets (primary retroactively adjusted).

### New Features — Spin-to-Win Perk
- **Unlimited Cleave Targets:** Managed AE sets `cleaveMaxTargets` to 100, bypassing the normal 2-target Cleave limit.

### Bug Fixes
- **Managed AE Sync:** `_syncManagedEffects` now runs on every scan, not just when feature flags change. Fixes perk AEs (like Spin-to-Win) not being created on actors that were already scanned before perk AE support was added.
- **Monk Finesse Cleave Blocked:** Range validator no longer blocks 2-target attacks with Finesse weapons when the Monk has Martial Arts.

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
