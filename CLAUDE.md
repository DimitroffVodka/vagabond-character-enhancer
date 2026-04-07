# Vagabond Character Enhancer — Claude Context

## What This Is
A FoundryVTT v13 module (`vagabond-character-enhancer`) that automates ancestry traits, class features, and perks for the **Vagabond RPG** system (by mordachai). The Vagabond system ID is `vagabond`, current version 5.1.3.

## Vagabond RPG — Core Mechanics Reference

### Stats (range 2-7)
- **Might**: HP, inventory slots, Endure saves, Brawl/Melee attacks
- **Dexterity**: Speed, Reflex saves, Finesse/Sneak
- **Awareness**: Reflex saves, Detect, Mysticism (Druid/Luminary/Witch casting), Survival, Ranged attacks
- **Reason**: Will saves, Arcana (Magus/Wizard casting), Craft, Medicine
- **Presence**: Will saves, Influence (Sorcerer casting), Leadership (Revelator casting), Performance
- **Luck**: Pool of reroll/favor points equal to Luck stat, refreshes on rest

### Checks
- Roll d20 vs Difficulty = `20 - (Stat × 2 if Trained, or just Stat)`
- **Crit**: Natural 20 (unmodified). Gain 1 Luck. Attack crits deal Stat as bonus damage. Save crits negate and grant an Action.
- **Favor**: d20 + d6. **Hinder**: d20 - d6. They cancel 1:1, don't stack.

### HP & Damage
- Max HP = Might × Level
- Inventory Slots = 8 + Might
- **Armor**: Subtracted from attack damage
- **Immune**: Unharmed. **Weak**: Ignores Armor/Immune + extra damage die
- Damage has no types by default — GM decides if abilities apply to a source

### Saves
- **Endure** (Might × 2): Physical — poison, restraints, petrification
- **Reflex** (Dex + Awareness): Evasion — explosions, traps, breath weapons
- **Will** (Reason + Presence): Mental — charms, fear, psychic

### Combat
- **Turn Order**: Heroes first (unless surprised via failed Detect check)
- **Actions**: Attack, Cast, Hold, Jump, Rush, Use
- **Move**: Speed = 25'/30'/35' based on Dex 2-3/4-5/6-7
- **Defending**: Block (Endure save, hindered vs ranged) or Dodge (Reflex save, hindered in heavy armor). Pass = ignore highest damage die.

### Magic System
Spells have three configurable parts (each costs Mana):
1. **Damage**: Base d6, +1d6 per extra Mana
2. **Effect**: The spell's special effect (1 Mana to add alongside damage)
3. **Delivery**: How it reaches targets (Aura, Cone, Cube, Imbue, Glyph, Line, Remote, Sphere, Touch — each has base cost + scaling)
4. **Duration**: Instant by default. Focus to sustain (1 Mana/round vs unwilling targets). Continual = no focus needed.

Cast Checks only required vs unwilling targets. Casting stat depends on class tradition:
- **Arcane** (Wizard, Magus): Reason/Arcana
- **Divine** (Revelator): Presence/Leadership
- **Occult** (Witch): Awareness/Mysticism
- **Primal** (Druid, Luminary): Awareness/Mysticism
- **Glamour** (Sorcerer): Presence/Influence

### Weapons
- Properties: Brawl, Brutal (+1 crit die), Cleave (half dmg to 2), Entangle (grapple), Finesse, Keen (crit threshold -1), Long (+5' range), Near, Ranged, Shield, Thrown
- Grip: 1H, 2H, F(ist), V(ersatile — 1H or 2H for bigger die)
- Dual-wield: Skip move for off-hand attack

### Dice Mechanics
- **Exploding** (d6!): Max roll adds another die, recursive
- **Countdown** (Cdx): Roll each round, 1 = shrink die, 1 on d4 = ends
- **Cumulative** (2d6): Add dice together

### Status Conditions
- **Berserk**: Can't Cast or Focus, immune to Frightened, skips Morale Checks
- **Blinded**: Can't see, Vulnerable
- **Burning**: Takes indicated die damage at start of turns unless extinguished
- **Charmed**: Can't willingly attack the charmer
- **Confused**: Checks/Saves hindered, saves against its actions are favored
- **Dazed**: Can't Focus or Move unless it uses an Action to do so
- **Fatigued**: 0-5 scale. Each fatigue = 1 inventory slot. 3+ = can't Rush. 5 = death.
- **Frightened**: -2 penalty to damage dealt
- **Incapacitated**: Can't Focus/Act/Move, fails all Might/Dex checks, Vulnerable
- **Invisible**: Can't be seen; those who can't see it are treated as Blinded vs it
- **Paralyzed**: Incapacitated + Speed 0
- **Prone**: Crawl only (2' speed per 1' movement), can't Rush, Vulnerable to melee/dodge
- **Restrained**: Vulnerable + Speed 0
- **Sickened**: -2 penalty to healing received; may have additional effects in parentheses
- **Suffocating**: Heroes roll d8/round, >= Might = +1 Fatigue. Enemies: +1 Fatigue/round.
- **Unconscious**: Blinded + Incapacitated + Prone. Close attacks auto-crit.
- **Vulnerable**: Its attacks/saves hindered; attacks targeting it are favored

### Classes (18 total)
Alchemist, Barbarian, Bard, Dancer, Druid, Fighter, Gunslinger, Hunter, Luminary, Magus, Merchant, Pugilist, Revelator, Rogue, Sorcerer, Vanguard, Witch, Wizard

Level 1-10. Even levels = +1 stat. Odd levels (after 1) = +1 perk.

### Ancestries (7 total)
Human, Dwarf, Elf, Halfling, Draken, Goblin, Orc

## Module Architecture

### Entry Point
`scripts/vagabond-character-enhancer.mjs` — Registers settings on `init`, then on `ready`:
1. Monkey-patches system methods (calculateFinalDamage, rollAttack, rollDamage, item.roll, buildAndEvaluateD20, _rollSave, RollHandler.roll, SpellHandler.castSpell)
2. Each patch dispatches to class-specific handler methods via a context object (`ctx`)
3. Registers all class feature hooks
4. Patches character sheet for Beast Form panel (Druid polymorph)
5. Initializes beast cache, runs initial feature scan

### Feature Detection System
`scripts/feature-detector.mjs` — The core detection engine:
- Scans actor's class/ancestry/perk items and reads `levelFeatures` from system compendium data
- Sets flags on actor at `flags.vagabond-character-enhancer.features` (e.g., `barbarian_rage: true`)
- Creates/removes **managed Active Effects** based on registry definitions
- Triggers on: actor create, item create/delete, level change, manual rescan

### Class Feature Pattern
Each class has `scripts/class-features/{class}.mjs` exporting:
1. **`{CLASS}_REGISTRY`** — Object mapping feature names to definitions:
   - `class`, `level`, `flag`, `status` ("system"/"module"/"partial"/"flavor"/"todo")
   - `description` — what the feature does
   - `effects` (optional) — array of managed AE definitions with `changes` array
2. **`{Class}Features`** — Object with:
   - `registerHooks()` — sets up Hooks.on() listeners
   - Handler methods called from main dispatcher: `onPreRollAttack(ctx)`, `onPreRollDamage(ctx)`, `onCalculateFinalDamage(ctx)`, etc.

### Implementation Patterns

**Passive AE (simplest)**: Define `effects` array in registry entry. Feature detector auto-creates the AE when the class is detected. Example: Wizard's Sculpt Spell.

**Level-scaling AE**: Use `preSyncEffects` hook to modify AE `changes` array dynamically based on actor level. Example: Merchant's Deep Pockets (`bonusSlots = ceil(level/2)`).

**Runtime hooks (complex)**: Wrap system methods via the main dispatcher. Handler receives a `ctx` object with `{actor, item, features, favorHinder, ...}`. Modify `ctx` properties to affect the roll. Example: Barbarian auto-berserk, Bard Virtuoso favor.

**Chat card integration**: Use `Hooks.on("createChatMessage")` to detect system chat cards and inject buttons/effects. Example: Bard Song of Rest, Fighter Momentum.

### Dual Code Paths: Character Sheet vs Crawler Strip
**CRITICAL**: The `vagabond-crawler` companion module has its own action strip UI that calls system methods directly, bypassing the character sheet's `RollHandler`. When patching attack/damage flows, you MUST patch at the correct level:

| Patch Level | Character Sheet | Crawler Strip | Use For |
|---|---|---|---|
| `RollHandler.prototype.rollWeapon` | ✅ | ❌ | **DO NOT USE** — crawler bypasses this |
| `RollHandler.prototype.roll` | ✅ | ❌ | **DO NOT USE** — crawler bypasses this |
| `VagabondItem.prototype.rollAttack` | ✅ | ✅ | Pre/post attack hooks, dialogs, favor |
| `VagabondItem.prototype.rollDamage` | ✅ | ✅ | Damage modification, bonus dice |
| `VagabondDamageHelper._rollSave` | ✅ | ✅ | Save modifications |
| `VagabondDamageHelper.calculateFinalDamage` | ✅ | ✅ | Damage reduction |
| `Hooks.on("createChatMessage")` | ✅ | ✅ | Reactive features (detect results) |
| `Hooks.on("renderChatMessage")` | ✅ | ✅ | Button injection into chat cards |

**Rule of thumb**: Always patch at `VagabondItem.prototype.rollAttack` / `rollDamage` or lower. Never rely on `RollHandler` for features that must work from the crawler strip. If a feature intercepts before the attack roll (e.g., intent dialogs), it MUST go in `rollAttack`, not `rollWeapon`.

### Key System Fields for Active Effects
```
# Crit thresholds (negative = lower threshold, e.g., -1 means crit on 19+)
attackCritBonus, castCritBonus, meleeCritBonus, rangedCritBonus
reflexCritBonus, endureCritBonus

# Damage
universalDamageBonus, spellDamageDieSize (default 6)
{melee,ranged,brawl,finesse}DamageDieSizeBonus

# Mana cost reduction
bonuses.spellManaCostReduction, bonuses.deliveryManaCostReduction

# Focus
focus.maxBonus

# Inventory
inventory.bonusSlots

# Status immunities
statusImmunities (comma-separated string)

# Save bonuses
saves.reflex.bonus, saves.endure.bonus, saves.will.bonus
```

### Other Module Files
- `scripts/utils.mjs` — `MODULE_ID`, `log()`, `hasFeature()`, `getFeatures()`, `combineFavor()`
- `scripts/polymorph/` — Druid beast form system (dialog, manager, sheet injection, beast cache)
- `scripts/alchemy/` — Alchemist cookbook UI and crafting helpers
- `scripts/ancestry-features/` — One file per ancestry with trait registries
- `scripts/perk-features.mjs` — Perk automation registry (all 104 perks with flags)
- `scripts/spell-features/` — Spell automation (bless-manager.mjs, imbue-manager.mjs)
- `scripts/range-validator.mjs` — Weapon range enforcement, target count limits, auto-hinder
- `scripts/status-effects.mjs` — Custom status effect definitions
- `scripts/focus/` — Focus tracking + Feature FX system (see `docs/feature-fx-system.md`)
- `packs/vce-beasts/` — LevelDB compendium of 72 modified beast actors for Druid polymorph

### Reference Documents
- `docs/perk-automation-reference.md` — All 104 perks with automation status, descriptions, and implementation notes. **Read this before working on perk automation.**
- `docs/spell-automation-reference.md` — All 59 spells with automation status, damage types, and implementation notes. **Read this before working on spell automation.**
- `docs/feature-fx-system.md` — Feature FX / Sequencer animation system reference
- `docs/silver-weakness-system.md` — Silver/metal weakness damage system reference

### Feature FX System
`scripts/focus/focus-manager.mjs` + `scripts/focus/feature-fx-config.mjs` — Configurable Sequencer animations for class features, monster attacks, and status effects. Full reference: **`docs/feature-fx-system.md`**

Key points:
- Per-feature animation config via ApplicationV2 dialog (Module Settings → "Configure Feature FX")
- Config stored in `featureFxConfig` world setting, merged over `DEFAULT_FEATURE_FX` defaults
- `FocusManager.playFeatureFX(actor, featureKey, targetActor?)` plays configured FX
- `FocusManager.stopFeatureFX(actorId, featureKey)` stops persistent FX
- Feature keys: `{class}_{feature}`, `monster_{action}`, `status_{statusId}`, `_focus`
- Requires Sequencer + JB2A (optional deps in module.json). Graceful degradation without them.
- Focus tracking: features consume focus slots from the same pool as spells (`system.focus.max`)

### Exposed API
`game.vagabondCharacterEnhancer` provides: `rescan(actor)`, `rescanAll()`, `getFlags(actor)`, `debug(actor)`, `virtuoso(actor)`, `stepUp(actor)`, `getStepUpData(actor)`, `getVirtuosoData(actor)`, `focusAcquire(actor, key, label, icon)`, `focusRelease(actor, key)`, `focusStatus(actor)`, `focus` (FocusManager object)

### Related Modules
- **vagabond-crawler** — Companion module (optional). Uses VCE's API for Step Up and Virtuoso integration.
- **lib-wrapper** — Optional dependency for cleaner method patching.

## Rulebook Location
Full Vagabond rulebook in Obsidian markdown: `F:/Obsidian/Vagabond/Vagabond/`
- Core rules: `Core Rulebook/` (chapters 01-08)
- Individual class rules: `Core Rulebook/03_Heroes/Classes/{ClassName}.md`
- Class breakdowns: `Class Breakdown/`

**Always read the relevant class file before implementing a class feature. Don't guess at rules.**

## Development Notes
- FoundryVTT v13.351, Vagabond system v5.1.3
- Module runs as ES modules (`.mjs`), no build step
- System methods are patched via monkey-patching on `ready` hook (no libWrapper currently)
- MCP bridge available for live testing via `foundry-mcp-bridge` module
- The `status` field in registry entries tracks implementation state: check it before working on a feature
