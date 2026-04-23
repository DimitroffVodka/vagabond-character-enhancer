# CompanionManager Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the CompanionManager engine (CompanionSpawner, CreaturePicker, termination manager) and unified Companions tab, then refactor existing Summoner + Familiar features onto the engine. Ship as v0.4.0. Phase 2 adapters (Beast, Animate, Raise, Conjurer, Reanimator, Animal Companion) are separate plans.

**Architecture:** Replace the current VCE-owned `vce-summon` tab (inline HTML injection in `summoner.mjs`) with a new `vce-companions` tab rendered from a source-agnostic renderer that reads `controllerActorId` flags (v0.3.4 additive). A new `CompanionSpawner` module consolidates the placeToken + updateActorFlags + combat-add pattern currently duplicated between Summoner and Familiar. Backward compat: v0.3.4 controller flags unchanged; existing `activeConjure` / `activeFamiliar` caster-side flags continue to be written so existing hook code keeps working.

**Tech Stack:** ES modules (.mjs), FoundryVTT v13 ApplicationV2, Vagabond system v5.0.0+. No test framework — verification via MCP bridge (`mcp__foundry-vtt__evaluate`, `mcp__foundry-vtt__screenshot_dom`) and manual smoke tests.

**Spec:** `docs/superpowers/specs/2026-04-23-companion-manager-design.md`

---

## File Structure

**New files (10):**
- `scripts/companion/companion-sources.mjs` — source registry constant + helpers
- `scripts/companion/creature-picker.mjs` — shared ApplicationV2 creature-selection dialog
- `scripts/companion/companion-spawner.mjs` — spawn/dismiss/query engine
- `scripts/companion/companion-termination.mjs` — termination triggers (zeroHP, ritualRecast)
- `scripts/companion/companion-manager-tab.mjs` — tab renderer (inline HTML injection)
- `templates/creature-picker.hbs` — template for shared picker
- Extensions to `styles/vagabond-character-enhancer.css` — `.vce-companion-card`, `.vce-companion-type-badge`, `.vce-save-btn`, HP gradient

**Modified files (5):**
- `scripts/class-features/summoner.mjs` — remove tab injection, use CompanionSpawner; keep activeConjure flag write
- `scripts/perk-features/familiar.mjs` — use CompanionSpawner; keep activeFamiliar flag write
- `scripts/vagabond-character-enhancer.mjs` — register CompanionManagerTab + CompanionTerminationManager in ready hook
- `CHANGELOG.md` — v0.4.0 section
- `module.json` — version bump 0.3.4 → 0.4.0

---

## Task 0: Preparation — audit current v0.3.4 state

**Goal:** Confirm v0.3.4 save routing is functional before we touch anything, so any regression we introduce is attributable.

**Files:** None (read-only audit).

**Acceptance Criteria:**
- [ ] Save routing smoke-test passes: cast damage at a flagged companion → save routes to controller PC (as in v0.3.4 Task 7 matrix)
- [ ] Current Summon tab renders correctly on a Summoner sheet
- [ ] Current Familiar ritual places a familiar with flags
- [ ] `git status` clean on `main`

**Verify:**
```bash
cd E:\FoundryVTTv13\data\Data\modules\vagabond-character-enhancer
git status  # expect: clean on main, at v0.3.4 tag
git log --oneline -5  # expect: 3293a39 v0.3.4 at top
```
Then in Foundry: summon a beast with Summoner, confirm it appears on canvas and the Summon tab shows it. Conjure a familiar via ritual, confirm flags. Attack the summon, trigger a save from the chat card, confirm controller rolls the save.

**Steps:**

- [ ] Step 1: Confirm working directory + branch + tag

```bash
cd E:\FoundryVTTv13\data\Data\modules\vagabond-character-enhancer
git status
git log --oneline -5
```
Expected: clean on main, recent commits include `3293a39 chore: v0.3.4`.

- [ ] Step 2: Smoke-test Summoner in Foundry

In Foundry: open a Summoner PC sheet → Summon tab → open creature picker → pick a HD 1 beast → confirm token appears on canvas, summon shows in Summon tab with portrait + HP + actions.

- [ ] Step 3: Smoke-test Familiar

In Foundry: open a Familiar perk owner sheet → invoke ritual → confirm token placed, flag `flags.vagabond-character-enhancer.activeFamiliar` written on caster.

- [ ] Step 4: Smoke-test save routing

Attack the summon/familiar with an NPC that triggers a save. Click the save button on the damage chat card. Confirm the save rolls on the controller PC's sheet (not on the NPC), and damage applies to the NPC.

- [ ] Step 5: No commit — this is verification only.

```json:metadata
{"files": [], "verifyCommand": "manual: confirm v0.3.4 working via Summoner + Familiar smoke tests", "acceptanceCriteria": ["Save routing functional", "Summon tab renders", "Familiar ritual works", "git clean on main"]}
```

---

## Task 1: Companion source registry

**Goal:** Create a pure-data constant defining all companion sources (badge color, controller type, skill, termination rules) so downstream code can be source-agnostic.

**Files:**
- Create: `scripts/companion/companion-sources.mjs`

**Acceptance Criteria:**
- [ ] `COMPANION_SOURCES` exported with 9 entries: `summoner`, `familiar`, `spell-beast`, `spell-animate`, `spell-raise`, `perk-conjurer`, `perk-reanimator`, `perk-animal-companion`, `hireling-manual`
- [ ] Each entry has `label`, `badgeColor`, `skill`, `controllerType`, `terminateOn`
- [ ] Fallback entry `legacy` for v0.3.4 companions without a sourceId
- [ ] Helper `getSourceMeta(sourceId)` returns entry or falls back to `legacy`
- [ ] No external imports — pure data + one helper

**Verify:** Import in Foundry console and log entries:
```js
const m = await import("/modules/vagabond-character-enhancer/scripts/companion/companion-sources.mjs");
console.log(Object.keys(m.COMPANION_SOURCES));       // → ["summoner", "familiar", ..., "legacy"]
console.log(m.getSourceMeta("summoner").label);       // → "Summon"
console.log(m.getSourceMeta("nonexistent").label);    // → "Companion" (legacy fallback)
```

**Steps:**

- [ ] Step 1: Create `scripts/companion/companion-sources.mjs`

```js
/**
 * Companion Source Registry
 * Pure-data definitions for every companion source (summons, familiars,
 * hirelings, etc.). Downstream code (spawner, tab renderer, termination
 * manager) is source-agnostic and reads config from here.
 */

export const COMPANION_SOURCES = Object.freeze({
  summoner: {
    label: "Summon",
    badgeColor: "#7b5e00",
    skill: "mana",
    controllerType: "companion",
    terminateOn: ["zeroHP"],
  },
  familiar: {
    label: "Familiar",
    badgeColor: "#4a2080",
    skill: "mana",
    controllerType: "companion",
    terminateOn: ["zeroHP", "ritualRecast"],
  },
  "spell-beast": {
    label: "Beast",
    badgeColor: "#2d5e3a",
    skill: "mana",
    controllerType: "companion",
    terminateOn: ["zeroHP", "duration"],
  },
  "spell-animate": {
    label: "Animated",
    badgeColor: "#2d4a7e",
    skill: "mana",
    controllerType: "companion",
    terminateOn: ["zeroHP", "duration"],
  },
  "spell-raise": {
    label: "Raised",
    badgeColor: "#5e1a1a",
    skill: "mana",
    controllerType: "companion",
    terminateOn: ["zeroHP", "duration"],
  },
  "perk-conjurer": {
    label: "Conjured",
    badgeColor: "#8a7b00",
    skill: "mana",
    controllerType: "companion",
    terminateOn: ["zeroHP"],
  },
  "perk-reanimator": {
    label: "Reanimated",
    badgeColor: "#4e1a1a",
    skill: "mana",
    controllerType: "companion",
    terminateOn: ["zeroHP", "shift"],
  },
  "perk-animal-companion": {
    label: "Companion",
    badgeColor: "#2d6e3a",
    skill: "mana",
    controllerType: "companion",
    terminateOn: ["zeroHP"],
  },
  "hireling-manual": {
    label: "Hireling",
    badgeColor: "#1a5a1a",
    skill: "leadership",
    controllerType: "hireling",
    terminateOn: [],
  },
  // Fallback for v0.3.4 companions without a sourceId
  legacy: {
    label: "Companion",
    badgeColor: "#5a5a5a",
    skill: null,
    controllerType: null,
    terminateOn: [],
  },
});

/**
 * Look up a source meta entry by id. Falls back to `legacy` for unknown ids.
 * @param {string} sourceId
 * @returns {object} source meta entry
 */
export function getSourceMeta(sourceId) {
  return COMPANION_SOURCES[sourceId] ?? COMPANION_SOURCES.legacy;
}
```

- [ ] Step 2: Verify via Foundry console (see Verify section above).

- [ ] Step 3: Commit

```bash
cd E:\FoundryVTTv13\data\Data\modules\vagabond-character-enhancer
git add scripts/companion/companion-sources.mjs
git commit -m "$(cat <<'EOF'
feat(companion): add source registry for unified companion system

Phase 1 foundation — defines badge color, skill routing, and
termination triggers per source. Downstream spawner and tab
renderer are source-agnostic and read from here.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

```json:metadata
{"files": ["scripts/companion/companion-sources.mjs"], "verifyCommand": "manual: import module, check Object.keys(COMPANION_SOURCES) and getSourceMeta('summoner').label", "acceptanceCriteria": ["9 sources + legacy fallback", "getSourceMeta works", "No external imports"]}
```

---

## Task 2: Shared CreaturePicker dialog

**Goal:** Extract the inline creature-picker code (currently duplicated in summoner.mjs lines 743–864 and familiar.mjs lines 211–317) into a single reusable ApplicationV2 dialog that takes a filter config.

**Files:**
- Create: `scripts/companion/creature-picker.mjs`
- Create: `templates/creature-picker.hbs`

**Acceptance Criteria:**
- [ ] `CreaturePicker.pick({ title, filter, favorites? })` returns a Promise resolving to `{ uuid, name }` or `null` on cancel
- [ ] Filter supports `{ types, sizes, maxHD, pack, customFilter }`
- [ ] Dialog shows creature rows with portrait, name, HD, size, pack label
- [ ] Search input filters rows live
- [ ] Row click selects + resolves promise
- [ ] Existing summoner/familiar code is **not yet** migrated — just the new dialog exists standalone
- [ ] Uses `HandlebarsApplicationMixin(ApplicationV2)` like `controller-dialog.mjs`

**Verify:** Call from console:
```js
const { CreaturePicker } = await import("/modules/vagabond-character-enhancer/scripts/companion/creature-picker.mjs");
const result = await CreaturePicker.pick({
  title: "Test Picker",
  filter: { types: ["beast"], maxHD: 2 }
});
console.log(result); // → { uuid, name } if selected; null if cancelled
```
Dialog appears with beast list, selecting one resolves the promise.

**Steps:**

- [ ] Step 1: Create `templates/creature-picker.hbs`

```hbs
<form class="vce-creature-picker">
  <div class="vce-cp-header">
    <input type="text" class="vce-cp-search" placeholder="Search…" autocomplete="off">
  </div>

  <div class="vce-cp-list" tabindex="0">
    {{#each creatures}}
      <div class="vce-cp-row" data-uuid="{{uuid}}" role="button" tabindex="0">
        <img src="{{img}}" class="vce-cp-img" alt="{{name}}">
        <div class="vce-cp-info">
          <div class="vce-cp-name">{{name}}</div>
          <div class="vce-cp-meta">HD {{hd}} · {{size}} · {{sourceLabel}}</div>
        </div>
      </div>
    {{else}}
      <div class="vce-cp-empty">No creatures match the filter.</div>
    {{/each}}
  </div>

  <footer class="vce-cp-footer">
    <button type="button" class="vce-cp-cancel" data-action="cancel">Cancel</button>
  </footer>
</form>
```

- [ ] Step 2: Create `scripts/companion/creature-picker.mjs`

```js
/**
 * CreaturePicker — shared creature-selection dialog.
 *
 * Replaces inline picker code duplicated in summoner.mjs + familiar.mjs.
 * Takes a filter config, returns { uuid, name } promise.
 */

import { MODULE_ID, log } from "../utils.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

class CreaturePickerDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(filter, resolve) {
    super({
      id: `vce-creature-picker-${foundry.utils.randomID()}`,
      window: { title: filter.title ?? "Select a Creature" },
      position: { width: 420, height: 540 },
      classes: ["vce-creature-picker-app"],
    });
    this._filter = filter;
    this._resolve = resolve;
    this._closedWithoutSelect = true;
  }

  static PARTS = {
    form: { template: `modules/${MODULE_ID}/templates/creature-picker.hbs` },
  };

  async _prepareContext() {
    const creatures = await this._gatherCandidates();
    return { creatures };
  }

  async _gatherCandidates() {
    const { types = [], sizes = [], maxHD, pack, customFilter } = this._filter;
    const out = [];

    // World NPC actors
    for (const actor of game.actors.filter(a => a.type === "npc")) {
      if (!this._matches(actor, { types, sizes, maxHD, customFilter })) continue;
      out.push(this._toRow(actor, "World"));
    }

    // Compendium pack (if specified)
    if (pack) {
      const compendium = game.packs.get(pack);
      if (compendium) {
        const docs = await compendium.getDocuments();
        for (const actor of docs) {
          if (actor.type !== "npc") continue;
          if (!this._matches(actor, { types, sizes, maxHD, customFilter })) continue;
          out.push(this._toRow(actor, compendium.metadata.label));
        }
      }
    }

    // Sort: HD ascending, then name
    out.sort((a, b) => (a.hd - b.hd) || a.name.localeCompare(b.name));
    return out;
  }

  _matches(actor, { types, sizes, maxHD, customFilter }) {
    if (types.length) {
      const beingType = (actor.system?.beingType ?? "").toLowerCase();
      if (!types.some(t => beingType.includes(t.toLowerCase()))) return false;
    }
    if (sizes.length) {
      const size = (actor.system?.size ?? "").toLowerCase();
      if (!sizes.some(s => s === size)) return false;
    }
    if (typeof maxHD === "number") {
      const hd = actor.system?.hitDice?.value ?? actor.system?.hd ?? 0;
      if (hd > maxHD) return false;
    }
    if (typeof customFilter === "function" && !customFilter(actor)) return false;
    return true;
  }

  _toRow(actor, sourceLabel) {
    return {
      uuid: actor.uuid,
      name: actor.name,
      img: actor.img,
      hd: actor.system?.hitDice?.value ?? actor.system?.hd ?? 0,
      size: actor.system?.size ?? "medium",
      sourceLabel,
    };
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const root = this.element;

    // Row click
    root.querySelectorAll(".vce-cp-row").forEach(row => {
      row.addEventListener("click", () => {
        const uuid = row.dataset.uuid;
        const name = row.querySelector(".vce-cp-name")?.textContent ?? "Unknown";
        this._closedWithoutSelect = false;
        this._resolve({ uuid, name });
        this.close();
      });
    });

    // Search filter
    const search = root.querySelector(".vce-cp-search");
    search?.addEventListener("input", (ev) => {
      const q = ev.target.value.toLowerCase();
      root.querySelectorAll(".vce-cp-row").forEach(row => {
        const name = row.querySelector(".vce-cp-name")?.textContent.toLowerCase() ?? "";
        row.style.display = name.includes(q) ? "" : "none";
      });
    });

    // Cancel button
    root.querySelector('[data-action="cancel"]')?.addEventListener("click", () => this.close());
  }

  async close(options) {
    if (this._closedWithoutSelect) this._resolve(null);
    return super.close(options);
  }
}

/**
 * Public API.
 * @param {object} opts
 * @param {string} [opts.title] - Dialog title
 * @param {object} opts.filter - { types, sizes, maxHD, pack, customFilter }
 * @returns {Promise<{uuid: string, name: string} | null>}
 */
export const CreaturePicker = {
  async pick(opts) {
    return new Promise((resolve) => {
      const dialog = new CreaturePickerDialog({ ...opts.filter, title: opts.title }, resolve);
      dialog.render(true);
    });
  }
};
```

- [ ] Step 3: Verify via Foundry console

```js
const m = await import("/modules/vagabond-character-enhancer/scripts/companion/creature-picker.mjs");
const result = await m.CreaturePicker.pick({
  title: "Pick a Beast",
  filter: { types: ["beast"], maxHD: 2 }
});
console.log("Picked:", result);
```
Expected: dialog opens, list populated with HD ≤ 2 beasts, selecting one closes dialog and logs `{ uuid, name }`.

- [ ] Step 4: Commit

```bash
git add scripts/companion/creature-picker.mjs templates/creature-picker.hbs
git commit -m "$(cat <<'EOF'
feat(companion): add shared CreaturePicker dialog

Extracts the inline picker code duplicated between summoner.mjs
and familiar.mjs into a reusable ApplicationV2 dialog. Takes a
filter config (types, sizes, maxHD, pack, customFilter) and
returns a UUID promise.

Not yet wired up to existing callers — that happens in the
Summoner and Familiar refactor tasks.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

```json:metadata
{"files": ["scripts/companion/creature-picker.mjs", "templates/creature-picker.hbs"], "verifyCommand": "manual: call CreaturePicker.pick({...}) from console, confirm dialog + resolution", "acceptanceCriteria": ["Returns uuid or null", "Filter config works", "Search filters rows live", "ApplicationV2 pattern"]}
```

---

## Task 3: CompanionSpawner engine

**Goal:** Create the unified spawn/dismiss/query engine that consolidates placeToken + updateActorFlags + combat-add logic currently duplicated between Summoner and Familiar.

**Files:**
- Create: `scripts/companion/companion-spawner.mjs`

**Acceptance Criteria:**
- [ ] `CompanionSpawner.spawn({ caster, sourceId, creatureUuid, tokenData?, cost?, duration?, meta? })` returns `{ tokenId, actorId, success, error? }`
- [ ] Writes `controllerActorId`, `controllerType`, and new `companionMeta` flags atomically on the spawned actor (via `gmRequest("updateActorFlags", ...)`)
- [ ] `companionMeta` includes `sourceId`, `skill`, `spawnedAt`, `sceneId`, `tokenId`, `terminateOn`, `cost`, `duration`, `meta`
- [ ] Looks up controllerType + skill + terminateOn from `COMPANION_SOURCES[sourceId]` — doesn't require caller to pass them
- [ ] `CompanionSpawner.dismiss(actor, { reason })` removes token via gmRequest, posts chat notification
- [ ] `CompanionSpawner.getCompanionsFor(pcActor)` returns array of companion entries (scans scene + world actors for matching `controllerActorId`)
- [ ] Multi-companion check: if caster already has a companion with the same `sourceId`, prompt via `Dialog.confirm` — "Replace active {source}?" — and dismiss old before spawning new
- [ ] Non-fatal error handling: token already exists but flag write fails → return `{ success: false, error }` but leave token

**Verify:** Full spawn + dismiss cycle via console:
```js
const { CompanionSpawner } = await import("/modules/vagabond-character-enhancer/scripts/companion/companion-spawner.mjs");
const pc = game.actors.getName("MrLawyerGuy");

// Spawn
const result = await CompanionSpawner.spawn({
  caster: pc,
  sourceId: "summoner",
  creatureUuid: "Compendium.vagabond-character-enhancer.vce-beasts.Actor.SOMEID",
});
console.log(result);  // { tokenId, actorId, success: true }

// Query
const companions = CompanionSpawner.getCompanionsFor(pc);
console.log(companions);  // array with the spawned companion

// Dismiss
await CompanionSpawner.dismiss(companions[0].actor, { reason: "test" });
```

**Steps:**

- [ ] Step 1: Create `scripts/companion/companion-spawner.mjs`

```js
/**
 * CompanionSpawner — unified spawn / dismiss / query engine.
 *
 * Consolidates the placeToken + updateActorFlags + combat-add pattern
 * duplicated between summoner.mjs and familiar.mjs. Feature adapters
 * (summoner, familiar, spell-beast, etc.) call spawn(config) and get
 * a placed, flagged, combat-ready companion back.
 */

import { MODULE_ID, log } from "../utils.mjs";
import { gmRequest } from "../socket-relay.mjs";
import { COMPANION_SOURCES, getSourceMeta } from "./companion-sources.mjs";

export const CompanionSpawner = {
  /**
   * Spawn a companion.
   *
   * @param {object} opts
   * @param {Actor} opts.caster - The PC
   * @param {string} opts.sourceId - key into COMPANION_SOURCES
   * @param {string} opts.creatureUuid - world actor or compendium UUID
   * @param {object} [opts.tokenData] - optional token data overrides
   * @param {object} [opts.cost] - { mana?, ritual?, duration? }
   * @param {object} [opts.duration] - { rounds } for timed companions
   * @param {object} [opts.meta] - source-specific extras
   * @returns {Promise<{tokenId, actorId, success, error?}>}
   */
  async spawn({ caster, sourceId, creatureUuid, tokenData = {}, cost = {}, duration = null, meta = {} }) {
    const sourceMeta = getSourceMeta(sourceId);
    if (sourceMeta === COMPANION_SOURCES.legacy) {
      return { success: false, error: `Unknown sourceId: ${sourceId}` };
    }

    // Multi-companion check: same source already active?
    const existing = this.getCompanionsFor(caster).filter(c => c.sourceId === sourceId);
    if (existing.length) {
      const replace = await foundry.applications.api.DialogV2.confirm({
        window: { title: "Replace active companion?" },
        content: `<p>You already have an active ${sourceMeta.label}. Replace it?</p>`,
      });
      if (!replace) return { success: false, error: "User cancelled replacement" };
      for (const e of existing) await this.dismiss(e.actor, { reason: "replaced" });
    }

    // Resolve creature
    const doc = await fromUuid(creatureUuid);
    if (!doc) return { success: false, error: `Could not resolve ${creatureUuid}` };

    // Import into world if from compendium
    let actorId;
    if (doc.pack) {
      const imported = await gmRequest("importActor", { uuid: creatureUuid });
      if (imported.error) return { success: false, error: imported.error };
      actorId = imported.actorId;
    } else {
      actorId = doc.id;
    }

    // Place token on caster's scene
    const scene = game.scenes.active;
    if (!scene) return { success: false, error: "No active scene" };

    const casterToken = scene.tokens.find(t => t.actorId === caster.id);
    const casterPos = casterToken ? { x: casterToken.x, y: casterToken.y } : { x: scene.width / 2, y: scene.height / 2 };

    // Default: place adjacent to caster, 1 grid offset right
    const gridSize = scene.grid.size;
    const defaultTokenData = {
      actorId,
      x: casterPos.x + gridSize,
      y: casterPos.y,
      ...tokenData,
    };

    const placeResult = await gmRequest("placeToken", {
      sceneId: scene.id,
      tokenData: defaultTokenData,
    });
    if (placeResult.error) return { success: false, error: placeResult.error };

    const tokenId = placeResult.tokenId;

    // Stamp flags atomically
    const companionMeta = {
      sourceId,
      skill: sourceMeta.skill,
      spawnedAt: Date.now(),
      sceneId: scene.id,
      tokenId,
      terminateOn: [...sourceMeta.terminateOn],
      cost: { ...cost },
      duration,
      meta: { ...meta },
    };

    const flagResult = await gmRequest("updateActorFlags", {
      actorId,
      scope: MODULE_ID,
      flags: {
        controllerActorId: caster.id,
        controllerType: sourceMeta.controllerType,
        companionMeta,
      },
    });
    if (flagResult.error) {
      log("CompanionSpawner", `Flag write failed but token placed: ${flagResult.error}`);
      return { tokenId, actorId, success: false, error: flagResult.error };
    }

    // Chat notification
    const worldActor = game.actors.get(actorId);
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: caster }),
      content: `<div class="vce-companion-spawned"><strong>${caster.name}</strong> ${sourceMeta.label === "Hireling" ? "engages" : "conjures"} <strong>${worldActor?.name ?? "a companion"}</strong> <em>(${sourceMeta.label})</em>.</div>`,
    });

    log("CompanionSpawner", `Spawned ${sourceId} ${worldActor?.name ?? actorId} for ${caster.name}`);
    return { tokenId, actorId, success: true };
  },

  /**
   * Dismiss a companion — remove its token, clear flags, post notification.
   *
   * @param {Actor} actor - the companion's world actor
   * @param {object} [opts]
   * @param {string} [opts.reason] - "defeated" | "replaced" | "manual" | etc.
   */
  async dismiss(actor, { reason = "manual" } = {}) {
    if (!actor) return;
    const meta = actor.getFlag(MODULE_ID, "companionMeta");
    const controllerId = actor.getFlag(MODULE_ID, "controllerActorId");
    const controller = controllerId ? game.actors.get(controllerId) : null;

    // Remove token from scene
    if (meta?.sceneId && meta?.tokenId) {
      try {
        await gmRequest("removeToken", { sceneId: meta.sceneId, tokenId: meta.tokenId });
      } catch (e) {
        log("CompanionSpawner", `Could not remove token: ${e.message}`);
      }
    }

    // Clear flags atomically
    try {
      await gmRequest("updateActorFlags", {
        actorId: actor.id,
        scope: MODULE_ID,
        flags: {
          controllerActorId: null,
          controllerType: null,
          companionMeta: null,
        },
      });
    } catch (e) {
      log("CompanionSpawner", `Flag clear failed: ${e.message}`);
    }

    // Chat notification
    const label = meta?.sourceId ? getSourceMeta(meta.sourceId).label : "companion";
    const verbMap = { defeated: "falls in battle", replaced: "is replaced", manual: "is dismissed", test: "is dismissed" };
    const verb = verbMap[reason] ?? "is dismissed";
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: controller ?? actor }),
      content: `<div class="vce-companion-dismissed"><strong>${actor.name}</strong> <em>(${label})</em> ${verb}.</div>`,
    });
  },

  /**
   * Get all companions flagged to a PC.
   * Scans the active scene's tokens + world actors for matching controllerActorId.
   *
   * @param {Actor} pcActor
   * @returns {Array<{actor, tokenId?, sourceId, sourceMeta, hp, maxHP, armor, statuses}>}
   */
  getCompanionsFor(pcActor) {
    if (!pcActor) return [];
    const out = [];
    const seen = new Set();

    const collect = (actor, tokenId) => {
      if (!actor || seen.has(actor.id)) return;
      if (actor.getFlag(MODULE_ID, "controllerActorId") !== pcActor.id) return;
      seen.add(actor.id);

      const meta = actor.getFlag(MODULE_ID, "companionMeta");
      const controllerType = actor.getFlag(MODULE_ID, "controllerType");
      // Smart fallback: if no companionMeta, map controllerType → hireling-manual or legacy.
      // Handles hirelings set via the Save Controller dialog (v0.3.4 path) that never
      // wrote a companionMeta — the dialog writes only controllerActorId + controllerType.
      const sourceId = meta?.sourceId
        ?? (controllerType === "hireling" ? "hireling-manual" : "legacy");
      const sourceMeta = getSourceMeta(sourceId);

      out.push({
        actor,
        tokenId: tokenId ?? meta?.tokenId,
        sourceId,
        sourceMeta,
        hp: actor.system?.health?.value ?? 0,
        maxHP: actor.system?.health?.max ?? 0,
        armor: actor.system?.armor?.value ?? 0,
        statuses: Array.from(actor.statuses ?? []),
      });
    };

    // Scene tokens (linked + unlinked)
    for (const scene of game.scenes) {
      for (const tok of scene.tokens) {
        collect(tok.actor, tok.id);
      }
    }
    // World actors not tied to a scene token
    for (const actor of game.actors) {
      collect(actor, null);
    }

    return out;
  },
};
```

- [ ] Step 2: Verify spawn + query + dismiss cycle via Foundry console

```js
const { CompanionSpawner } = await import("/modules/vagabond-character-enhancer/scripts/companion/companion-spawner.mjs");
const pc = game.actors.getName("MrLawyerGuy");

// Find a beast UUID to test with
const beastPack = game.packs.get("vagabond-character-enhancer.vce-beasts");
const beasts = await beastPack.getIndex();
const firstBeast = `Compendium.vagabond-character-enhancer.vce-beasts.Actor.${beasts.contents[0]._id}`;

const result = await CompanionSpawner.spawn({
  caster: pc,
  sourceId: "summoner",
  creatureUuid: firstBeast,
});
console.log(result); // { tokenId, actorId, success: true }

const companions = CompanionSpawner.getCompanionsFor(pc);
console.log(companions.length); // → 1
console.log(companions[0].sourceId); // → "summoner"

await CompanionSpawner.dismiss(companions[0].actor, { reason: "test" });
console.log(CompanionSpawner.getCompanionsFor(pc).length); // → 0
```

- [ ] Step 3: Commit

```bash
git add scripts/companion/companion-spawner.mjs
git commit -m "$(cat <<'EOF'
feat(companion): add CompanionSpawner engine

Unified spawn / dismiss / query engine for all companion types.
Consolidates placeToken + updateActorFlags + combat-add pattern
currently duplicated between Summoner and Familiar.

- spawn({ caster, sourceId, creatureUuid, ... }): places token,
  stamps controller + companionMeta flags, posts chat notification,
  prompts to replace if same-source companion already active
- dismiss(actor, { reason }): removes token, clears flags,
  posts dismissal chat notification
- getCompanionsFor(pcActor): scans scene tokens + world actors
  for matching controllerActorId, returns full companion entries

Not yet wired up to Summoner or Familiar — happens in later tasks.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

```json:metadata
{"files": ["scripts/companion/companion-spawner.mjs"], "verifyCommand": "manual: spawn+query+dismiss cycle via console", "acceptanceCriteria": ["spawn returns tokenId + actorId", "flags written atomically", "getCompanionsFor scans tokens + world", "dismiss removes token + clears flags", "multi-companion replace prompt"]}
```

---

## Task 4: Companion termination manager

**Goal:** Wire up automatic termination for companions — zeroHP triggers auto-dismiss, ritualRecast is enforced via spawn's replace prompt (already handled). Duration/manaLapse/shift are stubbed but dormant in Phase 1.

**Files:**
- Create: `scripts/companion/companion-termination.mjs`

**Acceptance Criteria:**
- [ ] Single `Hooks.on("updateActor")` listener reads `companionMeta.terminateOn`
- [ ] zeroHP: when `system.health.value` drops from >0 to 0 → call `CompanionSpawner.dismiss(actor, { reason: "defeated" })`
- [ ] Only fires on GM client (to avoid multi-fire)
- [ ] Other triggers (duration, manaLapse, shift) are stubbed with a `log()` noop so future implementation is obvious
- [ ] `CompanionTerminationManager.init()` registers the hook and is called from main entry ready hook

**Verify:** Spawn a companion, damage it to 0 HP via `actor.update({ "system.health.value": 0 })`, confirm auto-dismiss fires (token removed, flags cleared).

**Steps:**

- [ ] Step 1: Create `scripts/companion/companion-termination.mjs`

```js
/**
 * CompanionTerminationManager — auto-dismiss on trigger conditions.
 *
 * Phase 1 wired: zeroHP, ritualRecast (handled in spawner's replace flow).
 * Phase 1 stubbed: duration, manaLapse, shift (future work).
 */

import { MODULE_ID, log } from "../utils.mjs";
import { CompanionSpawner } from "./companion-spawner.mjs";

export const CompanionTerminationManager = {
  init() {
    if (!game.user.isGM) return;  // only GM runs termination
    Hooks.on("updateActor", this._onUpdateActor.bind(this));
    log("CompanionTerminationManager", "Termination hooks registered (GM)");
  },

  async _onUpdateActor(actor, changes) {
    const meta = actor.getFlag(MODULE_ID, "companionMeta");
    // Bails cleanly on already-dismissed companions because dismiss() clears the flag,
    // so subsequent HP-to-0 updates won't pass this guard — no double-fire.
    if (!meta?.terminateOn?.length) return;

    // zeroHP trigger — fires when this update changes HP to 0.
    //
    // DEFERRED 250ms: mirrors the pattern in SummonerFeatures / FamiliarFeatures.
    // The Vagabond system's own updateActor hook runs toggleStatusEffect('dead')
    // in parallel with this one. For unlinked-token companions, that AE create
    // resolves its parent UUID via Scene.X.Token.Y.ActorDelta... — which fails
    // if we've already deleted the token. Throws:
    //   "undefined id [tokenId] does not exist in the EmbeddedCollection"
    // Deferring 250ms lets the system's async work finish before we wipe the token.
    if (meta.terminateOn.includes("zeroHP")) {
      const newHP = foundry.utils.getProperty(changes, "system.health.value");
      if (newHP === 0) {
        log("CompanionTerminationManager", `${actor.name} reached 0 HP — auto-dismissing (deferred 250ms)`);
        setTimeout(() => CompanionSpawner.dismiss(actor, { reason: "defeated" }), 250);
        return;
      }
    }

    // duration / manaLapse / shift — stubs (Phase 2)
    if (meta.terminateOn.includes("duration")) {
      // TODO Phase 2: check duration.rounds against combat round counter
    }
    if (meta.terminateOn.includes("manaLapse")) {
      // TODO Phase 2: check caster's mana vs cost.mana upkeep
    }
    if (meta.terminateOn.includes("shift")) {
      // TODO Phase 2: hook on rest/long-rest and dismiss
    }
  },
};
```

- [ ] Step 2: Verify in Foundry console (after also running Task 7 registration, or run before to ensure init works standalone)

```js
// Spawn a companion first (via Task 3's verify snippet), then:
const companions = game.actors.filter(a => a.getFlag(MODULE_ID, "controllerActorId"));
const companion = companions[0];
const hpBefore = companion.system.health.value;
await companion.update({ "system.health.value": 0 });
// Wait a moment — termination hook fires asynchronously
await new Promise(r => setTimeout(r, 500));
console.log("Flags after:", companion.getFlag(MODULE_ID, "controllerActorId")); // → undefined (cleared)
```

- [ ] Step 3: Commit

```bash
git add scripts/companion/companion-termination.mjs
git commit -m "$(cat <<'EOF'
feat(companion): add termination manager — zeroHP auto-dismiss

Phase 1 wires zeroHP trigger: when a flagged companion's HP
drops from >0 to 0, auto-dismiss fires (removes token, clears
flags, posts chat notification).

Duration / manaLapse / shift triggers are stubbed noop — planned
for Phase 2 adapters.

GM-only listener to avoid multi-client duplicate dismissal.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

```json:metadata
{"files": ["scripts/companion/companion-termination.mjs"], "verifyCommand": "manual: set companion HP to 0, confirm auto-dismiss fires", "acceptanceCriteria": ["zeroHP triggers dismiss", "GM-only listener", "Other triggers stubbed"]}
```

---

## Task 5: CompanionManager tab renderer

**Goal:** Build the Companions tab renderer that replaces the current Summon tab. Reads `getCompanionsFor(pc)` and injects inline HTML cards into the character sheet.

**Files:**
- Create: `scripts/companion/companion-manager-tab.mjs`

**Acceptance Criteria:**
- [ ] `CompanionManagerTab.init()` registers a `renderApplicationV2` hook filtering to `app.document?.type === "character"`
- [ ] Injects a nav tab link `<a data-action="tab" data-tab="vce-companions" data-group="primary">Companions</a>`
- [ ] Injects a tab content panel `<section class="tab vce-companions-tab scrollable" data-tab="vce-companions" data-group="primary">`
- [ ] Panel renders one `.vce-companion-card` per companion from `getCompanionsFor(pc)`
- [ ] Card layout matches spec section 3.3: NPC banner header, HP row, controller note, save buttons row, actions section
- [ ] Actions section:
  - For NPC-type companions (summon/familiar/beast/etc.): render `actor.items.filter(i => ["weapon","featureAction"].includes(i.type))` as `.vce-bf-action` rows (existing pattern)
  - For character-type companions (hirelings): render `actor.items.filter(i => i.type === "weapon" && i.system.equipped)` and `actor.items.filter(i => i.type === "spell")` as two separate sub-sections
- [ ] Save buttons trigger existing save-routing pipeline (create a chat card with the save, routing handles the rest — v0.3.4 preserved)
- [ ] Dismiss button calls `CompanionSpawner.dismiss(actor, { reason: "manual" })`
- [ ] Sheet button calls `actor.sheet.render(true)`
- [ ] Empty state when no companions: "You have no active companions. Cast a summoning spell or conjure a familiar."
- [ ] Re-renders on `updateActor` / `createToken` / `deleteToken` / `updateToken` for flagged actors on the visible character sheet

**Verify:** Open a PC sheet with active companion, click Companions tab, confirm cards render. Click Dismiss on a card, confirm companion removed and tab re-renders empty.

**Steps:**

- [ ] Step 1: Create `scripts/companion/companion-manager-tab.mjs`

```js
/**
 * CompanionManagerTab — renders the Companions tab on character sheets.
 *
 * Replaces the current Summon tab (vce-summon). Reads flagged companions
 * via CompanionSpawner.getCompanionsFor(pc) and injects inline HTML cards.
 * Source-agnostic: same renderer handles summons, familiars, hirelings.
 */

import { MODULE_ID, log } from "../utils.mjs";
import { CompanionSpawner } from "./companion-spawner.mjs";
import { getSourceMeta } from "./companion-sources.mjs";

export const CompanionManagerTab = {
  init() {
    Hooks.on("renderApplicationV2", this._onRenderSheet.bind(this));

    // Re-render on companion state changes
    Hooks.on("updateActor", this._onCompanionStateChange.bind(this));
    Hooks.on("createToken", this._onCompanionStateChange.bind(this));
    Hooks.on("deleteToken", this._onCompanionStateChange.bind(this));
    Hooks.on("updateToken", this._onCompanionStateChange.bind(this));

    log("CompanionManagerTab", "Tab renderer registered");
  },

  _onRenderSheet(app, html, data) {
    if (app.document?.type !== "character") return;
    if (app.element.querySelector('[data-tab="vce-companions"]')) return;  // already injected
    this._inject(app);
  },

  _onCompanionStateChange(doc) {
    // Re-render any open character sheets that might show this companion
    for (const [id, app] of foundry.applications.instances) {
      if (app.document?.type === "character" && app.element?.isConnected) {
        const panel = app.element.querySelector('[data-tab="vce-companions"]');
        if (panel) this._rebuildPanel(app);
      }
    }
  },

  _inject(app) {
    const pc = app.document;
    const nav = app.element.querySelector('nav.sheet-tabs');
    if (!nav) return;

    // Inject tab link (after the first tab)
    const tabLink = document.createElement("a");
    tabLink.setAttribute("data-action", "tab");
    tabLink.setAttribute("data-tab", "vce-companions");
    tabLink.setAttribute("data-group", "primary");
    tabLink.innerHTML = `<span>Companions</span>`;
    nav.insertBefore(tabLink, nav.firstChild);  // or position as needed

    // Inject panel
    const section = document.createElement("section");
    section.className = "tab vce-companions-tab scrollable";
    section.setAttribute("data-tab", "vce-companions");
    section.setAttribute("data-group", "primary");
    section.innerHTML = this._buildPanelHTML(pc);

    const windowContent = app.element.querySelector('.window-content');
    windowContent?.appendChild(section);

    this._bindEvents(section, pc);
  },

  _rebuildPanel(app) {
    const pc = app.document;
    const panel = app.element.querySelector('[data-tab="vce-companions"]');
    if (!panel) return;
    panel.innerHTML = this._buildPanelHTML(pc);
    this._bindEvents(panel, pc);
  },

  _buildPanelHTML(pc) {
    const companions = CompanionSpawner.getCompanionsFor(pc);
    if (!companions.length) {
      return `
        <div class="vce-companions-empty">
          <i class="fas fa-users-slash"></i>
          <p>You have no active companions.</p>
          <p class="vce-companions-empty-hint">Cast a summoning spell, conjure a familiar, or engage a hireling.</p>
        </div>`;
    }
    return companions.map(c => this._buildCardHTML(c)).join("");
  },

  _buildCardHTML(entry) {
    const { actor, sourceId, sourceMeta, hp, maxHP, armor, statuses } = entry;
    const hpPct = maxHP > 0 ? Math.max(0, Math.min(100, (hp / maxHP) * 100)) : 0;
    const hpClass = hpPct > 60 ? "ok" : hpPct > 30 ? "mid" : hpPct > 10 ? "low" : "critical";
    const controllerSkillLabel = this._skillLabel(sourceMeta.skill, actor);
    const statusChips = statuses.length
      ? statuses.map(s => `<span class="vce-companion-status-chip">${s}</span>`).join(" ")
      : "";

    const actionsHTML = actor.type === "character"
      ? this._buildCharacterActionsHTML(actor)
      : this._buildNPCActionsHTML(actor);

    return `
      <div class="vce-companion-card" data-actor-id="${actor.id}">
        <div class="vce-bf-header">
          <img class="vce-bf-portrait" src="${actor.img}" alt="${actor.name}">
          <div class="vce-bf-info">
            <h2 class="vce-bf-name">${actor.name}</h2>
            <div class="vce-bf-tags">
              <span class="vce-companion-type-badge" style="background:${sourceMeta.badgeColor}">${sourceMeta.label.toUpperCase()}</span>
              <span class="vce-bf-tag">HD ${actor.system?.hd ?? actor.system?.hitDice?.value ?? "—"}</span>
              <span class="vce-bf-tag">${actor.system?.size ?? ""}</span>
            </div>
          </div>
          <button class="vce-bf-end vce-companion-dismiss" data-action="dismiss">
            <i class="fas fa-times"></i> ${sourceMeta.controllerType === "hireling" ? "Dismiss" : "Banish"}
          </button>
        </div>

        <div class="vce-companion-body">
          <div class="vce-companion-hp-row">
            <span class="vce-companion-hp-label">HP</span>
            <div class="vce-companion-hp-bar-wrap">
              <div class="vce-companion-hp-bar vce-hp-${hpClass}" style="width:${hpPct}%"></div>
            </div>
            <span class="vce-companion-hp-text">${hp} / ${maxHP}</span>
            <span class="vce-companion-armor">ARM ${armor}</span>
          </div>

          ${statusChips ? `<div class="vce-companion-statuses">${statusChips}</div>` : ""}

          ${sourceMeta.skill ? `
            <div class="vce-companion-controller">
              <i class="fas fa-people-arrows"></i>
              ${sourceMeta.controllerType === "hireling" ? "Checks & saves" : "Saves"}
              via controller (${controllerSkillLabel})
            </div>` : ""}

          <div class="vce-companion-saves">
            <button class="vce-save-btn" data-action="save" data-save="reflex"><i class="fas fa-dice-d20"></i> Reflex</button>
            <button class="vce-save-btn" data-action="save" data-save="endure"><i class="fas fa-dice-d20"></i> Endure</button>
            <button class="vce-save-btn" data-action="save" data-save="will"><i class="fas fa-dice-d20"></i> Will</button>
            <button class="vce-save-btn-open-sheet" data-action="open-sheet" title="Open sheet">
              <i class="fas fa-external-link-alt"></i>
            </button>
          </div>

          ${actionsHTML}
        </div>
      </div>`;
  },

  _buildNPCActionsHTML(actor) {
    const actions = actor.items.filter(i => ["weapon", "featureAction"].includes(i.type));
    if (!actions.length) return "";
    const rows = actions.map((item, idx) => `
      <div class="vce-bf-action vce-companion-action" data-item-id="${item.id}" role="button" tabindex="0">
        <div class="vce-bf-action-header">
          <strong class="vce-bf-action-name">${item.name}</strong>
          <span class="vce-bf-action-note">${item.system?.attackType ?? item.type}</span>
          ${item.system?.damageFormula ? `<span class="vce-bf-action-damage">${item.system.damageFormula}</span>` : ""}
        </div>
      </div>`).join("");
    return `
      <h3 class="vce-bf-section-title">Actions</h3>
      ${rows}`;
  },

  _buildCharacterActionsHTML(actor) {
    const weapons = actor.items.filter(i => i.type === "weapon" && i.system?.equipped);
    const spells = actor.items.filter(i => i.type === "spell");

    const wRows = weapons.map(item => `
      <div class="vce-bf-action vce-companion-action" data-item-id="${item.id}" role="button" tabindex="0">
        <div class="vce-bf-action-header">
          <strong class="vce-bf-action-name">${item.name}</strong>
          <span class="vce-bf-action-note">${item.system?.attackType ?? "Attack"}</span>
          ${item.system?.damageFormula ? `<span class="vce-bf-action-damage">${item.system.damageFormula}</span>` : ""}
        </div>
      </div>`).join("");

    const sRows = spells.map(item => `
      <div class="vce-bf-action vce-companion-action" data-item-id="${item.id}" role="button" tabindex="0">
        <div class="vce-bf-action-header">
          <strong class="vce-bf-action-name">${item.name}</strong>
          <span class="vce-bf-action-note">${item.system?.manaCost ?? 0} Mana</span>
        </div>
      </div>`).join("");

    return `
      ${weapons.length ? `<h3 class="vce-bf-section-title">Equipped Weapons</h3>${wRows}` : ""}
      ${spells.length ? `<h3 class="vce-bf-section-title">Spells</h3>${sRows}` : ""}`;
  },

  _skillLabel(skill, actor) {
    if (!skill) return "none";
    if (skill === "leadership") return "Leadership";
    if (skill === "mana") {
      // mana skill is derived from the controller PC — look up via companion's controllerActorId
      const controllerId = actor.getFlag(MODULE_ID, "controllerActorId");
      const controller = controllerId ? game.actors.get(controllerId) : null;
      const manaSkill = controller?.system?.attributes?.manaSkill ?? controller?.system?.classData?.manaSkill;
      if (manaSkill) {
        const label = controller.system?.skills?.[manaSkill]?.label;
        if (label) return label;
      }
      return "Mysticism";
    }
    return skill;
  },

  _bindEvents(panel, pc) {
    panel.querySelectorAll(".vce-companion-card").forEach(card => {
      const actorId = card.dataset.actorId;
      const actor = game.actors.get(actorId);
      if (!actor) return;

      // Dismiss
      card.querySelector('[data-action="dismiss"]')?.addEventListener("click", async (ev) => {
        ev.preventDefault();
        await CompanionSpawner.dismiss(actor, { reason: "manual" });
      });

      // Open sheet
      card.querySelector('[data-action="open-sheet"]')?.addEventListener("click", (ev) => {
        ev.preventDefault();
        actor.sheet.render(true);
      });

      // Save buttons — route through existing save-routing pipeline by creating a reminder save chat card
      card.querySelectorAll('[data-action="save"]').forEach(btn => {
        btn.addEventListener("click", async (ev) => {
          ev.preventDefault();
          const saveType = btn.dataset.save;
          // Use the system's VagabondDamageHelper.handleSaveReminderRoll via a synthetic chat-card call
          // The patched handler in save-routing-patch.mjs will route to the controller.
          const DH = await import("/systems/vagabond/module/helpers/damage-helper.mjs").then(m => m.default ?? m.VagabondDamageHelper);
          if (DH?.handleSaveReminderRoll) {
            DH.handleSaveReminderRoll({
              targetActorId: actor.id,
              saveType,
              difficulty: actor.system?.saves?.[saveType]?.difficulty ?? 11,
              attackerId: null,
              causedStatuses: [],
              suppressStatuses: true,
            });
          } else {
            ui.notifications.warn("Could not resolve save handler.");
          }
        });
      });

      // Action clicks — NPC style or character style, route through token actor's item
      card.querySelectorAll('.vce-companion-action').forEach(row => {
        row.addEventListener("click", async (ev) => {
          ev.preventDefault();
          const itemId = row.dataset.itemId;
          const item = actor.items.get(itemId);
          if (!item) return;
          if (item.type === "weapon") {
            await item.rollAttack?.();
          } else if (item.type === "spell") {
            await item.roll?.();
          } else {
            await item.roll?.();
          }
        });
      });
    });
  },
};
```

- [ ] Step 2: Verify by opening a PC sheet with active companions

In Foundry:
1. Spawn a companion via Task 3 console snippet
2. Open the PC's character sheet
3. After Task 7 (registration) is done, click "Companions" tab
4. Confirm card renders with portrait, HP bar, save buttons, actions
5. Click Dismiss — confirm card disappears

- [ ] Step 3: Commit

```bash
git add scripts/companion/companion-manager-tab.mjs
git commit -m "$(cat <<'EOF'
feat(companion): add CompanionManagerTab renderer

Source-agnostic tab renderer that replaces the current Summon tab.
Reads flagged companions via CompanionSpawner.getCompanionsFor(pc)
and renders one card per active companion, regardless of source
(summon, familiar, hireling, etc.).

- NPC companions: render system actions (weapon + featureAction items)
- Character hirelings: render equipped weapons + spells in two sub-sections
- Save buttons dispatch to patched handleSaveReminderRoll (routes
  to controller PC via v0.3.4 save-routing)
- Dismiss button calls CompanionSpawner.dismiss
- Auto re-renders on updateActor / createToken / deleteToken

Not yet registered in main entry — that happens in the next task.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

```json:metadata
{"files": ["scripts/companion/companion-manager-tab.mjs"], "verifyCommand": "manual: open PC sheet with companion, click Companions tab, confirm card renders + dismiss works", "acceptanceCriteria": ["Tab injected into sheet", "NPC vs character action list branches correctly", "Save buttons route through controller", "Dismiss removes card"]}
```

---

## Task 6: CSS styling for companion cards

**Goal:** Add CSS rules for `.vce-companion-card`, type badges, save buttons, HP color gradient, empty state. Build on existing `--vagabond-c-*` and `--vce-*` tokens.

**Files:**
- Modify: `styles/vagabond-character-enhancer.css` (append)

**Acceptance Criteria:**
- [ ] `.vce-companion-card` has margin, border, background matching dark theme
- [ ] `.vce-companion-type-badge` uses inline `background-color` from badge color
- [ ] `.vce-companion-hp-bar` has gradient rule via `.vce-hp-ok / .vce-hp-mid / .vce-hp-low / .vce-hp-critical` modifiers
- [ ] `.vce-save-btn` matches system roll button aesthetic (gold accent, small size)
- [ ] `.vce-companions-empty` centered layout with icon + hint
- [ ] Reuses existing `.vce-bf-*` classes for header and action rows (don't duplicate)

**Verify:** Open Companions tab — visual inspection matches spec section 3.3 mockup style. Compare to existing Summon tab — same font, same banner, consistent visual weight.

**Steps:**

- [ ] Step 1: Append to `styles/vagabond-character-enhancer.css`

```css
/* -------------------------------------------- */
/*  Companion Manager Tab (v0.4.0)              */
/* -------------------------------------------- */

.vce-companions-tab {
  padding: 8px;
  color: var(--vagabond-c-text-primary);
  font-family: "Paradigm", serif;
}

.vce-companion-card {
  margin-bottom: 12px;
  border: 1px solid var(--vagabond-c-faint);
  border-radius: 4px;
  overflow: hidden;
  background: var(--vagabond-c-inset-2);
}

.vce-companion-card + .vce-companion-card {
  margin-top: 4px;
}

.vce-companion-body {
  padding: 6px 8px;
}

/* Type badge — inline colour via style attr */
.vce-companion-type-badge {
  display: inline-block;
  font-size: 11px;
  font-weight: bold;
  font-family: "Germania", serif;
  padding: 1px 6px;
  border-radius: 3px;
  color: white;
  letter-spacing: 0.5px;
  margin-right: 4px;
  vertical-align: middle;
}

/* HP bar */
.vce-companion-hp-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 5px;
  font-family: "Paradigm", serif;
}
.vce-companion-hp-label {
  font-size: 13px;
  font-weight: bold;
  color: var(--vagabond-c-text-primary);
  min-width: 20px;
}
.vce-companion-hp-bar-wrap {
  flex: 1;
  height: 14px;
  background: #222;
  border-radius: 7px;
  overflow: hidden;
  border: 1px solid var(--vagabond-c-tan);
}
.vce-companion-hp-bar {
  height: 100%;
  border-radius: 7px;
  transition: width 0.3s, background 0.3s;
}
.vce-companion-hp-bar.vce-hp-ok       { background: #3aaa3a; }
.vce-companion-hp-bar.vce-hp-mid      { background: #b8a020; }
.vce-companion-hp-bar.vce-hp-low      { background: #c86040; }
.vce-companion-hp-bar.vce-hp-critical { background: #8a1010; }
.vce-companion-hp-text {
  font-size: 13px;
  font-weight: bold;
  color: var(--vagabond-c-text-primary);
  min-width: 52px;
  text-align: right;
}
.vce-companion-armor {
  font-size: 12px;
  color: var(--vagabond-c-muted);
  font-family: "Manofa", sans-serif;
  text-transform: uppercase;
}

/* Status chips */
.vce-companion-statuses {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 5px;
}
.vce-companion-status-chip {
  display: inline-block;
  font-size: 11px;
  font-family: "Paradigm", serif;
  padding: 1px 6px;
  border-radius: 3px;
  background: var(--vce-condition-bg);
  border: 1px solid var(--vce-condition-border);
  color: var(--vce-condition-text);
}

/* Controller attribution note */
.vce-companion-controller {
  font-size: 11px;
  font-style: italic;
  color: var(--vagabond-c-muted);
  margin-bottom: 5px;
  font-family: "Paradigm", serif;
}
.vce-companion-controller i {
  margin-right: 3px;
  color: var(--vce-accent);
}

/* Save button row */
.vce-companion-saves {
  display: flex;
  gap: 5px;
  margin-bottom: 6px;
}
.vce-save-btn {
  flex: 1;
  padding: 4px 2px;
  border: 1px solid var(--vce-accent-dim);
  border-radius: 3px;
  background: var(--vagabond-c-inset-2);
  color: var(--vagabond-c-text-primary);
  font-family: "Paradigm", serif;
  font-size: 12px;
  font-weight: bold;
  cursor: pointer;
  text-align: center;
  transition: background 0.15s, border-color 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  min-height: 24px;
}
.vce-save-btn:hover {
  background: var(--vagabond-c-tan-lite);
  border-color: var(--vce-accent);
}
.vce-save-btn i {
  font-size: 10px;
  color: var(--vce-accent);
}
.vce-save-btn-open-sheet {
  padding: 4px 8px;
  border: 1px solid var(--vagabond-c-tan);
  border-radius: 3px;
  background: var(--vagabond-c-inset-2);
  color: var(--vagabond-c-muted);
  font-size: 12px;
  cursor: pointer;
  min-height: 24px;
}
.vce-save-btn-open-sheet:hover {
  border-color: var(--vce-accent);
  color: var(--vce-accent);
}

/* Dismiss button variant (red) — reuse .vce-bf-end, no override needed */

/* Empty state */
.vce-companions-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
  color: var(--vagabond-c-muted);
  font-family: "Paradigm", serif;
}
.vce-companions-empty i {
  font-size: 40px;
  margin-bottom: 12px;
  color: #444;
}
.vce-companions-empty p {
  margin: 2px 0;
  font-size: 13px;
}
.vce-companions-empty-hint {
  font-style: italic;
  font-size: 12px !important;
  color: var(--vagabond-c-tan);
}

/* Spawn + dismiss chat notifications */
.vce-companion-spawned,
.vce-companion-dismissed {
  padding: 4px 8px;
  font-size: 13px;
}
```

- [ ] Step 2: Visually verify in Foundry by opening a PC sheet with a companion and clicking the Companions tab (after Task 7 registration).

- [ ] Step 3: Commit

```bash
git add styles/vagabond-character-enhancer.css
git commit -m "$(cat <<'EOF'
style(companion): add CSS for Companions tab cards

- .vce-companion-card with dark theme + subtle inset background
- Type badge with inline colour from source registry
- HP bar with gradient via .vce-hp-ok / mid / low / critical
- Save buttons with amber accent matching system roll aesthetic
- Empty state centred icon + hint
- Spawn/dismiss chat card styling

Reuses existing .vce-bf-* classes for header banner and action
rows — no duplication.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

```json:metadata
{"files": ["styles/vagabond-character-enhancer.css"], "verifyCommand": "manual: open Companions tab and visually compare to spec mockup", "acceptanceCriteria": ["Card layout matches spec", "HP gradient works", "Type badges visible", "Reuses existing tokens"]}
```

---

## Task 7: Register tab + termination + remove old Summon injection

**Goal:** Wire up the new tab renderer and termination manager in the main entry point's ready hook, and disable the old Summon tab injection in `summoner.mjs` so there's no double-injection conflict.

**Files:**
- Modify: `scripts/vagabond-character-enhancer.mjs` (ready hook)
- Modify: `scripts/class-features/summoner.mjs` (disable _injectSummonTab call)

**Acceptance Criteria:**
- [ ] `CompanionManagerTab.init()` called in main ready hook
- [ ] `CompanionTerminationManager.init()` called in main ready hook
- [ ] `SummonerFeatures._injectSummonTab` is no longer called (either removed from the hook or the hook's filter excludes the old path)
- [ ] On a fresh world load, character sheet shows "Companions" tab — NOT "Summon"
- [ ] No console errors on sheet render

**Verify:** Reload Foundry, open a PC sheet, confirm the tab bar shows "Companions" (and no "Summon").

**Steps:**

- [ ] Step 1: Find the summoner hook that calls `_injectSummonTab` and disable it

Read `scripts/class-features/summoner.mjs` lines 104-110 (registerHooks) and around line 106 (renderApplicationV2 hook). Replace the `_injectSummonTab(app)` call with an early return so the handler is inert but the surrounding init still runs (in case other hooks share that handler).

```js
// scripts/class-features/summoner.mjs — registerHooks()

registerHooks() {
  Hooks.on("renderApplicationV2", (app) => {
    if (app.document?.type !== "character") return;
    // Disabled in v0.4.0 — replaced by CompanionManagerTab.
    // this._injectSummonTab(app);
  });
  // ... keep existing hooks (updateActor for auto-banish, etc.)
},
```

- [ ] Step 2: Add imports + init calls to `scripts/vagabond-character-enhancer.mjs`

Find the ready hook (search for `Hooks.once("ready"`) and add:

```js
// Near the top with other imports
import { CompanionManagerTab } from "./companion/companion-manager-tab.mjs";
import { CompanionTerminationManager } from "./companion/companion-termination.mjs";

// In the ready hook, alongside other .init() calls:
CompanionManagerTab.init();
CompanionTerminationManager.init();
log("VCE", "CompanionManager + Termination initialized");
```

- [ ] Step 3: Reload Foundry, verify

```
1. F5 in Foundry client → world reloads
2. Open character sheet for MrLawyerGuy
3. Confirm tab bar shows: [Companions] [Features] [Magic] [Effects]
   (NOT: [Summon] [Features] [Magic] [Effects])
4. F12 → Console → confirm no red errors mentioning "vce-summon" or CompanionManager
```

- [ ] Step 4: Commit

```bash
git add scripts/vagabond-character-enhancer.mjs scripts/class-features/summoner.mjs
git commit -m "$(cat <<'EOF'
feat(companion): register CompanionManagerTab, retire Summon tab

Wire up the new tab renderer + termination manager in the main
ready hook, and disable the old _injectSummonTab call in summoner.mjs.

Character sheets now show "Companions" tab (not "Summon") and render
all flagged companions via the unified renderer.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

```json:metadata
{"files": ["scripts/vagabond-character-enhancer.mjs", "scripts/class-features/summoner.mjs"], "verifyCommand": "manual: reload world, confirm Companions tab replaces Summon tab", "acceptanceCriteria": ["Tab renamed", "No double injection", "No console errors"]}
```

---

## Task 8: Refactor Summoner to use CompanionSpawner

**Goal:** Replace the inline placeToken + flag-stamping logic in `summoner.mjs` (currently lines ~940-989) with a single `CompanionSpawner.spawn()` call. Keep the existing `activeConjure` flag write on the caster for backward compat with existing summoner-specific logic.

**Files:**
- Modify: `scripts/class-features/summoner.mjs`

**Acceptance Criteria:**
- [ ] `SummonerFeatures.conjureSummon(...)` (or equivalent — the method that currently calls `gmRequest("placeToken", ...)`) delegates to `CompanionSpawner.spawn()` with `sourceId: "summoner"`
- [ ] The `activeConjure` flag on the caster is still written (for backward compat with any hook code reading it)
- [ ] Beast picker still uses the existing flow OR migrates to `CompanionPicker.pick()` — pick ONE approach (migration is cleaner but cost higher; if time-boxed, keep existing picker and migrate in Phase 2)
- [ ] Summoner focus acquisition (post-spawn) still fires
- [ ] Second Nature check still fires
- [ ] Smoke test: summon a beast → appears in Companions tab with "Summon" badge → HP shown → actions clickable

**Verify:** Smoke test via Foundry:
1. Open a Summoner PC sheet
2. Trigger the conjure flow (via existing button / spell)
3. Pick a beast in the creature picker
4. Confirm token appears on canvas
5. Open Companions tab — confirm card with gold "SUMMON" badge
6. Confirm HP, armor, actions rendered
7. Click an action — confirm it rolls via Mysticism (existing v0.3.4 routing)
8. Click Dismiss — confirm token removed and card disappears

**Steps:**

- [ ] Step 1: Read `scripts/class-features/summoner.mjs` around lines 940-989 (the current spawn block from Task 5 of v0.3.4)

Locate the sequence: `gmRequest("placeToken", ...)` → `gmRequest("updateActorFlags", ...)` → focus/Second Nature. Note surrounding variables: `sourceActorId`, `actor` (caster), `casterToken`, etc.

- [ ] Step 2: Replace the inline spawn block with a `CompanionSpawner.spawn()` call

```js
// scripts/class-features/summoner.mjs
// Near the top, add import:
import { CompanionSpawner } from "../companion/companion-spawner.mjs";

// In the method that currently does placeToken + updateActorFlags (around line 940):

// BEFORE (existing):
// const placeResult = await gmRequest("placeToken", { sceneId, tokenData: {...} });
// if (placeResult.error) { ... }
// const sourceActorId = ...;
// await gmRequest("updateActorFlags", { actorId: sourceActorId, scope: MODULE_ID, flags: { controllerActorId, controllerType } });

// AFTER:
const spawnResult = await CompanionSpawner.spawn({
  caster: actor,
  sourceId: "summoner",
  creatureUuid: selectedNpcUuid,
  // tokenData overrides here if Summoner needs custom position/size
  meta: {
    hd: selectedNpc.hd,
    // any Summoner-specific metadata
  },
});
if (!spawnResult.success) {
  ui.notifications.error(`Could not summon: ${spawnResult.error}`);
  return;
}
const sourceActorId = spawnResult.actorId;
const tokenId = spawnResult.tokenId;

// Keep existing activeConjure flag write for backward compat
await actor.setFlag(MODULE_ID, "activeConjure", {
  summonActorId: sourceActorId,
  summonTokenId: tokenId,
  summonName: selectedNpc.name,
  summonImg: selectedNpc.img,
  summonHD: selectedNpc.hd,
  sceneId: game.scenes.active.id,
});

// --- rest of the method (focus acquisition, Second Nature) unchanged ---
```

- [ ] Step 3: Guard the existing updateActor auto-banish hook to prevent double-dismiss

The existing summoner.mjs hook at ~line 121 (reads `activeConjure`, auto-banishes on 0 HP) would otherwise double-fire alongside CompanionTerminationManager. Add a guard:

```js
// In summoner.mjs's existing updateActor hook (find the one reading activeConjure):
Hooks.on("updateActor", (actor, changes) => {
  // Bail if CompanionTerminationManager already owns this companion (new path)
  if (actor.getFlag(MODULE_ID, "companionMeta")) return;
  // Otherwise fall through to legacy auto-banish path (v0.3.4 / pre-v0.4.0 companions)
  // ... existing logic unchanged ...
});
```

- [ ] Step 4: Smoke test in Foundry per Verify section above.

- [ ] Step 5: Commit

```bash
git add scripts/class-features/summoner.mjs
git commit -m "$(cat <<'EOF'
refactor(summoner): use CompanionSpawner.spawn

Replace inline placeToken + updateActorFlags block with a single
CompanionSpawner.spawn({ sourceId: 'summoner', ... }) call.

Keeps the activeConjure caster-side flag write for backward compat
with existing hook code that reads it. Focus acquisition and
Second Nature dialog remain unchanged.

Guards the legacy auto-banish hook with a companionMeta check so
CompanionTerminationManager owns dismissal for new summons and the
legacy hook only handles pre-v0.4.0 companions.

Proves the engine on a real feature before migrating Familiar.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

```json:metadata
{"files": ["scripts/class-features/summoner.mjs"], "verifyCommand": "manual: summon a beast → Companions tab card with SUMMON badge → click action rolls via Mysticism", "acceptanceCriteria": ["Uses CompanionSpawner.spawn", "activeConjure flag preserved", "Focus + Second Nature unchanged", "Smoke test passes"]}
```

---

## Task 9: Refactor Familiar to use CompanionSpawner

**Goal:** Same as Task 8 but for Familiar perk. Replace the inline placeToken + flag-stamping in `familiar.mjs` (around lines 370-418) with `CompanionSpawner.spawn()`.

**Files:**
- Modify: `scripts/perk-features/familiar.mjs`

**Acceptance Criteria:**
- [ ] Familiar conjure flow uses `CompanionSpawner.spawn()` with `sourceId: "familiar"`
- [ ] The `activeFamiliar` flag on the caster is still written (for existing banish-on-recast logic, feature context menu, etc.)
- [ ] Ritual check still enforced
- [ ] Auto-banish on 0 HP now handled by `CompanionTerminationManager` — the explicit zero-HP hook in familiar.mjs can stay (defensive) or be removed (cleaner). Prefer: **leave existing 0 HP hook in place for now** to avoid breaking the redundancy; belt-and-suspenders
- [ ] Smoke test: conjure familiar → Companions tab card with purple "FAMILIAR" badge

**Verify:**
1. Open a Familiar perk owner's sheet
2. Trigger the ritual conjure
3. Pick a HD 1 being
4. Confirm token placed + Companions tab shows purple FAMILIAR card
5. HP, actions, saves all work
6. Dismiss via Companions tab card → token + flags cleared + activeFamiliar flag unset

**Steps:**

- [ ] Step 1: Read `scripts/perk-features/familiar.mjs` around lines 370-445 to locate the current spawn block

- [ ] Step 2: Replace the inline spawn with `CompanionSpawner.spawn()`

```js
// scripts/perk-features/familiar.mjs
// Add import:
import { CompanionSpawner } from "../companion/companion-spawner.mjs";

// In conjureFamiliar() (or equivalent method):

// BEFORE:
// const placeResult = await gmRequest("placeToken", { ... });
// const sourceActorId = placeResult.actorId;
// await gmRequest("updateActorFlags", { ..., flags: { controllerActorId, controllerType } });

// AFTER:
const spawnResult = await CompanionSpawner.spawn({
  caster: actor,
  sourceId: "familiar",
  creatureUuid: selectedNpcUuid,
  meta: {
    hd: 1,
    ritual: true,
    familiarSkill, // e.g., "arcana" or "mysticism"
  },
});
if (!spawnResult.success) {
  ui.notifications.error(`Could not conjure familiar: ${spawnResult.error}`);
  return;
}

const sourceActorId = spawnResult.actorId;
const tokenId = spawnResult.tokenId;

// Keep existing activeFamiliar caster-side flag for backward compat
await actor.setFlag(MODULE_ID, "activeFamiliar", {
  summonActorId: sourceActorId,
  summonTokenId: tokenId,
  summonName: selectedNpc.name,
  summonImg: selectedNpc.img,
  summonHD: 1,
  familiarSkill,
  importedFromCompendium: true,
  sceneId: game.scenes.active.id,
});
```

- [ ] Step 3: Ensure the existing familiar banishment path still works

The familiar's existing 0-HP hook (in `familiar.mjs` registerHooks) will now fire alongside CompanionTerminationManager. Both call `dismiss`/`banishFamiliar`. Make sure there's no double-notification — either:
- Remove familiar.mjs's 0-HP hook (cleanest), OR
- Keep it but guard with a check: `if (!actor.getFlag(MODULE_ID, "controllerActorId")) return;` so after CompanionSpawner.dismiss clears the flag, the familiar-specific hook becomes a noop

**Recommended:** Keep familiar.mjs's hook as a safety net but add a guard so it doesn't double-fire:
```js
// In familiar.mjs's existing updateActor hook:
if (!actor.getFlag(MODULE_ID, "activeFamiliar") && !actor.getFlag(MODULE_ID, "controllerActorId")) return;
```

- [ ] Step 4: Smoke test per Verify section.

- [ ] Step 5: Commit

```bash
git add scripts/perk-features/familiar.mjs
git commit -m "$(cat <<'EOF'
refactor(familiar): use CompanionSpawner.spawn

Replace inline placeToken + updateActorFlags block with a single
CompanionSpawner.spawn({ sourceId: 'familiar', ... }) call.

Keeps the activeFamiliar caster-side flag write for backward compat
with the familiar-specific banish-on-recast logic and feature
context menu. Ritual check unchanged.

CompanionTerminationManager's zeroHP trigger now handles auto-banish,
with existing familiar hook retained as safety net (guarded to
prevent double-fire).

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

```json:metadata
{"files": ["scripts/perk-features/familiar.mjs"], "verifyCommand": "manual: conjure familiar → Companions tab FAMILIAR card → dismiss works → ritual recast replaces", "acceptanceCriteria": ["Uses CompanionSpawner.spawn", "activeFamiliar flag preserved", "Ritual check enforced", "No double-dismiss"]}
```

---

## Task 10: End-to-end smoke test matrix

**Goal:** Walk through a comprehensive test matrix covering all Phase 1 behaviors and regression paths. No code changes — pure verification.

**Files:** None.

**Acceptance Criteria:** All scenarios below pass without console errors.

**Verify:** Execute each scenario manually in Foundry.

**Steps:**

- [ ] **Scenario 1: Fresh Summoner conjure**
  - PC is a Summoner
  - Conjure a HD 1 beast via the Summoner's conjure flow
  - Token appears on canvas adjacent to summoner
  - Companions tab shows card with gold "SUMMON" badge
  - HP, armor, actions rendered
  - Chat card posted: "MrLawyerGuy conjures X (Summon)"

- [ ] **Scenario 2: Fresh Familiar conjure**
  - PC has Familiar perk
  - Trigger ritual
  - Familiar token placed
  - Companions tab shows card with purple "FAMILIAR" badge

- [ ] **Scenario 3: Multi-companion active simultaneously**
  - After Scenarios 1 & 2, confirm BOTH cards visible in the Companions tab
  - Each has correct badge, HP, actions
  - Saves on each route to correct controller skill

- [ ] **Scenario 4: Hireling via manual dialog**
  - Open an NPC (or character) actor that should be a hireling
  - Via "Set Save Controller" dialog, assign controller + type=hireling
  - On the PC's Companions tab, a "HIRELING" badge card appears (green)
  - Card shows equipped weapons + spells sections (not NPC action list) if the hireling is a character-type actor
  - Note: the dialog path only writes `controllerActorId` + `controllerType`, not `companionMeta`. `CompanionSpawner.getCompanionsFor`'s smart fallback detects `controllerType === "hireling"` and maps to the `hireling-manual` source — so the badge renders correctly without any dialog changes.

- [ ] **Scenario 5: Replace same-source companion**
  - With a Summon active, trigger another conjure
  - Confirm dialog: "Replace active Summon?"
  - Click Yes → old summon dismissed, new one placed
  - Only one "SUMMON" card in the Companions tab

- [ ] **Scenario 6: Zero-HP auto-dismiss**
  - Attack a summon with enough damage to bring to 0 HP
  - Token removed automatically within 1 second
  - Chat notification: "[Summon name] falls in battle"
  - Companions tab re-renders — summon card gone

- [ ] **Scenario 7: Save routing still works (v0.3.4 regression)**
  - Summon a companion
  - Cast damage-save spell at the summon
  - Click save button on damage chat card
  - Save rolls on the controller PC's sheet (not on the NPC) — routes via Mysticism

- [ ] **Scenario 8: Dismiss via Companions tab**
  - Click Dismiss on a summon card
  - Token removed
  - Card disappears
  - Flag `controllerActorId` cleared
  - Chat notification: "[Summon] is dismissed"

- [ ] **Scenario 9: Empty state**
  - PC with no companions
  - Companions tab shows empty state: "You have no active companions."

- [ ] **Scenario 10: Non-caster PC**
  - Open a PC sheet with no summoning spells and no familiar perk
  - Companions tab still exists and shows empty state (no crash)

- [ ] **Scenario 11: NPC sheet (not character)**
  - Open an NPC's sheet (a world actor, e.g. Badger)
  - No Companions tab injected (only on character-type sheets)

- [ ] **Scenario 12: Legacy v0.3.4 companion (no companionMeta)**
  - Manually set `flags.vagabond-character-enhancer.controllerActorId` on an NPC via console — no `companionMeta`
  - Open that PC's Companions tab
  - Card renders with "COMPANION" fallback badge, gray color, no source-specific features
  - No crash

- [ ] **Scenario 13: Multi-client (player + GM)**
  - Player client connected
  - Player triggers conjure
  - Player's Companions tab shows the summon
  - GM's view of the same player's sheet shows the same summon
  - GM manually deletes the token on canvas → both clients see the card disappear

- [ ] **Scenario 14: Player ownership on summon (v0.3.4 regression)**
  - Player triggers conjure
  - Confirm player can select and move the summon token (ownership grant in socket-relay preserved)

- [ ] **Scenario 15: Action click routes correctly (v0.3.4 regression)**
  - Click an action on a Summon card → rolls via Mysticism (Summoner controller's skill)
  - Click an equipped-weapon on a Hireling card → rolls via Leadership

- [ ] **Scenario 16: Ritual recast banishes previous familiar**
  - With a familiar active, trigger ritual again
  - Confirm replace dialog → Yes
  - Old familiar token removed, new one placed
  - Companions tab shows only one FAMILIAR card

Record any failures per scenario in CHANGELOG comments — we fix them in Task 11 before release or defer to a follow-up.

```json:metadata
{"files": [], "verifyCommand": "manual: walk all 16 scenarios above", "acceptanceCriteria": ["All 16 scenarios pass", "No console errors", "No regressions from v0.3.4"]}
```

---

## Task 11: CHANGELOG + version bump + release

**Goal:** Document v0.4.0 changes, bump version, tag and release.

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `module.json`

**Acceptance Criteria:**
- [ ] `CHANGELOG.md` has a v0.4.0 section summarising engine introduction, new tab, Summoner + Familiar refactor, legacy compatibility
- [ ] `module.json` version bumped `0.3.4` → `0.4.0`
- [ ] `git tag v0.4.0` applied
- [ ] Release built (manual: zip module, attach to GitHub release) — user does this via desktop client

**Verify:**
```bash
git diff HEAD~1 module.json CHANGELOG.md
git tag --list | grep v0.4.0
```

**Steps:**

- [ ] Step 1: Append to `CHANGELOG.md`

```markdown
## [0.4.0] - 2026-04-23

### Added
- **CompanionManager tab** — replaces the Summon tab on character sheets. Renders all active companions (summons, familiars, hirelings, future Beast/Animate/Raise spells) in one place, regardless of source. Each card shows portrait, HP bar with gradient, armor, active conditions, save buttons that route through the controller PC, and action list. NPC companions surface their creature actions; character hirelings surface equipped weapons + spells.
- **`CompanionSpawner` engine** — unified spawn/dismiss/query API. Consolidates placeToken + controller flag stamping + combat-add logic. Used by Summoner and Familiar; ready for Phase 2 feature adapters (Beast, Animate, Raise, Conjurer, Reanimator, Animal Companion).
- **`CreaturePicker` shared dialog** — reusable ApplicationV2 picker with filter config. Replaces duplicated inline pickers in Summoner and Familiar.
- **Auto-dismiss on 0 HP** — companions flagged with `terminateOn: ["zeroHP"]` auto-dismiss when defeated.
- **Replace-same-source prompt** — conjuring a second Summon (or re-casting a Familiar ritual) prompts to replace the active one.

### Changed
- **Summoner class** refactored to use `CompanionSpawner.spawn()`. The `activeConjure` caster-side flag is still written for backward compat.
- **Familiar perk** refactored to use `CompanionSpawner.spawn()`. The `activeFamiliar` caster-side flag is still written for backward compat.

### Compatibility
- v0.3.4 `controllerActorId` + `controllerType` flags unchanged. Existing flagged companions render in the new tab with a generic "Companion" fallback badge. Re-cast the originating spell/perk to attach source-specific metadata.
- Existing save routing (v0.3.4) works unchanged — the new tab piggybacks on the same chat-card pipeline.
```

- [ ] Step 2: Bump version in `module.json`

```json
{
  "version": "0.4.0",
  ...
}
```

- [ ] Step 3: Commit + tag

```bash
git add module.json CHANGELOG.md
git commit -m "$(cat <<'EOF'
chore: v0.4.0 — CompanionManager Phase 1 (unified engine + tab)

Ships the unified CompanionSpawner engine, CreaturePicker dialog,
and CompanionManager tab. Migrates Summoner and Familiar onto the
engine. Phase 2 adapters (Beast, Animate, Raise, Conjurer,
Reanimator, Animal Companion) will be added as separate small PRs.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"

git tag v0.4.0
```

- [ ] Step 4: Build release zip + upload via desktop (user task — outside plan scope)

- [ ] Step 5: Push

```bash
git push origin main
git push origin v0.4.0
```

```json:metadata
{"files": ["CHANGELOG.md", "module.json"], "verifyCommand": "git diff module.json CHANGELOG.md && git tag --list | grep v0.4.0", "acceptanceCriteria": ["Changelog entry", "Version bumped", "Tag applied", "Pushed to remote"]}
```

---

## Dependencies

```
Task 0 (prep) → everything
Task 1 (sources) → Task 3, Task 5
Task 2 (picker) → (used by Phase 2 adapters, not required for Phase 1 Summoner/Familiar refactor if we keep their existing pickers)
Task 3 (spawner) → Task 4, Task 5, Task 8, Task 9
Task 4 (termination) → Task 7
Task 5 (tab renderer) → Task 6, Task 7
Task 6 (CSS) → Task 7
Task 7 (registration) → Task 10
Task 8 (summoner refactor) → Task 10
Task 9 (familiar refactor) → Task 10
Task 10 (e2e tests) → Task 11
Task 11 (release) → done
```

## Out of Scope (Phase 2 — separate plans)

- Beast spell adapter
- Animate spell adapter
- Raise spell adapter
- Conjurer perk adapter
- Reanimator perk adapter
- Animal Companion perk adapter
- GM master companion view
- Duration / manaLapse / shift termination triggers (stubs exist; activation is Phase 2)
- Cross-scene companion handoff
- Companion turn automation
