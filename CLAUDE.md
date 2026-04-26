# Vagabond Character Enhancer — Claude Context

## What This Is
A FoundryVTT v13 module (`vagabond-character-enhancer`) that automates ancestry traits, class features, and perks for the **Vagabond RPG** system (by mordachai). The Vagabond system ID is `vagabond` (module.json pins minimum/verified to 5.0.0).

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

### Classes (20 total)
Alchemist, Barbarian, Bard, Dancer, Druid, Fighter, Gunslinger, Hunter, Luminary, Magus, Merchant, Monk, Pugilist, Revelator, Rogue, Sorcerer, Summoner, Vanguard, Witch, Wizard

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

### Spell Damage Path — Known Limitations
**CRITICAL**: The spell damage path is fundamentally different from the weapon damage path and has severe patching limitations:

**Weapon damage** flows through `VagabondItem.prototype.rollDamage` — a prototype method that can be reliably monkey-patched. Both the character sheet and crawler call it.

**Spell damage** flows through `VagabondDamageHelper.rollSpellDamage` — a **static class method**. Despite being patchable at the module level, the system's internal code (inside `_createSpellChatCard`) does its own `await import('../../helpers/damage-helper.mjs')` and calls the method via that fresh import. **Patching the static method on the class object does NOT affect calls made from within the system's own modules.** This appears to be a Foundry v13 ES module isolation behavior.

**What DOESN'T work for spell damage:**
- `VagabondDamageHelper.rollSpellDamage = ...` — static method patch is invisible to internal callers
- `SpellHandler.prototype._createSpellChatCard = ...` — prototype patches don't work because the system creates a **new SpellHandler instance** per sheet render; the instance doesn't inherit runtime prototype changes
- Instance-level patches via `renderApplicationV2` on `app.spellHandler._createSpellChatCard` — works for the character sheet but NOT the crawler strip
- Modifying `actor.system.universalSpellDamageDice` in memory — gets wiped by `actor.update()` data re-derivation
- Post-`_cast()` message counting in the crawler — `origCast` returns before async chat messages are created

**What DOES work:**
- **`Hooks.on("renderChatMessage")` button injection** — inject a button onto spell damage cards, update damage totals and `data-damage-amount` attributes retroactively on click. This is the **only reliable approach** that works from both the character sheet and the crawler strip.
- **`state.damageDice` modification** before calling `origCreateCard` on an instance-patched `_createSpellChatCard` — works for the character sheet only (instance patch via `renderApplicationV2`). Used as a pre-roll approach when retroactive isn't acceptable.

**Recommendation for new spell-related features:** Always use `renderChatMessage` button injection. Don't attempt to patch `rollSpellDamage` or `_createSpellChatCard` — it will not work across both code paths.

### Spell Cast-Time Tracking — Dual-Patch Required
**CRITICAL**: The vagabond-crawler module has its own `CrawlerSpellDialog._cast` (in `vagabond-crawler/scripts/npc-action-menu.mjs`) that bypasses `SpellHandler.castSpell` entirely. Any cast-time state capture (e.g., useFx, damage dice, focus intent, target snapshot) MUST be patched in BOTH places or it will silently fail when players cast from the crawler strip.

| Code path | Patch site | Cast button |
|---|---|---|
| Character sheet | `SpellHandler.prototype.castSpell` | Sheet's "Cast" |
| Crawler strip | `CrawlerSpellDialog.prototype._cast` | Crawler dialog "Cast" |

Both call `VagabondChatCard.spellCast()` to render the chat card and `VagabondDamageHelper.rollSpellDamage()` to roll damage — but they do NOT share a cast entry point.

**Pattern**: Define one helper (e.g., `_recordCastUseFx`), call it from both patch sites. Wrap the crawler patch in `if (game.modules.get("vagabond-crawler")?.active)` and a try/catch since the module is optional.

**Existing example**: `_recordCastUseFx` in `vagabond-character-enhancer.mjs` is called from both `SpellHandler.castSpell` and `CrawlerSpellDialog._cast` patches — see those for reference.

### Companion System (v0.4.0+)
Unified engine under `scripts/companion/` that replaces per-class summon plumbing. Any feature that spawns an NPC the PC controls (summon, familiar, raised undead, animated object, animal companion, conjured creature, hireling) MUST go through this rather than calling `placeToken` directly.

**Core pieces:**
- **`CompanionSpawner`** (`companion-spawner.mjs`) — spawn/dismiss/query. Signature: `CompanionSpawner.spawn({ caster, sourceId, actor, tokenData, allowMultiple?, suppressChat?, grantOwnershipFrom? })`. Handles socket-relayed token creation, ownership grants, combat auto-add, replace-on-same-source prompt, and wildcard token resolution.
- **Source registry** (`companion-sources.mjs`) — pure-data definitions per source (`summoner`, `familiar`, `spell-beast`, `spell-animate`, `spell-raise`, `perk-conjurer`, `perk-reanimator`, `perk-animal-companion`, `hireling-manual`, `legacy`). Declares badge color, NPC-action skill routing, termination rules. **Add new sources here**, not inline.
- **Per-source dismiss handlers** — `CompanionSpawner.registerDismissHandler(sourceId, fn)`. Called before generic dismiss; use for focus release, synthetic-actor cleanup, caster-side state flags. Fires on every dismiss path (tab button, zero-HP auto, replace-on-spawn).
- **`CreaturePicker`** (`creature-picker.mjs`) — shared ApplicationV2 dialog. Filter config: `{ types, sizes, maxHD, pack, customFilter, excludeTypes, allowFavorites }`. Use this instead of rolling a bespoke picker.
- **`CorpsePicker`** (`corpse-picker.mjs`) — defeated-token picker for Raise/Reanimator. Single- or multi-select; optional compendium fallback pool.
- **`applyUndeadTemplate(actor, { sourceName })`** (`undead-template.mjs`) — tagged AE for raised undead. GM-proxied via `createActorAE` socket op.

**Flag schema on spawned NPC:**
- `companionMeta: { sourceId, casterActorId, ... }` — primary identifier (v0.4.0+). `sourceId` keys into the source registry.
- `controllerActorId` + `controllerType` (`"companion"` | `"hireling"`) — save-routing + NPC-action routing.

**Save routing** (v0.3.4+) — `handleSaveRoll` / `handleSaveReminderRoll` are patched in `save-routing-patch.mjs` so flagged NPCs roll saves via the controller PC's stats. Don't re-patch — compose through the existing patch.

**NPC action routing** — `VagabondChatCard.npcAction` is patched so any action click on a companion routes through the controller PC's Mana Skill (or Leadership for hirelings). New source types must be added to the routing switch in `vagabond-character-enhancer.mjs` (search for `companionMeta`).

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
- `scripts/companion/` — v0.4.0 unified companion system. Key files: `companion-spawner.mjs` (spawn/dismiss engine), `companion-sources.mjs` (source registry), `companion-manager-tab.mjs` (Companions tab on every PC sheet), `companion-termination.mjs` (GM-side HP-to-0 auto-dismiss), `creature-picker.mjs`, `corpse-picker.mjs`, `undead-template.mjs`, `controller-dialog.mjs` (Set Save Controller), `gather-companions.mjs` (compress/release HUD button), `save-routing.mjs` + `save-routing-patch.mjs`. See the Companion System section above.
- `scripts/polymorph/` — Druid beast form system (dialog, manager, sheet injection, beast cache)
- `scripts/alchemy/` — Alchemist cookbook UI and crafting helpers
- `scripts/ancestry-features/` — One file per ancestry with trait registries
- `scripts/perk-features.mjs` — Perk automation registry (all 104 perks with flags)
- `scripts/perk-features/` — Per-perk subdirectory for complex perks: `familiar.mjs`, `animal-companion.mjs`, `conjurer.mjs`, `raise-perks.mjs` (Grim Harvest / Infesting Burst / Necromancer), `reanimator.mjs`. Simple flag-based perks stay in `perk-features.mjs`.
- `scripts/spell-features/` — Spell automation. Managers: `bless-manager.mjs`, `imbue-manager.mjs`, `ward-manager.mjs`, `effect-only-handler.mjs`. Companion-summoning spell adapters (v0.4.0): `beast-spell.mjs`, `raise-spell.mjs`, `animate-spell.mjs`.
- `scripts/aura/aura-manager.mjs` — Persistent spell aura templates that follow tokens and apply buffs (Revelator Paragon's Aura)
- `scripts/brawl/brawl-intent.mjs` — Grapple/Shove intent system for Brawl attacks
- `scripts/merchant/gold-sink-sheet.mjs` — Merchant Gold Sink shop tab injection (shares junk flag with vagabond-crawler)
- `scripts/socket-relay.mjs` — GM-proxied operations for player clients. Ops: `placeToken` (with `grantOwnershipFrom`), `removeToken`, `createTokens`/`deleteTokens` (batch, for Gather), `createActor` (Animate synthetic NPCs), `createActorAE` (Undead template on non-owned actor), `updateActorFlags` (atomic multi-flag), `updateToken`, `setActorFlag`.
- `scripts/range-validator.mjs` — Weapon range enforcement, target count limits, auto-hinder
- `scripts/status-effects.mjs` — Custom status effect definitions
- `scripts/focus/` — Focus tracking + Feature FX system (see `docs/feature-fx-system.md`)
- `templates/` — Handlebars templates for ApplicationV2 dialogs: `alchemy-cookbook.hbs`, `controller-dialog.hbs`, `corpse-picker.hbs`, `creature-picker.hbs`, `feature-fx-config.hbs`.
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
`game.vagabondCharacterEnhancer` exposes (see `scripts/vagabond-character-enhancer.mjs:1305` for source of truth):
- **Scan / debug:** `rescan(actor)`, `rescanAll()`, `getFlags(actor)`, `debug(actor)`
- **Focus:** `focus` (FocusManager), `focusAcquire(actor, key, label, icon)`, `focusRelease(actor, key)`, `focusStatus(actor)`
- **Bard:** `virtuoso(actor)`, `getVirtuosoData(actor)` (crawler API)
- **Dancer:** `stepUp(actor)`, `getStepUpData(actor)` (crawler API)
- **Hunter / Revelator / Draken:** `hunterMark(actor)`, `layOnHands(actor)`, `setDraconicResilience(actor)`
- **Aura / Imbue / Brawl:** `aura(actor, spell, radius)`, `auraMenu(actor)`, `auraEnd(actor)`, `imbue` (ImbueManager), `clearImbue(actor)`, `brawlIntent` (BrawlIntent)
- **Witch:** `witch`, `hex(...)`, `unhex(...)`, `betwixt(actor)`
- **Summons / familiars:** `summoner`, `conjure(actor)`, `banish(actor)`, `getSummonData(actor)`, `familiar`, `conjureFamiliar(actor)`, `banishFamiliar(actor)`
- **Alchemy / Polymorph:** `alchemist`, `alchemy`, `polymorph`
- **Merchant:** `getGoldSinkData(actor)` (crawler API)
- **Weapon flags:** `markAreaAttack(item, enabled)` — bypass RangeValidator single-target check for breath/cone weapons

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
- FoundryVTT v13.351, Vagabond system v5.0.0+, module v0.4.0 (per module.json)
- Module runs as ES modules (`.mjs`), no build step
- System methods are patched via monkey-patching on `ready` hook (no libWrapper currently)
- The `status` field in registry entries tracks implementation state: check it before working on a feature

### Testing via the foundry-mcp-bridge

A live FoundryVTT instance is reachable through the `foundry-mcp-bridge` module's MCP tools. **Use it.** When you make a change that touches runtime behavior — a hook, a patched system method, an AE distribution path, an aura, anything that only matters at runtime — drive it through the live game and verify the actual chat messages, flag state, and console output before reporting "done." Don't ask the user to F5 and report results back unless you genuinely have no MCP access; reload it yourself and test.

Common tools (load via `ToolSearch` with `select:mcp__foundry-vtt__<name>`):

- **`evaluate`** — runs JS in the live `game`/`canvas`/`ui` context. Use for: confirming flag state, reading actor/token data, calling module methods directly to bypass UI dialogs, reloading the page (`window.location.reload()`).
- **`get_actor` / `list_actors`** — fetch actor data without manually grepping JSON.
- **`use_item`** — trigger a weapon/spell/feature on an actor and capture the resulting chat messages.
- **`get_console_errors`** — pull recent client errors. Critical for catching the silent failures that don't surface in chat.
- **`screenshot`** — capture the canvas (tokens + scene only; not sheets or HUD).
- **`trace_hook`** — temporarily listens for hook firings to discover what arguments a hook actually receives at runtime.
- **`roll`** with `rig` — deterministic dice for testing pass/fail branches without re-rolling.

**Standard test loop after a runtime change:**
1. `evaluate { window.location.reload() }` to F5 (then wait ~3-5 seconds for the world to come back).
2. Read flag/state via `evaluate` or `get_actor` to confirm the change registered.
3. Trigger the affected feature (`use_item`, direct method call via `evaluate`, or token movement via `evaluate`).
4. Read recent chat messages and console errors to verify the resulting roll/card/AE landed correctly.

If MCP testing isn't possible (server down, no connection), explicitly say so rather than just claiming the work is done off-disk.

### Build & Release
- **Package release zip:** `pwsh ./build-zip.ps1` — produces `module.zip` at repo root containing `module.json`, `scripts/`, `styles/`, `languages/`, `packs/`, and docs. Upload both `module.json` + `module.zip` as GitHub release assets (Foundry manifest points at `releases/latest/download/`).
- **Live reload in Foundry:** no hot reload — F5 the tab or `window.location.reload()` via the MCP bridge after editing a `.mjs`.
