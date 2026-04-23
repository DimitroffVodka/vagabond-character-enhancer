# CompanionManager — Unified Companion System

**Status:** Draft
**Author:** `@DimitroffVodka` (with Claude)
**Date:** 2026-04-23
**Target version:** v0.4.0 (Phase 1) → v0.5.x (Phase 2 adapters)

---

## 1. Goal

Replace 8 copy-pasted summoning implementations with **one unified engine** that handles the common flow: pick a creature → place token → stamp controller flags → track termination → render in a single UI.

Ship it in two phases:
- **Phase 1 (v0.4.0):** Build the engine, migrate existing Summoner + Familiar to it, replace the Summon tab with a unified Companions tab.
- **Phase 2 (v0.5.x):** Build small feature adapters for Beast, Animate, Raise, Conjurer, Reanimator, Animal Companion — each as its own PR.

**Out of scope:** Druid Polymorph (self-transformation, different pattern), Control spell (status effect on existing enemy, not a spawn).

---

## 2. Problem

Current state (v0.3.4):
- **Summoner class** has full token placement + flag stamping in `class-features/summoner.mjs` (~100 lines of spawn logic)
- **Familiar perk** has near-identical logic in `perk-features/familiar.mjs` (~80 lines — duplicated)
- **Summon tab** (system-provided) shows only one companion — the current summon — with no awareness of familiar or hirelings
- **6 other features** (Beast, Animate, Raise spells; Conjurer, Reanimator, Animal Companion perks) are stub/flavor — each would need another ~100 lines of copy-pasted spawn code if implemented naively

Additional friction:
- Familiars are invisible on the caster's sheet (only in a flag)
- Hirelings are disconnected character actors with no sheet-side link
- No unified "these are my companions" view for the player

---

## 3. Architecture — 4 pieces

### 3.1 `CompanionSpawner` (core engine)
**File:** `scripts/companion/companion-spawner.mjs` (NEW)

Single public method:
```js
CompanionSpawner.spawn({
  caster,              // Actor — the PC
  sourceId,            // string — "summoner" | "familiar" | "spell-beast" | etc.
  creatureUuid,        // string — resolved world actor or compendium UUID
  tokenData,           // object? — optional overrides (position, size)
  controllerType,      // "companion" | "hireling"
  skill,               // "mana" | "leadership"
  cost,                // { mana?: n, ritual?: minutes, duration?: rounds }
  terminateOn,         // string[] — ["zeroHP", "duration", "manaLapse", "ritualRecast", "shift"]
  meta,                // object? — source-specific extras stored on the companion flag
}) => Promise<{ tokenId, actorId, success: boolean, error?: string }>
```

**Responsibilities (all in one place):**
1. Validate caster has required resources (mana, action, ritual time)
2. Resolve creature UUID → actor data
3. Compute grid placement (adjacent to caster)
4. Call `gmRequest("placeToken", ...)` for GM-proxied creation
5. Stamp controller flags via `gmRequest("updateActorFlags", ...)` — atomic write
6. Stamp companion metadata flag: `{ sourceId, terminateOn, cost, meta, spawnedAt: Date.now() }`
7. Grant player OWNER on world actor (already in socket-relay)
8. Auto-add token to active combat (already in socket-relay)
9. Register termination handlers (see §5)
10. Return result; post chat notification

**Dismissal:**
```js
CompanionSpawner.dismiss(companionActor, { reason }) => Promise<void>
```
- Removes token, clears flags, posts chat notification, releases focus if held

**Query:**
```js
CompanionSpawner.getCompanionsFor(pcActor) => Array<CompanionEntry>
// Returns: [{ actor, tokenId, sourceId, controllerType, skill, hp, armor, statuses, meta }]
```

### 3.2 `CreaturePicker` (shared dialog)
**File:** `scripts/companion/creature-picker.mjs` (NEW)

Extracted from the existing Summoner/Familiar pickers. ApplicationV2 dialog:
```js
CreaturePicker.pick({
  title,               // "Summon a Beast"
  filter: {
    types,             // ["beast", "humanlike", "undead", "construct"]
    sizes,             // ["small", "medium", "large"]
    maxHD,             // number OR function(caster)
    pack,              // compendium pack id ("vce-beasts", "vce-undead")
    customFilter,      // optional (creatureData) => boolean
  },
  favorites,           // actor flag key to read favorites from (optional)
}) => Promise<{ uuid } | null>
```
Returns the selected creature's UUID or `null` if cancelled.

Replaces duplicate picker code in summoner.mjs and familiar.mjs.

### 3.3 `CompanionManager` tab (UI)
**Files:**
- `scripts/companion/companion-manager-tab.mjs` (NEW)
- `templates/companion-manager-tab.hbs` (NEW)
- Tab injection via existing `getHeaderControlsActorSheetV2` hook → extend with a new `renderActorSheetV2` registration for a tab

**Replaces** the system "Summon" tab entirely. Tab label: **"Companions"**. Tab key: `vce-companions` (matches existing `vce-` prefix convention so the nav scroll/size rules already apply).

**Content:**
```
┌─ Companions ──────────────────────────────────────┐
│                                                    │
│  ┌─ Badger ────────────────────── [× Banish] ───┐ │
│  │ [port]  Badger                                │ │
│  │         [SUMMON] HD 1 · Small Beasts          │ │
│  │         ─────────────────────────────────────  │ │
│  │         HP ▓▓▓░░░░░░░  3 / 13   ARM 0         │ │
│  │         ⚡ Vulnerable                          │ │
│  │         Saves via MrLawyerGuy (Mysticism)     │ │
│  │         [Endure] [Reflex] [Will] [📋 Sheet]   │ │
│  │         ────────── ACTIONS ──────────         │ │
│  │         MAUL  Multi-Attack    2×Claw          │ │
│  │         CLAW  Melee Attack         1d3        │ │
│  │         BITE  Melee Attack         1d4        │ │
│  └─────────────────────────────────────────────┘ │
│                                                    │
│  ┌─ Whisper ────────────────────── [× Dismiss] ─┐ │
│  │ [port]  Whisper                               │ │
│  │         [FAMILIAR] HD 1 · Tiny                │ │
│  │         HP ▓▓▓▓▓▓▓▓▓▓  4 / 4   ARM 0         │ │
│  │         Saves via MrLawyerGuy (Mysticism)     │ │
│  │         [Endure] [Reflex] [Will] [📋 Sheet]   │ │
│  │         ────────── ACTIONS ──────────         │ │
│  │         BITE  Melee Attack         1d4        │ │
│  └─────────────────────────────────────────────┘ │
│                                                    │
│  ┌─ Garrek ─────────────────────── [× Dismiss] ─┐ │
│  │ [port]  Garrek                                │ │
│  │         [HIRELING] Lvl 3 Fighter              │ │
│  │         HP ▓▓▓▓▓▓▓░░░  18 / 25  ARM 4         │ │
│  │         Checks & saves via Leadership         │ │
│  │         [Endure] [Reflex] [Will] [📋 Sheet]   │ │
│  │         ────── EQUIPPED WEAPONS ──────        │ │
│  │         LONGSWORD   Melee Attack    1d8       │ │
│  │         SHORTBOW    Ranged Attack   1d6       │ │
│  │         ───────────  SPELLS  ──────────        │ │
│  │         Bless      (2 Mana)                   │ │
│  │         Light      (1 Mana)                   │ │
│  └─────────────────────────────────────────────┘ │
│                                                    │
└────────────────────────────────────────────────────┘
```

**Empty state:** "You have no active companions. Cast Summoner / conjure Familiar / cast Animate-Beast-Raise / engage a Hireling."

**Card anatomy (reuses existing VCE CSS tokens):**
- Header: `.vce-bf-header` with `headerNPCBanner.webp` background
- Type badge: new `.vce-companion-type-badge` — gold for summon, purple for familiar, green for hireling, red for undead, blue for construct
- HP bar: reuse gradient from Crawler (`--vcb-hp-ok` → `--vcb-hp-critical`)
- Action list: existing `.vce-bf-action` / `.vce-bf-action-name` / `.vce-bf-action-damage`
- Save buttons: new `.vce-save-btn` with gold accent
- Section title: existing `.vce-bf-section-title` with horizontal-rule decoration

**Auto-refresh:** Tab re-renders on `updateActor` (HP changes), `createActiveEffect` / `deleteActiveEffect` (conditions), `updateFlag` (controller flag changes), `createToken` / `deleteToken` on active scene.

### 3.4 Feature adapters
Each feature becomes a small file (~30-50 lines) that:
1. Handles UX entry point (button click, spell cast hook, ritual dialog)
2. Validates feature-specific preconditions (e.g., Familiar: must be during rest)
3. Calls `CreaturePicker.pick(...)` with a filter
4. Calls `CompanionSpawner.spawn(...)` with a config
5. Handles feature-specific post-spawn (e.g., Summoner: acquire focus, Conjurer: consume Action)

**Phase 1 adapters** (refactor existing):
- `scripts/class-features/summoner.mjs` → refactor to use engine
- `scripts/perk-features/familiar.mjs` → refactor to use engine

**Phase 2 adapters** (new — each its own PR):
- `scripts/spell-features/beast-summoner.mjs`
- `scripts/spell-features/animate-summoner.mjs`
- `scripts/spell-features/raise-summoner.mjs`
- `scripts/perk-features/conjurer.mjs`
- `scripts/perk-features/reanimator.mjs`
- `scripts/perk-features/animal-companion.mjs`

---

## 4. Data Model

### Flags on the companion's world actor
```js
flags["vagabond-character-enhancer"] = {
  // v0.3.4 (existing — no change)
  controllerActorId: "<PC actor id>",
  controllerType:    "companion" | "hireling",

  // NEW in v0.4.0
  companionMeta: {
    sourceId:     "summoner" | "familiar" | "spell-beast" | "hireling-manual" | ...,
    skill:        "mana" | "leadership",
    spawnedAt:    1744400000000,
    sceneId:      "<scene id>",
    tokenId:      "<token id>",      // the token on the scene
    terminateOn:  ["zeroHP"],
    cost:         { mana: 2 },
    duration:     null | { rounds: 10, startedAt: 1744400000000 },
    meta:         { hd: 1, ... }      // source-specific extras
  }
}
```

### Source registry (hard-coded constant)
```js
// scripts/companion/companion-sources.mjs
export const COMPANION_SOURCES = {
  summoner: {
    label: "Summon",
    badgeColor: "#7b5e00",    // gold
    skill: "mana",
    controllerType: "companion",
    terminateOn: ["zeroHP"],
  },
  familiar: {
    label: "Familiar",
    badgeColor: "#4a2080",    // purple
    skill: "mana",
    controllerType: "companion",
    terminateOn: ["zeroHP", "ritualRecast"],
  },
  "spell-beast": {
    label: "Beast",
    badgeColor: "#2d5e3a",    // forest green
    skill: "mana",
    controllerType: "companion",
    terminateOn: ["zeroHP", "duration"],
  },
  "spell-animate": {
    label: "Animated",
    badgeColor: "#2d4a7e",    // steel blue
    skill: "mana",
    controllerType: "companion",
    terminateOn: ["zeroHP", "duration"],
  },
  "spell-raise": {
    label: "Raised",
    badgeColor: "#5e1a1a",    // dark red
    skill: "mana",
    controllerType: "companion",
    terminateOn: ["zeroHP", "duration"],
  },
  "perk-conjurer": {
    label: "Conjured",
    badgeColor: "#8a7b00",    // darker gold
    skill: "mana",
    controllerType: "companion",
    terminateOn: ["zeroHP"],
  },
  "perk-reanimator": {
    label: "Reanimated",
    badgeColor: "#4e1a1a",    // darker red
    skill: "mana",
    controllerType: "companion",
    terminateOn: ["zeroHP", "shift"],
  },
  "perk-animal-companion": {
    label: "Companion",
    badgeColor: "#2d6e3a",    // green
    skill: "mana",
    controllerType: "companion",
    terminateOn: ["zeroHP"],
  },
  "hireling-manual": {
    label: "Hireling",
    badgeColor: "#1a5a1a",    // green
    skill: "leadership",
    controllerType: "hireling",
    terminateOn: [],          // manual only
  },
};
```

---

## 5. Termination Handlers

A single `CompanionTerminationManager` listens for conditions and dispatches dismissal:

| Trigger | Hook | Action |
|---|---|---|
| `zeroHP` | `updateActor` (HP dropping to 0) | `CompanionSpawner.dismiss(actor, { reason: "defeated" })` |
| `duration` | Turn tick (per-round countdown) | Dismiss when `duration.rounds` elapsed |
| `manaLapse` | Per-round mana check | Dismiss if caster can't pay upkeep |
| `ritualRecast` | New ritual spawn with same `sourceId` | Dismiss previous companion first |
| `shift` | New day / long rest | Dismiss all `shift`-terminated companions |

Implementation: new module `scripts/companion/companion-termination.mjs`. Single `Hooks.on("updateActor")` listener reads the companion's own `companionMeta.terminateOn` and decides whether to fire. Duration countdown uses an existing scene flag or combatant turn hook — no setTimeout.

---

## 6. Migration from v0.3.4

Existing v0.3.4 flags (`controllerActorId`, `controllerType`) are **preserved as-is**. The new `companionMeta` flag is additive. No migration script needed.

Companions stamped before v0.4.0 will have the v0.3.4 flags but no `companionMeta`. The CompanionManager tab will render them with:
- `sourceId: "legacy"` (fallback in source registry)
- Type badge matching `controllerType` (companion or hireling)
- No termination handlers (so they behave as they did — you manage them manually)

Users can re-cast the spell / re-invoke the perk to get the full companionMeta on a fresh spawn.

---

## 7. UI Wiring Details

### Tab registration
In `scripts/vagabond-character-enhancer.mjs` (ready hook), hook into the character sheet's tab structure:
- Locate the existing "Summon" tab (`data-tab="vce-summon"` — already injected by system)
- **Replace** the tab's content render pipeline with our new renderer
- Keep the tab label translatable

*Fallback:* If the system removes the Summon tab in a future version, detect absence and inject our own tab at the same position.

### Action-click routing
Clicking an action in a companion card invokes the token actor's roll method. This **already works** — the existing `.vce-summon-action` click handler in `class-features/summoner.mjs` will be preserved; just move the click binding into the new tab renderer.

Save-button clicks call the existing save-routing pipeline via chat card creation, so save routing to the controller PC happens automatically (already in v0.3.4).

### Dismiss button
Calls `CompanionSpawner.dismiss(actor, { reason: "manual" })`. GM-proxied via `socket-relay.mjs` (existing `removeToken` + `deleteActor` ops).

---

## 8. Phase 1 Deliverables (v0.4.0)

1. `scripts/companion/companion-spawner.mjs` — engine
2. `scripts/companion/creature-picker.mjs` — shared dialog
3. `scripts/companion/companion-sources.mjs` — source registry constant
4. `scripts/companion/companion-termination.mjs` — termination manager
5. `scripts/companion/companion-manager-tab.mjs` — tab renderer
6. `templates/companion-manager-tab.hbs` — tab template
7. CSS additions to `styles/vagabond-character-enhancer.css` — `.vce-companion-card`, `.vce-companion-type-badge`, `.vce-save-btn`, HP gradient
8. Refactor `scripts/class-features/summoner.mjs` — use engine instead of inline placeToken
9. Refactor `scripts/perk-features/familiar.mjs` — use engine instead of inline placeToken
10. Registration in `scripts/vagabond-character-enhancer.mjs` ready hook
11. CHANGELOG.md + version bump 0.3.4 → 0.4.0

**Does NOT ship in Phase 1:**
- New summoning features (Beast, Animate, Raise, Conjurer, Reanimator, Animal Companion)
- GM master view
- Per-companion duration timers (only `zeroHP` and `ritualRecast` triggers wired up — other trigger types are stubbed but dormant)

## 9. Phase 2 Deliverables (v0.5.x — one PR per adapter)

Each adapter ships independently. Adapter PR structure:
1. Adapter file (~30-50 lines)
2. Spell/perk registry entry update (mark status: "implemented")
3. Adapter-specific UI hook (e.g., cast-time dialog, perk activation button)
4. Changelog line
5. Smoke test in plan

Order (low-risk first):
- Beast spell (pattern most like Summoner)
- Animate spell (pattern most like Summoner + duration)
- Raise spell (needs corpse-target picker — unique UX)
- Conjurer perk (resummon-from-defeated-list — unique storage)
- Reanimator perk (shift termination — unique trigger)
- Animal Companion perk (permanent — no termination triggers)

Each adapter PR gets its own spec + plan using the same workflow.

---

## 10. Testing Plan — Phase 1

### Unit (manual Foundry console)
- `CompanionSpawner.spawn(...)` with valid config → token exists, flags stamped, combat-added
- `CompanionSpawner.dismiss(...)` → token removed, flags cleared, chat notification
- `CreaturePicker.pick(...)` with each filter → correct list shown, selection returns UUID
- `getCompanionsFor(pc)` returns all flagged companions across scene and world

### Integration
- Summon a beast via Summoner spell → appears in Companions tab with correct badge + HP + actions
- Conjure familiar via ritual → appears in Companions tab with Familiar badge
- Engage hireling via manual controller dialog → appears in Companions tab with Hireling badge
- Click action on summon → weapon roll routes through controller (existing v0.3.4 behavior)
- Take damage to 0 HP → auto-dismiss fires, chat notification, card disappears

### Regression
- Character sheet for non-summoner / non-caster PC → Companions tab renders empty state cleanly
- Non-character actor sheet (NPC) → no tab added
- Save from chat card → still routes through controller (v0.3.4 behavior preserved)
- Hireling attack → still routes through Leadership (v0.3.4 behavior preserved)

### Multi-client (standard Foundry sync — not a custom GM view)
- Player spawns summon → GM's view of that player's sheet shows identical state
- GM dismisses a token on the canvas → player's Companions tab updates (via `deleteToken` hook refresh)
- Player loses connection → companions persist on canvas with flags intact; reconnect restores tab

---

## 11. Risks & Resolved Questions

**Risk 1 — System Summon tab conflict.** The `[data-tab="vce-summon"]` tab is actually VCE-owned (prefix confirms) — not a system tab. In the initial exploration I assumed the system provided it, but the `vce-` prefix means we injected it ourselves. **Decision:** rename the tab key from `vce-summon` to `vce-companions`, update the tab label, and replace the render pipeline cleanly. No system conflict. Task 1 of the plan should confirm this is VCE-owned and find the current injection site.

**Risk 2 — Familiar flag storage migration.** Current familiar stores state in `flags.vagabond-character-enhancer.activeFamiliar` (single object, caster-side). New model stores on the familiar token's world actor. Need to write a small one-time migration on ready hook or continue reading both locations.

**Q1 (resolved) — Hireling action list.** Show **equipped weapons and prepared/equipped spells** on the hireling card, not the full sheet. Mirror the way a PC surfaces usable actions:
- Pull `actor.items` filtered to `type: "weapon"` where `system.equipped === true`
- Pull `actor.items` filtered to `type: "spell"` (all spells — hirelings don't have "prepared" state, all are available)
- Render using the existing `.vce-bf-action` pattern (click → roll, routed through Leadership per v0.3.4)
- Non-equipped weapons, inventory items, perks, abilities → not shown on the card (player opens the full sheet via the `📋 Sheet` button for those)

Note: companions from summoner/familiar/beast/etc. keep their creature-style action list (MAIN / MELEE / damage-die format) since they're NPC-type actors. Only hirelings (character-type) use the equipped-weapons-and-spells pattern.

**Q2 (resolved) — Multi-companion vs multi-summon.** 
- **Multiple companions of different sources: ALLOWED.** A PC can simultaneously have 1 summon + 1 familiar + 1 hireling + 1 animal companion.
- **Multiple of the same source: BLOCKED.** Attempting to cast Summoner's summon while an active summon exists triggers an auto-dismiss-and-replace flow (with a confirm prompt). Same for Familiar ritual, Beast spell, etc.
- Enforcement: `CompanionSpawner.spawn()` checks `getCompanionsFor(caster).filter(c => c.sourceId === config.sourceId)`. If one exists, prompt "Replace active {source}?" before dismissing the old and spawning the new.
- This is **rules-accurate** for Summoner (one summon at a time) and matches Familiar's "recast replaces previous" behavior.

---

## 12. Not in Scope

- **Druid Polymorph** — self-transformation, not a companion (stays in `scripts/polymorph/`)
- **Control spell** — charms existing enemy, not a spawn (stays flavor/todo)
- **GM master companion view** — deferred; player-first only in v0.4.0
- **Companion turn automation** (auto-roll initiative turn, auto-select actions) — deferred
- **Cross-scene companion handoff** — deferred; companions are scene-bound
