# Encumbered Homebrew Speed Penalty

**Status:** Draft
**Author:** `@DimitroffVodka` (with Claude)
**Date:** 2026-05-02
**Target version:** v0.4.6

---

## 1. Goal

Add an opt-in homebrew rule: **for every inventory slot a PC carries over their max, base speed drops by 5 ft.** The penalty cascades to crawl and travel pace. PCs over the limit are visibly marked with an "Encumbered" status icon on the token bar and the sheet.

---

## 2. Rule details

- `over = max(0, occupiedSlots - maxSlots)` — only slots *over* the cap apply; under-utilized slots don't grant a bonus.
- `penalty = over * 5` (feet).
- New `speed.base = max(0, originalBase - penalty)`. Floor at 0 — a PC carrying enough to zero out their movement simply can't move.
- `speed.crawl` and `speed.travel` are recomputed from the reduced base using the system's existing homebrew-aware formulas (default `base × 3` and `floor(base / 5)`).
- Fatigue already eats inventory slots in the system (`maxSlots = baseMaxSlots − fatigue`), so a Fatigued + over-encumbered PC compounds naturally — no extra logic needed.

---

## 3. World setting

```js
game.settings.register(MODULE_ID, "homebrewEncumbranceSpeedPenalty", {
  name: "Homebrew: Encumbered Speed Penalty",
  hint: "Reduce base speed by 5 ft per inventory slot used over the actor's max. Crawl and travel pace cascade from the reduced base. Off = strict RAW.",
  scope: "world",
  config: true,
  type: Boolean,
  default: false,
  onChange: () => EncumbranceManager.sweepAll(),
});
```

`onChange` triggers a sweep of every PC so the speed math + status icon settle to the new state immediately.

---

## 4. Components

### 4.1 `prepareDerivedData` patch (mechanical)
**File:** `scripts/vagabond-character-enhancer.mjs` — `Hooks.once("ready")` block, alongside the existing focus-cap patch.

```js
// In ready hook, after patching focus.max default cap…
const origPrepare = CharCls.prototype.prepareDerivedData;
CharCls.prototype.prepareDerivedData = function() {
  const ret = origPrepare.apply(this, arguments);
  if (game.settings.get(MODULE_ID, "homebrewEncumbranceSpeedPenalty")) {
    const occupied = this.inventory?.occupiedSlots ?? 0;
    const max = this.inventory?.maxSlots ?? 0;
    const over = Math.max(0, occupied - max);
    if (over > 0 && this.speed?.base != null) {
      const penalty = over * 5;
      const reducedBase = Math.max(0, this.speed.base - penalty);
      this.speed.base = reducedBase;
      // Recompute crawl/travel from the homebrew formulas using the reduced base
      const speedRollData = { ...this.parent.getRollData(), speed: { base: reducedBase } };
      const crawlFormula  = CONFIG.VAGABOND?.homebrew?.derivations?.crawl  ?? '@speed.base * 3';
      const travelFormula = CONFIG.VAGABOND?.homebrew?.derivations?.travel ?? 'floor(@speed.base / 5)';
      this.speed.crawl  = Math.max(0, this._evaluateSingleFormula(crawlFormula,  speedRollData));
      this.speed.travel = Math.max(0, this._evaluateSingleFormula(travelFormula, speedRollData));
    }
  }
  return ret;
};
```

Notes:
- Same patch shape as the v0.4.5 focus-cap fix — composes with the existing `_vceFocusCapPatched` chain.
- Setting check inside the patch: setting off → no-op, no need to install/uninstall.
- The post-prepare order is correct because `inventory.maxSlots`/`occupiedSlots` are computed mid-prepare (line ~1100 in the system), and our patch runs after the original returns.
- Speed is computed BEFORE inventory in the system, which is why we can't put this on `system.speed.bonus` as an AE — that field evaluates before slots are known.

### 4.2 Status effect registration (visual)
**File:** `scripts/status-effects.mjs`

Add to the `EXTRA_STATUS_EFFECTS` array (or wherever the existing definitions live):

```js
{
  id: "encumbered",
  name: "VCE.Status.Encumbered",
  icon: "icons/svg/anchor.svg",
}
```

No AE changes attached — purely a visual marker. The mechanical penalty lives in the `prepareDerivedData` patch.

Add the localization key to `languages/en.json`:
```json
"VCE.Status.Encumbered": "Encumbered"
```

### 4.3 `EncumbranceManager` (reactive status application)
**File:** `scripts/encumbrance/encumbrance-manager.mjs` (NEW, ~80 lines)

```js
import { MODULE_ID, log } from "../utils.mjs";

export const EncumbranceManager = {
  _debounceTimers: new Map(),

  init() {
    Hooks.on("updateActor", (actor, changes) => {
      if (actor.type !== "character") return;
      // Only react when something that affects slots/fatigue changes
      if (!changes.system?.fatigue && !changes.system?.attributes?.might) return;
      this._debounce(actor);
    });

    Hooks.on("createItem", (item) => {
      if (item.actor?.type === "character") this._debounce(item.actor);
    });
    Hooks.on("updateItem", (item) => {
      if (item.actor?.type === "character") this._debounce(item.actor);
    });
    Hooks.on("deleteItem", (item) => {
      if (item.actor?.type === "character") this._debounce(item.actor);
    });
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

  async refresh(actor) {
    if (!game.user.isGM) return;
    if (actor.type !== "character") return;

    const enabled = game.settings.get(MODULE_ID, "homebrewEncumbranceSpeedPenalty");
    const over = enabled
      ? Math.max(0, (actor.system.inventory?.occupiedSlots ?? 0) - (actor.system.inventory?.maxSlots ?? 0))
      : 0;
    const wantStatus = over > 0;
    const hasStatus = actor.statuses.has("encumbered");

    if (wantStatus !== hasStatus) {
      await actor.toggleStatusEffect("encumbered", { active: wantStatus });
      log("EncumbranceManager", `${actor.name}: encumbered=${wantStatus} (${over} slots over)`);
    }
  },

  async sweepAll() {
    if (!game.user.isGM) return;
    for (const actor of game.actors) {
      if (actor.type === "character") {
        await this.refresh(actor);
        actor.prepareData(); // re-derive so speed reflects current setting state
      }
    }
  },
};
```

### 4.4 Init wiring
**File:** `scripts/vagabond-character-enhancer.mjs`

- In `init` hook: register the world setting (with `onChange: () => EncumbranceManager.sweepAll()`).
- In `ready` hook (after the prepareDerivedData patch installs):
  - Call `EncumbranceManager.init()` to register hooks.
  - Call `EncumbranceManager.sweepAll()` to apply initial state to existing PCs.

---

## 5. Scope boundaries

- **PCs only.** NPCs (`type === "npc"`) use a different data model with no real inventory tracking — no need to wire them in.
- **Synthetic companion NPCs out of scope.** Animated objects, summoned creatures, raised undead — they use the npc schema and don't carry inventory.
- **No sheet UI line item.** The status icon is the entire visual signal. Players who want detail can hover the icon for the localized name; the inventory's existing `occupiedSlots / maxSlots` display already shows the over-state numerically.

---

## 6. Tradeoffs noted

- **Mechanical vs. visual split.** The speed math is in `prepareDerivedData`; the status icon is hook-driven. Keeping these separate avoids loops (mutating an actor inside `prepareDerivedData` cascades) and matches the v0.4.5 status-icon pattern (dynamic AEs for runtime state).
- **No AE-driven speed penalty.** Considered putting the penalty on `system.speed.bonus` via a managed AE, but that field is evaluated *before* `inventory.occupiedSlots`/`maxSlots` are computed in the same prepare pass, so an `@inventory.*`-formula AE would read stale data. The post-prepare patch sees both fields settled.
- **Setting toggle does a full sweep.** When the GM flips the setting, every PC's status + speed re-derives. With ~40 PCs in a typical world this is well under 100ms. If it ever becomes an issue, the sweep can be deferred to next-tick.

---

## 7. Files

- **New:**
  - `scripts/encumbrance/encumbrance-manager.mjs`
  - `docs/superpowers/specs/2026-05-02-encumbered-speed-penalty-design.md` (this file)
- **Modified:**
  - `scripts/vagabond-character-enhancer.mjs` — register setting + install patch + init manager
  - `scripts/status-effects.mjs` — add `encumbered` status definition
  - `languages/en.json` — add `VCE.Status.Encumbered`
  - `CHANGELOG.md` — v0.4.6 entry

---

## 8. Acceptance criteria

- [ ] Setting registered, default off; toggling ON triggers a world-wide sweep.
- [ ] With setting OFF: no speed change, no status icon, no behavior difference from v0.4.5.
- [ ] With setting ON and a PC at slots ≤ max: no penalty, no icon.
- [ ] With setting ON and a PC at slots = max + 1: speed reduced by 5 ft, crawl/travel cascade, "Encumbered" icon visible on token + sheet.
- [ ] With setting ON and a PC at slots = max + 6 with base speed 30: speed = 0 (floored), still encumbered.
- [ ] Adding/removing inventory items live updates the icon within ~150ms (debounce).
- [ ] Increasing fatigue (which lowers `maxSlots`) flips a previously fine PC to encumbered without an inventory change.
- [ ] Toggling the setting OFF clears the icon and restores RAW speed for every PC.
- [ ] No new console errors / warnings on world load.
