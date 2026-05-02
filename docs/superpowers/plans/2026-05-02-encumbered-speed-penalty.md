# Encumbered Homebrew Speed Penalty Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in homebrew rule that drops a PC's base speed by 5 ft per inventory slot used over their max (cascading to crawl/travel) and marks them with an "Encumbered" status icon.

**Architecture:** A world setting gates two independent pieces — a `prepareDerivedData` patch on the character data model that mutates `speed.base/crawl/travel` post-prepare (mechanical), and an `EncumbranceManager` that reactively creates/deletes a managed AE carrying the `statuses: ["encumbered"]` icon (visual). Both are no-ops when the setting is off.

**Tech Stack:** Vagabond system v5.2.2+, Foundry VTT v13, ES modules. No build step, no test framework — verification is via the `foundry-mcp-bridge` against a live world.

**Spec:** [`docs/superpowers/specs/2026-05-02-encumbered-speed-penalty-design.md`](../specs/2026-05-02-encumbered-speed-penalty-design.md)

---

## File Structure

- **New:** `scripts/encumbrance/encumbrance-manager.mjs` — manager singleton: hooks, debounce, `refresh(actor)`, `sweepAll()`. Owns the visual icon via a managed AE.
- **Modified:** `scripts/vagabond-character-enhancer.mjs` — register the world setting in `init`; chain the speed patch onto the existing focus-cap patch in `ready`; init the manager + initial sweep in `ready`.
- **Modified:** `scripts/status-effects.mjs` — add a documentation-only entry for `encumbered` matching the file's existing convention. (Foundry doesn't consume this file; it's a reference for module contributors.)
- **Modified:** `languages/en.json` — add `VCE.Status.Encumbered` localization key.
- **Modified:** `CHANGELOG.md` — add v0.4.6 section.

The mechanical and visual paths are deliberately split because mutating an actor inside `prepareDerivedData` (where the math runs) cascades into infinite re-prep loops. The math runs during prepare; the icon is applied out-of-band via inventory-change hooks.

---

## Task 1: Register status, localization, and world setting

**Goal:** Add the documentation entry for `encumbered`, the localization key, and the world setting that gates the entire feature. After this task the setting is visible in Module Settings (default off) but has no behavioral effect.

**Files:**
- Modify: `scripts/status-effects.mjs` (append a new entry to `STATUS_EFFECTS_REGISTRY`)
- Modify: `languages/en.json` (add `VCE.Status.Encumbered` and the setting strings)
- Modify: `scripts/vagabond-character-enhancer.mjs` (register the setting in the existing `Hooks.once("init")` block)

**Acceptance Criteria:**
- [ ] `game.settings.get("vagabond-character-enhancer", "homebrewEncumbranceSpeedPenalty")` returns `false` on a fresh world.
- [ ] The setting appears in Module Settings → Vagabond Character Enhancer with the name "Homebrew: Encumbered Speed Penalty" and the spec's hint text.
- [ ] `game.i18n.localize("VCE.Status.Encumbered")` returns `"Encumbered"`.
- [ ] No new console errors / warnings on world load.

**Verify:**
After F5'ing the live world, run via the MCP bridge:

```js
return {
  setting: game.settings.get("vagabond-character-enhancer", "homebrewEncumbranceSpeedPenalty"),
  hasSettingDef: !!game.settings.settings.get("vagabond-character-enhancer.homebrewEncumbranceSpeedPenalty"),
  i18n: game.i18n.localize("VCE.Status.Encumbered"),
};
```

Expected after implementation: `{ setting: false, hasSettingDef: true, i18n: "Encumbered" }`.

**Steps:**

- [ ] **Step 1: Run the verify check on current `main` to confirm pre-state**

Via MCP `evaluate`:
```js
return {
  setting: (() => { try { return game.settings.get("vagabond-character-enhancer", "homebrewEncumbranceSpeedPenalty"); } catch (e) { return e.message; } })(),
  i18n: game.i18n.localize("VCE.Status.Encumbered"),
};
```
Expected (pre-implementation): `setting` is an error like `"is not a registered game setting"`, `i18n` returns the literal key `"VCE.Status.Encumbered"`.

- [ ] **Step 2: Add the status documentation entry**

In `scripts/status-effects.mjs`, append to `STATUS_EFFECTS_REGISTRY` (alphabetical order — fits between `dazed` and `fatigued` if those exist, otherwise at the end):

```js
  // ──────────────────────────────────────────────
  // Encumbered (homebrew, opt-in)
  // ──────────────────────────────────────────────
  // Marker for PCs carrying more inventory slots than their max.
  // Applied/removed by EncumbranceManager when the
  // "homebrewEncumbranceSpeedPenalty" world setting is enabled.
  //
  // AUTOMATION: fully_automated (when setting is on)
  // SYSTEM: Not registered in CONFIG.statusEffects — applied via a managed
  //   AE on the actor with statuses: ["encumbered"] so the icon renders on
  //   the token effect bar.
  // MODULE HANDLES (encumbrance-manager.mjs):
  //   - Reactively creates/deletes the AE on inventory changes.
  //   - Mechanical penalty (-5 ft / slot over) lives in prepareDerivedData
  //     patch in vagabond-character-enhancer.mjs.
  "encumbered": {
    id: "encumbered",
    icon: "icons/svg/anchor.svg",
    automation: "fully_automated",
    description: "Carrying more inventory slots than max. Base speed reduced by 5 ft per slot over (homebrew, opt-in)."
  },
```

- [ ] **Step 3: Add localization keys**

In `languages/en.json`, add inside `"VCE.Settings"`:

```json
"HomebrewEncumbranceSpeed": "Homebrew: Encumbered Speed Penalty",
"HomebrewEncumbranceSpeedHint": "Reduce base speed by 5 ft per inventory slot used over the actor's max. Crawl and travel pace cascade from the reduced base. Off = strict RAW.",
```

And add a top-level `"VCE.Status"` group (or extend an existing one if present) with:

```json
"Encumbered": "Encumbered",
```

If `"VCE.Status"` doesn't exist yet, add it as a sibling of `"VCE.Settings"`:

```json
"Status": {
  "Encumbered": "Encumbered"
},
```

- [ ] **Step 4: Register the world setting**

In `scripts/vagabond-character-enhancer.mjs`, locate the `Hooks.once("init", ...)` block. Find the existing `game.settings.register(MODULE_ID, "enableClassFeatures", ...)` call (or any existing setting registration) and add the new one immediately after:

```js
  game.settings.register(MODULE_ID, "homebrewEncumbranceSpeedPenalty", {
    name: "VCE.Settings.HomebrewEncumbranceSpeed",
    hint: "VCE.Settings.HomebrewEncumbranceSpeedHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    // onChange wired in Task 3 once EncumbranceManager exists. For now, no-op.
  });
```

The `onChange` is intentionally omitted in this task — wiring it requires `EncumbranceManager`, which lands in Task 3.

- [ ] **Step 5: Reload Foundry and run the verify check**

Via MCP `evaluate`:
```js
window.location.reload(); return "reloading";
```
Wait ~5 seconds, then run the verify check from the **Verify** section above. Confirm all three fields match expected.

- [ ] **Step 6: Commit**

```bash
git add scripts/status-effects.mjs languages/en.json scripts/vagabond-character-enhancer.mjs
git commit -m "$(cat <<'EOF'
feat(encumbrance): register homebrew speed-penalty setting + status docs

First task of v0.4.6 encumbered homebrew. Adds the world setting (default
off) plus the status-effects.mjs doc entry and en.json localization. No
behavioral effect yet — gating consumers land in subsequent commits.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Install the prepareDerivedData speed patch (mechanical penalty)

**Goal:** Chain a second prepareDerivedData patch onto the existing focus-cap patch so that, when the homebrew setting is on, every PC's `speed.base` drops by `5 × (occupiedSlots − maxSlots)` and `speed.crawl` / `speed.travel` cascade from the reduced base. Setting off → no-op.

**Files:**
- Modify: `scripts/vagabond-character-enhancer.mjs` (extend the `Hooks.once("ready")` patch block; the existing focus-cap patch is at lines ~466–491)

**Acceptance Criteria:**
- [ ] With setting OFF, every PC's `speed.base` matches the system's RAW computation (no change vs current behavior).
- [ ] With setting ON and a PC at `occupiedSlots === maxSlots`: no change to speed (penalty = 0).
- [ ] With setting ON and a PC at `occupiedSlots = maxSlots + 2`: `speed.base = max(0, originalBase − 10)`.
- [ ] With setting ON and a PC at `occupiedSlots = maxSlots + 100`: `speed.base = 0` (floored).
- [ ] `speed.crawl` and `speed.travel` reflect the reduced base via the homebrew-aware formulas.
- [ ] Toggling the setting + calling `actor.prepareData()` flips the penalty live.
- [ ] No new console errors during prepare.

**Verify:**

```js
const fighter = game.actors.getName("Fighter"); // any PC; Fighter is a representative one
const result = { actor: fighter.name };

// Snapshot current state
fighter.prepareData();
result.before = {
  occupied: fighter.system.inventory.occupiedSlots,
  max: fighter.system.inventory.maxSlots,
  base: fighter.system.speed.base,
  crawl: fighter.system.speed.crawl,
  travel: fighter.system.speed.travel,
};

// Setting ON
await game.settings.set("vagabond-character-enhancer", "homebrewEncumbranceSpeedPenalty", true);

// Force the actor over by stuffing slots — easiest is creating a junk equipment item with high slot count
const [junk] = await fighter.createEmbeddedDocuments("Item", [{
  name: "TEST: 99-slot brick",
  type: "equipment",
  system: { equipmentType: "gear", slots: 99 },
}]);

fighter.prepareData();
result.afterOver = {
  occupied: fighter.system.inventory.occupiedSlots,
  max: fighter.system.inventory.maxSlots,
  base: fighter.system.speed.base,
  crawl: fighter.system.speed.crawl,
  travel: fighter.system.speed.travel,
};

// Setting OFF — penalty disappears even though the brick is still there
await game.settings.set("vagabond-character-enhancer", "homebrewEncumbranceSpeedPenalty", false);
fighter.prepareData();
result.afterSettingOff = {
  base: fighter.system.speed.base,
  crawl: fighter.system.speed.crawl,
};

// Cleanup
await junk.delete();
return result;
```

Expected (assuming Fighter base = 25, max slots = 12, base brick adds 99 to occupied):
- `before`: original speed (e.g. `{ base: 25, crawl: 75, travel: 5 }`)
- `afterOver`: `base = 0` (floored — penalty is huge), `crawl: 0`, `travel: 0`, `occupied >> max`
- `afterSettingOff`: `base = 25` (RAW restored)

**Steps:**

- [ ] **Step 1: Run verify on current `main` to confirm pre-state**

Run the verify snippet above. Pre-implementation: `afterOver.base` should equal `before.base` (no penalty applied because the patch doesn't exist yet) — confirms the test is meaningful.

- [ ] **Step 2: Extend the prepareDerivedData patch chain**

In `scripts/vagabond-character-enhancer.mjs`, the existing focus-cap patch lives in the `Hooks.once("ready")` callback. Find it (search for `_vceFocusCapPatched`). Immediately after the `for (const a of game.actors)` re-derive sweep and before `} catch (e) { log("Focus", ...) }`, add a sibling patch block:

```js
        // ── Encumbrance speed penalty (homebrew, opt-in) ──────────────────────
        // Chain a second patch onto prepareDerivedData. After the focus-cap
        // adjustment runs, reduce speed.base by 5 ft per inventory slot over
        // max and recompute crawl/travel from the reduced base. Setting off
        // → no-op.
        //
        // Why post-prepare: the system computes speed.base at line ~1062
        // BEFORE inventory.maxSlots/occupiedSlots at line ~1100. An AE
        // targeting system.speed.bonus that referenced @inventory.* would
        // read stale data. By the time prepareDerivedData returns, both
        // fields are settled.
        if (!CharCls.prototype._vceEncumbranceSpeedPatched) {
          const prePrepare = CharCls.prototype.prepareDerivedData;
          CharCls.prototype.prepareDerivedData = function() {
            const ret = prePrepare.apply(this, arguments);
            try {
              if (game.settings.get(MODULE_ID, "homebrewEncumbranceSpeedPenalty")) {
                const occupied = this.inventory?.occupiedSlots ?? 0;
                const max = this.inventory?.maxSlots ?? 0;
                const over = Math.max(0, occupied - max);
                if (over > 0 && this.speed?.base != null) {
                  const penalty = over * 5;
                  const reducedBase = Math.max(0, this.speed.base - penalty);
                  this.speed.base = reducedBase;
                  // Recompute crawl/travel from the homebrew-aware formulas
                  // using the reduced base. Mirrors the system's logic at
                  // actor-character.mjs:1071-1080.
                  const speedRollData = { ...this.parent.getRollData(), speed: { base: reducedBase } };
                  const crawlFormula  = CONFIG.VAGABOND?.homebrew?.derivations?.crawl  ?? '@speed.base * 3';
                  const travelFormula = CONFIG.VAGABOND?.homebrew?.derivations?.travel ?? 'floor(@speed.base / 5)';
                  this.speed.crawl  = Math.max(0, this._evaluateSingleFormula(crawlFormula,  speedRollData));
                  this.speed.travel = Math.max(0, this._evaluateSingleFormula(travelFormula, speedRollData));
                }
              }
            } catch (e) {
              // Setting may not be registered during init-time prepares; non-fatal.
            }
            return ret;
          };
          CharCls.prototype._vceEncumbranceSpeedPatched = true;
          log("Encumbrance", "Patched character prepareDerivedData for homebrew speed penalty");
          // Re-derive existing PCs so the patch takes effect on world load
          // (same reason as the focus-cap sweep — actors prepared before this
          // point cache the un-penalized speed).
          for (const a of game.actors) {
            if (a.type === "character") {
              try { a.prepareData(); } catch (e) { /* per-actor failure non-fatal */ }
            }
          }
        }
```

The `_vceEncumbranceSpeedPatched` guard mirrors `_vceFocusCapPatched` — both are idempotent, so reloading without losing world state is safe.

- [ ] **Step 3: Reload Foundry**

```js
window.location.reload(); return "reloading";
```
Wait 5s.

- [ ] **Step 4: Run verify and confirm all expected values match**

Run the verify snippet. Confirm:
- `before` shows un-penalized speed
- `afterOver` shows speed = 0 with the brick item in inventory
- `afterSettingOff` shows speed restored to RAW
- Cleanup deleted the brick

- [ ] **Step 5: Commit**

```bash
git add scripts/vagabond-character-enhancer.mjs
git commit -m "$(cat <<'EOF'
feat(encumbrance): prepareDerivedData speed-penalty patch

Chains onto the existing focus-cap patch in the ready hook. When the
homebrew setting is on and a PC is over slots, drops speed.base by 5 ft
per slot over and recomputes crawl/travel from the reduced base.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Build EncumbranceManager + wire init/sweep/onChange

**Goal:** Create the singleton that maintains the visual "Encumbered" icon on every PC reactively (on inventory or fatigue changes), sweeps all PCs on world ready, and handles the setting-toggle case (re-derives speed + flips the icon globally).

**Files:**
- Create: `scripts/encumbrance/encumbrance-manager.mjs` (~100 lines)
- Modify: `scripts/vagabond-character-enhancer.mjs` (import + init + ready wiring + setting onChange)

**Acceptance Criteria:**
- [ ] With setting ON and a PC over slots, the actor has a managed AE named `"Encumbered"` with `statuses: ["encumbered"]` and `img: "icons/svg/anchor.svg"`.
- [ ] Removing items so the PC is no longer over slots deletes the AE within ~150ms.
- [ ] Increasing fatigue (which reduces `maxSlots`) flips a previously-fine PC to encumbered without an inventory change.
- [ ] Toggling the setting OFF clears the AE on every PC and re-derives speed; toggling ON re-applies it where appropriate.
- [ ] On world `ready`, every existing PC's encumbered state is correct (sweep ran).
- [ ] Only the GM client writes the AE (no duplicate creation across multiple connected clients).

**Verify:**

```js
const fighter = game.actors.getName("Fighter");
const result = { actor: fighter.name };

await game.settings.set("vagabond-character-enhancer", "homebrewEncumbranceSpeedPenalty", true);
await new Promise(r => setTimeout(r, 200));

// Stuff slots
const [junk] = await fighter.createEmbeddedDocuments("Item", [{
  name: "TEST: 99-slot brick",
  type: "equipment",
  system: { equipmentType: "gear", slots: 99 },
}]);
await new Promise(r => setTimeout(r, 300)); // debounce + write

const ae = () => fighter.effects.find(e => e.getFlag("vagabond-character-enhancer", "encumberedAE") === true);
result.whileOver = ae() ? {
  name: ae().name,
  img: ae().img,
  statuses: [...ae().statuses],
  hasIconStatus: fighter.statuses.has("encumbered"),
} : "NO AE";

// Remove item
await junk.delete();
await new Promise(r => setTimeout(r, 300));
result.afterRemove = {
  hasAE: !!ae(),
  hasIconStatus: fighter.statuses.has("encumbered"),
};

// Setting toggle test: stuff again, then disable setting, AE should clear
const [junk2] = await fighter.createEmbeddedDocuments("Item", [{
  name: "TEST: 99-slot brick #2",
  type: "equipment",
  system: { equipmentType: "gear", slots: 99 },
}]);
await new Promise(r => setTimeout(r, 300));
result.afterReSpawn = !!ae();

await game.settings.set("vagabond-character-enhancer", "homebrewEncumbranceSpeedPenalty", false);
await new Promise(r => setTimeout(r, 400));
result.afterSettingOff = {
  hasAE: !!ae(),
  speedBase: fighter.system.speed.base, // should be RAW, not penalized
};

// Cleanup
await junk2.delete();
return result;
```

Expected:
- `whileOver`: `{ name: "Encumbered", img: "icons/svg/anchor.svg", statuses: ["encumbered"], hasIconStatus: true }`
- `afterRemove`: `{ hasAE: false, hasIconStatus: false }`
- `afterReSpawn`: `true`
- `afterSettingOff`: `{ hasAE: false, speedBase: <RAW value> }`

**Steps:**

- [ ] **Step 1: Run verify on current `main` to confirm pre-state**

Run the verify snippet. Pre-implementation: `whileOver` is `"NO AE"` because nothing creates the AE yet. The setting toggle and item operations succeed but nothing observable.

- [ ] **Step 2: Create the EncumbranceManager file**

Create `scripts/encumbrance/encumbrance-manager.mjs`:

```js
/**
 * Encumbrance Manager
 *
 * Reactively maintains the "Encumbered" status icon on PCs whose
 * occupied inventory slots exceed max. Setting-gated by
 * `homebrewEncumbranceSpeedPenalty` (world, default off).
 *
 * The mechanical penalty (-5 ft base speed per slot over) lives in the
 * prepareDerivedData patch in vagabond-character-enhancer.mjs. This
 * file owns ONLY the visual icon — applied via a managed AE with
 * statuses: ["encumbered"] so Foundry renders it on the token effect
 * bar and the sheet's status row.
 *
 * Pattern mirrors FeatureDetector: per-actor debounce, GM-only writes,
 * idempotent refresh. Hooks watch inventory items and fatigue updates;
 * a sweep is also exposed for setting-toggle and ready-time bootstrap.
 */

import { MODULE_ID, log } from "../utils.mjs";

const ENCUMBERED_AE_FLAG = "encumberedAE";
const STATUS_ID = "encumbered";

export const EncumbranceManager = {
  _debounceTimers: new Map(),

  init() {
    Hooks.on("updateActor", (actor, changes) => {
      if (actor.type !== "character") return;
      // Only react to changes that can flip slot delta:
      // - fatigue (reduces maxSlots)
      // - might (changes baseMaxSlots)
      const fatigueChanged = foundry.utils.hasProperty(changes, "system.fatigue");
      const mightChanged   = foundry.utils.hasProperty(changes, "system.attributes.might");
      if (!fatigueChanged && !mightChanged) return;
      this._debounce(actor);
    });

    Hooks.on("createItem", (item) => {
      if (item.actor?.type === "character") this._debounce(item.actor);
    });
    Hooks.on("updateItem", (item, changes) => {
      if (item.actor?.type !== "character") return;
      // Only debounce if a change could affect slot count
      if (foundry.utils.hasProperty(changes, "system.slots") ||
          foundry.utils.hasProperty(changes, "system.baseSlots") ||
          foundry.utils.hasProperty(changes, "system.equipped")) {
        this._debounce(item.actor);
      }
    });
    Hooks.on("deleteItem", (item) => {
      if (item.actor?.type === "character") this._debounce(item.actor);
    });

    log("EncumbranceManager", "Hooks registered.");
  },

  _debounce(actor) {
    if (this._debounceTimers.has(actor.id)) {
      clearTimeout(this._debounceTimers.get(actor.id));
    }
    this._debounceTimers.set(actor.id, setTimeout(() => {
      this._debounceTimers.delete(actor.id);
      this.refresh(actor);
    }, 100));
  },

  /**
   * Compute the current encumbered state and create/delete the managed AE
   * to match. GM-only — non-GM clients no-op (the GM's refresh call writes
   * for everyone via the world database).
   */
  async refresh(actor) {
    if (!game.user.isGM) return;
    if (actor.type !== "character") return;

    const enabled = game.settings.get(MODULE_ID, "homebrewEncumbranceSpeedPenalty");
    const occupied = actor.system.inventory?.occupiedSlots ?? 0;
    const max = actor.system.inventory?.maxSlots ?? 0;
    const over = enabled ? Math.max(0, occupied - max) : 0;
    const wantStatus = over > 0;

    const existingAE = actor.effects.find(e =>
      e.getFlag(MODULE_ID, ENCUMBERED_AE_FLAG) === true
    );

    if (wantStatus && !existingAE) {
      await actor.createEmbeddedDocuments("ActiveEffect", [{
        name: game.i18n.localize("VCE.Status.Encumbered"),
        img: "icons/svg/anchor.svg",
        statuses: [STATUS_ID],
        changes: [],
        disabled: false,
        transfer: true,
        flags: {
          [MODULE_ID]: {
            managed: true,
            [ENCUMBERED_AE_FLAG]: true,
          },
        },
      }]);
      log("EncumbranceManager", `${actor.name}: encumbered ON (${over} slots over)`);
    } else if (!wantStatus && existingAE) {
      await existingAE.delete();
      log("EncumbranceManager", `${actor.name}: encumbered OFF`);
    }
  },

  /**
   * Refresh + re-derive every PC. Called on world ready and on setting
   * toggle.
   */
  async sweepAll() {
    if (!game.user.isGM) return;
    for (const actor of game.actors) {
      if (actor.type !== "character") continue;
      await this.refresh(actor);
      try { actor.prepareData(); } catch (e) { /* non-fatal */ }
    }
    log("EncumbranceManager", `Sweep complete (${game.actors.filter(a => a.type === "character").length} PCs)`);
  },
};
```

- [ ] **Step 3: Wire the manager into the module entry point**

In `scripts/vagabond-character-enhancer.mjs`, add the import near the top with the other feature imports:

```js
import { EncumbranceManager } from "./encumbrance/encumbrance-manager.mjs";
```

Then in the `Hooks.once("ready")` callback, AFTER both `prepareDerivedData` patches are installed (i.e., after the `_vceEncumbranceSpeedPatched` block from Task 2), add:

```js
    // Init encumbrance hooks + initial sweep
    try {
      EncumbranceManager.init();
      await EncumbranceManager.sweepAll();
    } catch (e) {
      log("EncumbranceManager", `Init failed: ${e.message}`);
    }
```

- [ ] **Step 4: Wire the setting onChange**

Back in the `Hooks.once("init")` block, replace the encumbrance setting registration from Task 1 with the version that includes `onChange`:

```js
  game.settings.register(MODULE_ID, "homebrewEncumbranceSpeedPenalty", {
    name: "VCE.Settings.HomebrewEncumbranceSpeed",
    hint: "VCE.Settings.HomebrewEncumbranceSpeedHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: () => EncumbranceManager.sweepAll(),
  });
```

- [ ] **Step 5: Reload Foundry**

```js
window.location.reload(); return "reloading";
```
Wait 5s.

- [ ] **Step 6: Run the verify snippet**

Run the verify snippet from the **Verify** section. Confirm:
- `whileOver` shows the AE with name `"Encumbered"`, `img: "icons/svg/anchor.svg"`, `statuses: ["encumbered"]`, and `hasIconStatus: true`.
- `afterRemove` shows the AE is gone (`hasAE: false`).
- `afterReSpawn` shows the AE comes back when the PC goes over slots again.
- `afterSettingOff` shows the AE is gone AND `speedBase` is the RAW value.

- [ ] **Step 7: Verify the icon renders on the actual token**

Via the MCP bridge, screenshot the canvas with a PC token that's encumbered:
```js
// Force a PC over, screenshot, then clean up
const fighter = game.actors.getName("Fighter");
await game.settings.set("vagabond-character-enhancer", "homebrewEncumbranceSpeedPenalty", true);
const [j] = await fighter.createEmbeddedDocuments("Item", [{ name: "VISUAL TEST", type: "equipment", system: { equipmentType: "gear", slots: 99 } }]);
await new Promise(r => setTimeout(r, 400));
return { hasIcon: fighter.statuses.has("encumbered") };
```

Expected: `{ hasIcon: true }`. Visually confirm in Foundry that the anchor icon is present on the Fighter token's effect bar. Then clean up:
```js
const fighter = game.actors.getName("Fighter");
const j = fighter.items.find(i => i.name === "VISUAL TEST");
if (j) await j.delete();
await game.settings.set("vagabond-character-enhancer", "homebrewEncumbranceSpeedPenalty", false);
```

- [ ] **Step 8: Commit**

```bash
git add scripts/encumbrance/encumbrance-manager.mjs scripts/vagabond-character-enhancer.mjs
git commit -m "$(cat <<'EOF'
feat(encumbrance): EncumbranceManager + setting wiring

Reactive AE-based "Encumbered" status icon. Hooks watch inventory items
and fatigue/might changes, debounced per-actor. World ready triggers a
sweep so existing PCs settle correctly on load. Setting toggle re-runs
the sweep so the icon and speed flip globally without F5.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: CHANGELOG entry

**Goal:** Document the v0.4.6 release in `CHANGELOG.md` with the same shape as v0.4.5.

**Files:**
- Modify: `CHANGELOG.md`

**Acceptance Criteria:**
- [ ] A new `## v0.4.6 — In Progress` section sits at the top of the file (above v0.4.5).
- [ ] Section explains what the homebrew setting does, mentions the cascade to crawl/travel, and notes the icon.
- [ ] Mirrors the prose style of prior entries (grouped by area, bold heading + bullet bodies).

**Verify:** Visual review of the diff. No code change.

**Steps:**

- [ ] **Step 1: Add the v0.4.6 section above v0.4.5**

In `CHANGELOG.md`, immediately after the `# Changelog` line and the blank line that follows, insert:

```markdown
## v0.4.6 — In Progress

### Encumbered (homebrew, opt-in)

New world setting **"Homebrew: Encumbered Speed Penalty"** (default off). When enabled, a PC's base speed drops by 5 ft for every inventory slot they're over their max. The penalty cascades to crawl and travel pace because the system derives both from base speed. Speed is floored at 0 — a PC carrying enough to fully zero out their movement simply can't move.

- **Status icon.** Encumbered PCs are marked with an anchor icon on the token effect bar and the sheet's status row. Reactive — applied/removed automatically on inventory or fatigue changes (~150ms debounce). The icon is purely visual; the mechanical penalty lives in `prepareDerivedData` so it composes with the rest of the speed pipeline.
- **Composes with Fatigue.** Fatigue already eats one inventory slot per stack in the system, so a Fatigued + over-encumbered PC compounds naturally.
- **Setting toggle is live.** Flipping the setting on/off sweeps every PC and re-derives — no F5 required.

```

(The blank line after the closing paragraph keeps formatting clean — the `### Familiar perk` section from v0.4.5 starts immediately below.)

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "$(cat <<'EOF'
docs(changelog): v0.4.6 in-progress — encumbered homebrew

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-review checklist (run before declaring "done")

- [ ] All 4 tasks pass their verify snippets.
- [ ] No new console errors / warnings on world load.
- [ ] Toggling the setting on a fresh actor works without an F5 (manager init + sweep covers this).
- [ ] Spec section 8 acceptance criteria are all satisfied:
  - [ ] Setting registered, default off.
  - [ ] OFF: no speed change, no status icon, no behavior difference from v0.4.5.
  - [ ] ON + at-or-under slots: no penalty, no icon.
  - [ ] ON + slots = max + 1: speed −5 ft, crawl/travel cascade, icon visible.
  - [ ] ON + slots = max + 6, base 30: speed = 0 (floored), still encumbered.
  - [ ] Inventory item add/remove updates the icon within ~150ms.
  - [ ] Increased fatigue flips a fine PC to encumbered without an inventory change.
  - [ ] Toggling OFF clears the icon and restores RAW speed for every PC.
  - [ ] No new console errors on world load.

After self-review passes, the actual v0.4.6 release commit (version bump in `module.json`, CHANGELOG header rename `In Progress` → final summary, build zip, push, GitHub release) is a separate step done at the user's discretion — not part of this plan.
