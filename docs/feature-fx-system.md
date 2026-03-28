# Feature FX System — Reference

## Overview
The Feature FX system provides configurable Sequencer animations and sounds for class features, monster attacks, and status effects. All FX are configured through a centralized ApplicationV2 dialog accessible from Module Settings.

**Dependencies (optional):**
- **Sequencer** — animation engine (required for any FX)
- **JB2A_DnD5e** — free animation library (provides default animation files)
- **PSFX** — Peri's Sound Effects (optional sound library)

## Architecture

### Files
```
scripts/focus/
├── focus-manager.mjs      — Core FX engine + Focus tracking + hooks
├── feature-fx-config.mjs  — Config dialog (ApplicationV2) + defaults + getFeatureFxConfig()
templates/
└── feature-fx-config.hbs  — Config dialog template
```

### Data Flow
```
Feature Trigger (attack, buff, status, mark)
  → playFeatureFX(actor, featureKey, targetActor?)
    → getFeatureFxConfig(featureKey)  // merges defaults + stored overrides
    → _playFX(token, actorId, featureKey, fxConfig)
      → new Sequence().effect().file().attachTo().scale()...play()
      → new Sequence().sound().file().volume()...  (if sound configured)
```

### Config Storage
- **World setting:** `featureFxConfig` (Object, hidden from standard settings UI)
- **Defaults:** `DEFAULT_FEATURE_FX` constant in `feature-fx-config.mjs`
- **Merge:** `getFeatureFxConfig()` deep-merges stored overrides on top of defaults
- **Access:** `game.settings.registerMenu` button in Module Settings → "Configure Feature FX"

## FX Config Schema

Each feature key maps to a config object:

```js
{
  label: "Bite",                    // Display name in config UI
  class: "_monster",                // Grouping tab: class name, "_global", "_monster", "_status"
  enabled: true,                    // Master toggle for this FX
  target: "target",                 // "caster" | "target" | "both"
  file: "modules/JB2A_DnD5e/...",   // Animation .webm path
  scale: 1,                         // Multiplier relative to token (1 = token-sized)
  opacity: 0.7,                     // 0-1
  persist: false,                   // true = loop until stopped, false = one-shot
  fadeIn: 800,                      // ms
  fadeOut: 800,                     // ms
  belowToken: true,                 // Render below or above token
  sound: "",                        // Audio file path (optional)
  soundVolume: 0.6                  // 0-1
}
```

### Duration
- **Persistent** (`persist: true`): Loops indefinitely until `stopFeatureFX()` is called. Used for ongoing effects (Focus, Hunter's Mark, status effects).
- **One-shot** (`persist: false`): Plays for `duration` ms (default 2000ms). Used for instant triggers (attacks, buffs).

## Feature Key Naming Convention

| Category | Pattern | Examples |
|----------|---------|----------|
| Global | `_focus` | Generic focus glow |
| Class features | `{class}_{feature}` | `hunter_huntersMark`, `bard_virtuoso`, `dancer_stepUp`, `druid_feralShift` |
| Monster attacks | `monster_{action}` | `monster_bite`, `monster_claw`, `monster_slam` |
| Status effects | `status_{statusId}` | `status_berserk`, `status_frightened`, `status_burning` |

## Trigger Points

### Class Features (manually wired)
| Feature | File | Trigger Point | Target |
|---------|------|---------------|--------|
| Focus (generic) | `focus-manager.mjs` | `acquireFeatureFocus()` / spell toggle | Caster |
| Hunter's Mark | `hunter.mjs` → `_markTarget()` | On mark, plays on target. Stops on unmark/cleanup. | Target |
| Bard Virtuoso | `bard.mjs` → `_applyVirtuosoBuff()` | After buff choice, plays on each target actor | Caster/Target/Both |
| Dancer Step Up | `dancer.mjs` → `performStepUp()` / `_executeStepUpFromTab()` | On Step Up activation | Caster |
| Druid Beast Form | `polymorph-manager.mjs` → `applyBeastForm()` | On beast form transformation | Caster |
| Barbarian Rage | via `status_berserk` | Automatic — system toggles berserk status | Caster |

### Monster Attacks (automatic via chat hook)
- **Hook:** `createChatMessage` in `focus-manager.mjs` → `_onChatMessage()`
- **Matching:** Extracts action name from `<h3 class="header-title">Bite</h3>` in the NPC action chat card
- **Key mapping:** Action name → `monster_{lowercase_no_spaces}` (e.g., "Bite" → `monster_bite`)
- **Target:** Reads from `game.user.targets` at the time the chat message is created
- Only fires for NPC actors (`actor.type === "npc"`)

### Status Effects (automatic via AE hooks)
- **Hooks:** `createActiveEffect` / `deleteActiveEffect` in `focus-manager.mjs`
- **Matching:** Reads `effect.statuses` set → maps each to `status_{statusId}`
- **Lifecycle:** Plays on status apply, stops on status remove
- **Restore:** `canvasReady` hook re-applies FX for any active statuses on scene load

## Focus Tracking System

Separate from FX but co-located in `focus-manager.mjs`. Tracks feature-based focus alongside the system's spell focus.

### API
```js
FocusManager.acquireFeatureFocus(actor, featureKey, label, icon)  // → boolean
FocusManager.releaseFeatureFocus(actor, featureKey)
FocusManager.hasFeatureFocus(actor, featureKey)                   // → boolean
FocusManager.getTotalFocusCount(actor)                            // spells + features
FocusManager.getRemainingFocusSlots(actor)                        // max - total
FocusManager.getFocusStatus(actor)                                // full debug object
```

### Exposed Module API
```js
game.vagabondCharacterEnhancer.focusAcquire(actor, key, label, icon)
game.vagabondCharacterEnhancer.focusRelease(actor, key)
game.vagabondCharacterEnhancer.focusStatus(actor)
game.vagabondCharacterEnhancer.focus  // FocusManager object directly
```

### Focus Flag Structure
```js
// flags.vagabond-character-enhancer.featureFocus
[
  { key: "hunter_huntersMark", label: "Hunter's Mark", icon: "icons/..." }
]
```

### Focus + Spells Shared Pool
- System tracks spells in `system.focus.spellIds[]`
- VCE tracks features in `flags.vagabond-character-enhancer.featureFocus[]`
- Combined count checked against `system.focus.max`
- `toggleSpellFocus` is patched to enforce combined cap
- "Focusing" status effect is synced when features hold focus but system would remove it

### Sheet UI Injection
- `renderApplicationV2` hook injects feature focus display into the character sheet sliding panel
- Shows focused features with icon + name + release button
- Updates focus pips to reflect combined spell + feature count

## Config Dialog (FeatureFxConfig)

### Registration
```js
// In vagabond-character-enhancer.mjs init hook:
game.settings.register(MODULE_ID, "featureFxConfig", { scope: "world", config: false, type: Object, default: {} });
game.settings.registerMenu(MODULE_ID, "featureFxConfigMenu", { type: FeatureFxConfig, restricted: true });
```

### UI Layout
```
Left nav: Global | Barbarian | Bard | Dancer | Druid | Hunter | Monster Attacks | Revelator | Status Effects
Right panel: Feature rows with:
  - Enable checkbox
  - Target dropdown (Caster/Target/Both)
  - Animation file picker + preview button
  - Scale slider (0.2-3.0)
  - Opacity, Fade In/Out inputs
  - Loop + Below Token checkboxes
  - Sound file picker + preview button
  - Volume slider (0-1)
Footer: Save | Save & Close | Cancel
```

### Save Flow
1. `FormDataExtended` reads form → flat object
2. `expandObject()` converts `{ "monster_bite.scale": 1.5 }` → `{ monster_bite: { scale: 1.5 } }`
3. Type coercion (booleans, numbers)
4. `game.settings.set()` stores to world setting
5. All active VCE effects are stopped and re-applied with new config

## Adding New FX Entries

### 1. Add default config
In `feature-fx-config.mjs` → `DEFAULT_FEATURE_FX`:
```js
myclass_myfeature: {
  label: "My Feature", class: "myclass", enabled: false, target: "caster",
  file: "modules/JB2A_DnD5e/Library/...",
  scale: 1, opacity: 0.7, persist: false, fadeIn: 800, fadeOut: 800, belowToken: true,
  sound: "", soundVolume: 0.6
}
```

### 2. Wire the trigger
In the class feature handler, import and call:
```js
import { FocusManager } from "../focus/focus-manager.mjs";

// At the trigger point:
FocusManager.playFeatureFX(actor, "myclass_myfeature", targetActor);

// For persistent effects, also wire the stop:
FocusManager.stopFeatureFX(actorId, "myclass_myfeature");
```

### 3. Class label (if new group)
In `feature-fx-config.mjs` → `#classLabel()`:
```js
if (cls === "_mygroup") return "My Group";
```

## Sequencer Integration Notes

- All Sequencer calls wrapped in `if (typeof Sequencer === "undefined") return;`
- Effects use `.attachTo(token)` so they follow token movement
- Named effects (`vce-fx-{featureKey}-{actorId}`) allow targeted stop/start
- Duplicate check: `Sequencer.EffectManager.getEffects({ name })` prevents stacking
- Sound uses Sequencer's `.sound().file().volume()` for proper volume control
- Graceful degradation: module works fully without Sequencer, just no visual/audio FX

## Default Animation Paths (JB2A Free)

| Animation | Path |
|-----------|------|
| Bless (focus glow) | `modules/JB2A_DnD5e/Library/1st_Level/Bless/Bless_01_Regular_Yellow_Loop_400x400.webm` |
| Red chain marker | `modules/JB2A_DnD5e/Library/Generic/Marker/MarkerChainStandard01_01_Regular_Red_Loop_400x400.webm` |
| Fire flames | `modules/JB2A_DnD5e/Library/Generic/Fire/Flame/Flames04_01_Regular_Orange_Loop_400x600.webm` |
| Bite | `modules/JB2A_DnD5e/Library/Generic/Creature/Bite_01_Regular_Red_400x400.webm` |
| Claws | `modules/JB2A_DnD5e/Library/Generic/Creature/Claws_01_Regular_Red_400x400.webm` |
| Claw (single) | `modules/JB2A_DnD5e/Library/Generic/Creature/Claw/CreatureAttackClaw_001_001_Red_800x600.webm` |
| Ground crack | `modules/JB2A_DnD5e/Library/Generic/Impact/GroundCrackImpact_01_Regular_Orange_600x600.webm` |
| Plant growth | `modules/JB2A_DnD5e/Library/Generic/Nature/PlantGrowthRoundLoop03_01_Regular_GreenYellow_500x500.webm` |
| Treble clef | `modules/JB2A_DnD5e/Library/Generic/Music_Notation/TrebleClef_01_Regular_Blue_200x200.webm` |
| Enchantment rune | `modules/JB2A_DnD5e/Library/Generic/Magic_Signs/Runes/EnchantmentRuneLoop_01_Regular_Pink_400x400.webm` |
| Bardic inspiration | `modules/JB2A_DnD5e/Library/1st_Level/Bardic_Inspiration/BardicInspiration_01_Regular_GreenOrange_400x400.webm` |
