# Vagabond Claude GM — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a Claude-controlled GM that runs a Vagabond megadungeon campaign in FoundryVTT v13 via MCP, using Mythic GME 2E for emergent play and existing modules for content generation.

**Architecture:** Two thin Foundry-side API shims (Mythic Tools fork + operator's `random-table` module) + a new project repo (`vagabond-claude-gm`) holding GM persona prompt, campaign state schema, theme/level data, and runbooks. No new MCP server in v1; Claude orchestrates via existing `foundry-mcp-bridge`. Adventure spine is Zach Moeller's pre-walled Megadungeon Levels 1–XII.

**Tech Stack:** FoundryVTT v13, JavaScript ES modules (Foundry-side shims), JSON (campaign state), Markdown (prompt + runbooks), Claude Code `/loop`. Foundry modules: `mythic-gme-tools` (fork), `random-table`, `zm-map-collection`, `foundry-mcp-bridge`, `vce`, `vagabond-crawler`.

**Spec:** `docs/superpowers/specs/2026-05-05-vagabond-claude-gm-design.md` — read this first for full design rationale.

---

## File Structure

### Foundry module shims

**`F:/GIT/foundryvtt-mythic-gme/`** (fork — light touch)
- Create: `src/api/mgme-api.js` — programmatic API shim wrapping `MGMECore2e` static methods
- Modify: `mythic-gme-tools.js` — register `game.modules.get('mythic-gme-tools').api` on `ready` hook

**`E:/FoundryVTTv13/data/Data/modules/random-table/`** (operator's module — light touch)
- Create: `scripts/random-table-api.mjs` — programmatic API shim wrapping existing generators
- Modify: `scripts/random-table.mjs` — register `game.randomTable.api` on `ready` hook

### `F:/GIT/vagabond-claude-gm/` (new project repo)

**Root:**
- `README.md` — what this is, install/run instructions
- `CLAUDE.md` — project-level Claude context, mirroring VCE conventions
- `.gitignore` — ignore `campaign/`, `node_modules/`, etc.

**`docs/`:**
- `design.md` — copy of the spec

**`data/vagabond/`:**
- `megadungeon-levels.json` — maps level # → ZM scene compendium id, depth tier, theme hint
- `encounter-tiers.json` — maps level # → Random Table encounter tier
- `zone-overrides.json` — maps compendium actor id → combat zone (frontline/midline/backline)
- `faction-archetypes.json` — starter faction templates Claude can pull from

**`prompt/`:**
- `system-prompt.md` — top-level GM persona
- `procedures/wake-on-chat.md` — should-I-respond decision tree
- `procedures/megadungeon-kickoff.md` — surface hook + first descent
- `procedures/level-init.md` — first-visit theme/faction/encounter rolls
- `procedures/level-transition.md` — ascend/descend, scene swap, sceneTest
- `procedures/exploration-flow.md` — per-room/per-corridor Mythic loop
- `procedures/combat-handoff.md` — combat protocol with VCE/zones
- `procedures/mythic-procedure.md` — when to roll, how to interpret
- `procedures/retreat-and-resupply.md` — surface trips
- `procedures/narration-style.md` — voice, length, tone rules

**`templates/new-campaign/`:**
- `state.json` — global mechanic state skeleton
- `megadungeon-state.json` — per-campaign megadungeon position
- `threads.md`, `characters.md`, `factions.md`, `world-facts.md`, `scene-log.md` — empty markdown skeletons
- `levels/.gitkeep` — preserves directory in template

**`runbook/`:**
- `setup.md` — install all modules, configure Foundry, register `game.user`
- `kickoff.md` — start a new campaign
- `operator-cheatsheet.md` — vocabulary the operator uses with Claude

**`tests/`:**
- `mgme-api-smoke.md` — manual smoke test for Mythic Tools shim
- `random-table-api-smoke.md` — manual smoke test for Random Table shim
- `e2e-kickoff-smoke.md` — end-to-end smoke test (full kickoff → Level 1 entry)

---

## Tasks

### Task 0: Discovery — inspect MGMECore2e public surface

We sketched the Mythic API in the spec, but the actual method signatures of `MGMECore2e` need verification before writing the shim. This is a **research-only** task; produce a decisions doc, no code.

**Files:**
- Create: `F:/GIT/vagabond-claude-gm/docs/discovery-mgme.md`

- [ ] **Step 1: Read MGMECore2e source**

Open `F:/GIT/foundryvtt-mythic-gme/src/logic/mgme-core-2e.js` and read every static method. Note method name, params (none — they're all parameterless), what they call (Roll Tables, oracles, hooks).

- [ ] **Step 2: Read MGMEOracleUtils**

Open `F:/GIT/foundryvtt-mythic-gme/src/utils/mgme-oracle-utils.js`. The shim will likely call `_mgmeMultipleTableOracle` and `_mgmeSimpleTableOracle` directly. Note their signatures.

- [ ] **Step 3: Identify the Fate Chart logic**

Search `F:/GIT/foundryvtt-mythic-gme/` for "fateQuestion", "FateChart", "fate-chart". The Fate Chart dialog logic is probably in a different file (`mgme-core.js` or a panel file). Find where the d100 roll happens and where odds × chaos → percentage lookup happens.

```bash
cd F:/GIT/foundryvtt-mythic-gme && grep -rn "fate" src/ | grep -i chart
```

- [ ] **Step 4: Identify Random Event generation**

Find where `_mgmeRollEventFocus` (or similar) lives. Trace how the Event Focus Table → Meaning Tables flow works.

- [ ] **Step 5: Find chaos factor storage**

Search for "chaos" — how is the Chaos Factor stored? Foundry world setting? Module flag? Document the read/write path.

```bash
cd F:/GIT/foundryvtt-mythic-gme && grep -rn "chaos" src/
```

- [ ] **Step 6: Document findings**

Write `F:/GIT/vagabond-claude-gm/docs/discovery-mgme.md` with sections:

```markdown
# MGME Discovery — internal API reference

## Static methods on MGMECore2e
- mgmeActions() — calls _mgmeMultipleTableOracle(['Action Meaning', 'Action Meaning']), posts to chat
- mgmeDescriptions() — ...
- mgmeSceneAdjust() — ...
... (one entry per method)

## Helper utilities
- MGMEOracleUtils._mgmeMultipleTableOracle(tables, label)
  - tables: [{name, key?}, ...]
  - returns: undefined (posts chat card as side effect)
  - the actual roll happens in: <file:line>

## Fate Chart implementation
- Dialog at: <file:line>
- Odds×Chaos → percentage at: <file:line>
- Roll happens at: <file:line>
- Result returned via: <how>

## Random Event implementation
- Event Focus roll at: <file:line>
- Meaning Tables flow at: <file:line>

## Chaos Factor storage
- Read: <code path>
- Write: <code path>
- Default: 5

## Implementation notes for the shim
- For each public API method we want to expose, note: which existing method to call, where to intercept the result before chat-posting, async/sync, return shape.
```

- [ ] **Step 7: Commit**

```bash
cd F:/GIT/vagabond-claude-gm && git add docs/discovery-mgme.md && git commit -m "docs: discovery notes for Mythic GME Tools internals"
```

(If the repo doesn't exist yet — Task 3 creates it. Run this commit step at the end of Task 3 instead.)

---

### Task 1: Mythic Tools API shim

Add a minimal API surface to the forked module. Each method calls the existing implementation, captures the result, returns it as a structured object, AND lets the existing chat-post happen.

**Files:**
- Create: `F:/GIT/foundryvtt-mythic-gme/src/api/mgme-api.js`
- Modify: `F:/GIT/foundryvtt-mythic-gme/mythic-gme-tools.js` (entry point — append `~5 lines`)
- Test: `F:/GIT/vagabond-claude-gm/tests/mgme-api-smoke.md`

> **Note:** the shape of `mgme-api.js` below is the v1 sketch. Adjust according to discovery (Task 0). If a method's underlying implementation doesn't yield a structured result we can intercept, fall back to (a) reading the most recent chat message we posted, parsing it, OR (b) reimplementing the roll logic against the same RollTable.

- [ ] **Step 1: Write smoke test runbook**

```markdown
# Mythic Tools API — smoke test

Run in a Foundry world with `mythic-gme-tools` (this fork) enabled.

Open browser dev tools console. Run each line; record actual output:

```js
// Setup
const api = game.modules.get('mythic-gme-tools').api;

// 1. Fate Question
await api.fateQuestion({odds: 'likely', chaos: 5})
// Expected: { answer: 'Yes' | 'No' | 'Exceptional Yes' | 'Exceptional No', exceptional: bool, randomEvent: bool }

// 2. Random Event
await api.randomEvent()
// Expected: { focus: '<focus-text>', action: ['word', 'word'], description: ['word', 'word'] }

// 3. Meaning Table
await api.meaningTable('Action')
// Expected: { result: ['word', 'word'] | 'word' }

// 4. Scene Test
await api.sceneTest({chaos: 5})
// Expected: { result: 'expected' | 'altered' | 'interrupt' }

// 5. NPC Behavior
await api.npcBehavior()
// Expected: { action: '<text>', descriptor: '<text>' }

// 6. Chaos Factor
api.chaos.get()  // Expected: number 1-9
api.chaos.increase()  // Expected: number incremented (clamped)
api.chaos.decrease()  // Expected: number decremented (clamped)

// 7. Lists
await api.lists.threads.add('test thread')
await api.lists.threads.get()  // Expected: array containing 'test thread'
await api.lists.threads.remove(0)  // remove by index
await api.lists.characters.add('test NPC')
await api.lists.characters.get()  // Expected: array containing 'test NPC'

// 8. Verify chat side effects
// Each call above should ALSO have posted a chat card. Check chat panel.
```

Pass criteria: every call returns the expected shape AND posts a chat card.
```

Save to `F:/GIT/vagabond-claude-gm/tests/mgme-api-smoke.md`.

- [ ] **Step 2: Run smoke test against UNMODIFIED module to verify failure**

Open Foundry, run the first line:

```js
game.modules.get('mythic-gme-tools').api
```

Expected: `undefined` (api doesn't exist yet — proves we need to add it).

- [ ] **Step 3: Create the shim file**

Create `F:/GIT/foundryvtt-mythic-gme/src/api/mgme-api.js`:

```js
import MGMECore2e from "../logic/mgme-core-2e.js";
import MGMECommon from "../utils/mgme-common.js";
import MGMEOracleUtils from "../utils/mgme-oracle-utils.js";

const CHAOS_KEY = 'chaos';  // confirm via discovery — adjust if different
const CHAOS_MIN = 1;
const CHAOS_MAX = 9;

function _getChaosSetting() {
  return Number(game.settings.get('mythic-gme-tools', CHAOS_KEY)) || 5;
}

function _setChaosSetting(n) {
  const clamped = Math.max(CHAOS_MIN, Math.min(CHAOS_MAX, Math.floor(n)));
  return game.settings.set('mythic-gme-tools', CHAOS_KEY, clamped);
}

async function _drawTable(name) {
  const table = game.tables.find(t => t.name === name)
    || (await MGMEOracleUtils._mgmeFindTable?.(name))
    || null;
  if (!table) throw new Error(`Mythic table not found: ${name}`);
  const draw = await table.draw({displayChat: true});
  return draw.results.map(r => r.text || r.getChatText?.() || '').filter(Boolean);
}

export const MGMEApi = {
  /**
   * Ask a Fate Question.
   * @param {{odds: string, chaos: number}} input
   * @returns {Promise<{answer: string, exceptional: boolean, randomEvent: boolean}>}
   */
  async fateQuestion({odds, chaos}) {
    // Fate Chart lookup → percentage → d100 roll → answer + double-detection
    // Implementation detail: locate the Fate Chart logic per discovery doc.
    // For v1 sketch: reuse the dialog's underlying calculator if exposed,
    // otherwise reimplement against the published 2E table.
    const chaosFactor = chaos ?? _getChaosSetting();
    const result = await MGMEApi._fateChartRoll(odds, chaosFactor);
    return result;
  },

  async fateCheck({modifier = 0, chaos}) {
    const chaosFactor = chaos ?? _getChaosSetting();
    const result = await MGMEApi._fateCheckRoll(modifier, chaosFactor);
    return result;
  },

  async randomEvent() {
    const focus = await _drawTable('Mythic GME: Event Focus Table (2e)');
    const action = await _drawTable('Mythic GME: Action Meaning Table (2e)');
    const description = await _drawTable('Mythic GME: Descriptions Meaning Table (2e)');
    return {
      focus: focus[0],
      action: action.length === 2 ? action : [action[0], action[0]],
      description: description.length === 2 ? description : [description[0], description[0]],
    };
  },

  async meaningTable(name) {
    const table = `Mythic GME: ${name} (2e)`;
    const result = await _drawTable(table);
    return {result: result.length === 1 ? result[0] : result};
  },

  async sceneTest({chaos}) {
    const c = chaos ?? _getChaosSetting();
    const roll = await new Roll('1d10').evaluate({async: true});
    const v = roll.total;
    let result;
    if (v <= c) result = (v % 2 === 0) ? 'altered' : 'interrupt';
    else result = 'expected';
    // post a chat card mirroring native UI
    ChatMessage.create({
      content: `<b>Scene Test</b> (Chaos ${c}): rolled ${v} → <b>${result}</b>`
    });
    return {result, roll: v, chaos: c};
  },

  async sceneAdjustment() {
    const result = await _drawTable('Mythic GME: Scene Adjustment Table (2e)');
    return {adjustment: result[0]};
  },

  async npcBehavior({npc = null} = {}) {
    const action = await _drawTable('Mythic GME: NPC Behavior Table — Action');
    const descriptor = await _drawTable('Mythic GME: NPC Behavior Table — Descriptor');
    return {action: action[0], descriptor: descriptor[0]};
  },

  chaos: {
    get: _getChaosSetting,
    set: _setChaosSetting,
    increase: () => _setChaosSetting(_getChaosSetting() + 1),
    decrease: () => _setChaosSetting(_getChaosSetting() - 1),
  },

  lists: {
    threads: {
      async add(text) {
        const table = await MGMEApi._findOrCreateList('Threads List');
        return table.createEmbeddedDocuments('TableResult', [{
          text, range: [table.results.size + 1, table.results.size + 1], weight: 1
        }]);
      },
      async remove(idOrIndex) {
        const table = await MGMEApi._findOrCreateList('Threads List');
        const result = typeof idOrIndex === 'number'
          ? table.results.contents[idOrIndex]
          : table.results.get(idOrIndex);
        if (result) await result.delete();
      },
      async get() {
        const table = await MGMEApi._findOrCreateList('Threads List');
        return table.results.contents.map(r => ({id: r.id, text: r.text}));
      },
    },
    characters: {
      async add(text) {
        const table = await MGMEApi._findOrCreateList('NPCs List');
        return table.createEmbeddedDocuments('TableResult', [{
          text, range: [table.results.size + 1, table.results.size + 1], weight: 1
        }]);
      },
      async remove(idOrIndex) {
        const table = await MGMEApi._findOrCreateList('NPCs List');
        const result = typeof idOrIndex === 'number'
          ? table.results.contents[idOrIndex]
          : table.results.get(idOrIndex);
        if (result) await result.delete();
      },
      async get() {
        const table = await MGMEApi._findOrCreateList('NPCs List');
        return table.results.contents.map(r => ({id: r.id, text: r.text}));
      },
    },
  },

  // --- internals (confirm against discovery doc; adjust as needed) ---

  async _findOrCreateList(name) {
    let table = game.tables.find(t => t.name === name);
    if (!table) {
      table = await RollTable.create({name, formula: '1d10', replacement: false});
    }
    return table;
  },

  async _fateChartRoll(odds, chaosFactor) {
    // Real implementation: lookup percentage from Fate Chart 2E
    // (matrix of odds × chaos factor → percentage). Roll d100. Detect doubles.
    // Sketch: replace this body with the calculator from the existing dialog.
    const FATE_CHART = {/* odds → [chaos-1..chaos-9] percentages */};
    const row = FATE_CHART[odds];
    if (!row) throw new Error(`Unknown odds: ${odds}`);
    const target = row[chaosFactor - 1];
    const roll = await new Roll('1d100').evaluate({async: true});
    const v = roll.total;
    const exceptional = v <= Math.floor(target / 5) || v >= 100 - Math.floor((100 - target) / 5);
    const answer = (v <= target ? 'Yes' : 'No') + (exceptional ? ' (Exceptional)' : '');
    const onesPlace = v % 10;
    const tensPlace = Math.floor(v / 10) % 10;
    const randomEvent = (onesPlace === tensPlace) && (v <= chaosFactor * 11);
    ChatMessage.create({
      content: `<b>Fate Question</b> (${odds}, Chaos ${chaosFactor}, target ${target}): rolled ${v} → <b>${answer}</b>${randomEvent ? ' [Random Event]' : ''}`
    });
    return {answer, exceptional, randomEvent, roll: v, target};
  },

  async _fateCheckRoll(modifier, chaosFactor) {
    // Mythic 2E Fate Check uses 2d10 + modifier vs target derived from chaos.
    // Adjust per discovery — this is a placeholder.
    const roll = await new Roll(`2d10 + ${modifier}`).evaluate({async: true});
    const v = roll.total;
    const target = 11 - chaosFactor;
    const answer = v >= target ? 'Yes' : 'No';
    return {answer, exceptional: false, randomEvent: false, roll: v, target};
  },
};
```

> ⚠️ The `_fateChartRoll` and `_fateCheckRoll` implementations above are **sketches**. The actual Fate Chart 2E percentages and the Fate Check formula must be transcribed from the discovery findings (Task 0). Replace the bodies with the real calculator before considering Task 1 done.

- [ ] **Step 4: Wire the API into module load**

Modify `F:/GIT/foundryvtt-mythic-gme/mythic-gme-tools.js` (entry point). Append after the existing `Hooks.once('ready', ...)`:

```js
// API surface for programmatic consumers (e.g. Vagabond Claude GM)
import { MGMEApi } from './src/api/mgme-api.js';

Hooks.once('ready', () => {
  const mod = game.modules.get('mythic-gme-tools');
  if (mod) mod.api = MGMEApi;
});
```

(Adjust path import based on where the entry file lives in the fork.)

- [ ] **Step 5: Run smoke test against modified module**

Reload Foundry. Open dev console. Run all lines from `tests/mgme-api-smoke.md` step by step. Record actual outputs.

Pass criteria: every call returns the expected shape AND posts a chat card.

If a call fails (e.g. RollTable not found, percentage off): debug, fix, repeat.

- [ ] **Step 6: Document any discovered deviations**

Edit `F:/GIT/vagabond-claude-gm/docs/discovery-mgme.md` with a "Shim deltas" section noting any places where the actual implementation differs from the sketch. Future maintainers (and Phase 2 SDK) need this.

- [ ] **Step 7: Commit**

```bash
cd F:/GIT/foundryvtt-mythic-gme
git add src/api/mgme-api.js mythic-gme-tools.js
git commit -m "feat(api): add programmatic API shim returning structured Mythic results"
```

---

### Task 2: Random Table API shim

Same pattern, simpler module — operator owns it; existing generators are well-documented.

**Files:**
- Create: `E:/FoundryVTTv13/data/Data/modules/random-table/scripts/random-table-api.mjs`
- Modify: `E:/FoundryVTTv13/data/Data/modules/random-table/scripts/random-table.mjs` (append `~5 lines`)
- Test: `F:/GIT/vagabond-claude-gm/tests/random-table-api-smoke.md`

- [ ] **Step 1: Write smoke test runbook**

Create `F:/GIT/vagabond-claude-gm/tests/random-table-api-smoke.md`:

```markdown
# Random Table API — smoke test

Run in Foundry with `random-table` enabled. Browser dev console:

```js
const api = game.randomTable.api;

// 1. Encounter
await api.encounter({env: 'Underground', tier: 'easy'})
// Expected: { description: string, creatures: [...], complication?: string }

// 2. Room dressing
await api.roomDressing({location: 'Dungeon Cell', count: 5})
// Expected: { items: [string × 5] }

// 3. Quest hook
await api.questHook({category: 'Dungeon'})
// Expected: { hook: string, complication?: string, questObject?: {...} }

// 4. Lost location
await api.lostLocation({type: 'Underground'})
// Expected: { name, epithet, legend, hook? }

// 5. NPC
await api.npc()
// Expected: { firstName, surname, motivations, quirk, secret, rumor }

// 6. Loot
await api.loot({type: 'weapon', sentient: false})
// Expected: { item, effects: [...], personality?: null }

// 7. Blessing
await api.blessing({type: 'Blessing'})
// Expected: { name, description, effects: [...] }

// 8. Adventure
await api.adventure({theme: 'Dungeon Crawl', skipMap: true})
// Expected: { hook, threat, npc, encounters: [...], roomFeatures: [...], complication?, treasure?, mapId: null }
```

Pass criteria: every call returns the expected shape, no errors, no missing fields.
```

- [ ] **Step 2: Read the existing generator surfaces**

```bash
ls E:/FoundryVTTv13/data/Data/modules/random-table/scripts/
```

Open each generator under `scripts/<area>/<area>-generator.mjs`. Note the entry methods that produce results without showing UI dialogs. Most generators have a "roll" or "generate" method that returns an object — these are the ones the API shim wraps.

- [ ] **Step 3: Create the shim**

Create `E:/FoundryVTTv13/data/Data/modules/random-table/scripts/random-table-api.mjs`:

```js
// Programmatic API for random-table module.
// Wraps existing generators to return structured results without opening dialogs.

export class RandomTableApi {
  static async encounter({env, tier} = {}) {
    const gen = game.randomTable.encounters;
    if (!gen) throw new Error('encounters generator not initialized');
    return gen.rollHeadless({env, tier});
  }

  static async roomDressing({location, count = 5} = {}) {
    const gen = game.randomTable.roomDressing;
    if (!gen) throw new Error('roomDressing generator not initialized');
    return gen.rollHeadless({location, count});
  }

  static async questHook({category} = {}) {
    const gen = game.randomTable.questHooks;
    if (!gen) throw new Error('questHooks generator not initialized');
    return gen.rollHeadless({category});
  }

  static async lostLocation({type} = {}) {
    const gen = game.randomTable.lostLocations;
    if (!gen) throw new Error('lostLocations generator not initialized');
    return gen.rollHeadless({type});
  }

  static async npc({gender} = {}) {
    const gen = game.randomTable.npcRoller;
    if (!gen) throw new Error('npcRoller generator not initialized');
    return gen.rollHeadless({gender});
  }

  static async loot({type, sentient = false} = {}) {
    const gen = game.randomTable.loot;
    if (!gen) throw new Error('loot generator not initialized');
    return gen.rollHeadless({type, sentient});
  }

  static async blessing({type} = {}) {
    const gen = game.randomTable.blessings;
    if (!gen) throw new Error('blessings generator not initialized');
    return gen.rollHeadless({type});
  }

  static async mutator(actorId, mode) {
    const gen = game.randomTable.mutator;
    if (!gen) throw new Error('mutator generator not initialized');
    return gen.rollHeadless({actorId, mode});
  }

  static async adventure({theme, skipMap = true} = {}) {
    const gen = game.randomTable.adventure;
    if (!gen) throw new Error('adventure generator not initialized');
    return gen.rollHeadless({theme, skipMap});
  }
}
```

> ⚠️ Each generator must expose a `rollHeadless` method that returns structured data without rendering a dialog. If existing generators only have `roll` methods that mutate UI state, **add `rollHeadless` methods to each generator file** — extract the table-rolling logic into a pure function, leave the UI-driven `roll` as a wrapper. This is a Step 4-6 sub-effort.

- [ ] **Step 4: Audit each generator for headless support**

For each of the 9 generators:

```bash
cd E:/FoundryVTTv13/data/Data/modules/random-table/scripts
ls */
```

Open `loot/loot-generator.mjs`, `mutator/monster-mutator.mjs`, `npc-tables/npc-roller.mjs`, `blessings/blessings-generator.mjs`, `encounters/encounter-generator.mjs`, `room-dressing/room-dressing-generator.mjs`, `quests/quest-hook-generator.mjs`, `lost-locations/lost-locations-generator.mjs`, `adventure/adventure-generator.mjs`.

For each: identify the inner table-rolling function. If it's already pure (returns an object), add `rollHeadless` as an alias. If it's tangled with UI, extract a pure function.

Example for `npc-roller.mjs`: most likely there's a `_rollProfile()` private that returns `{firstName, surname, motivations, quirk, secret, rumor}`. Expose it via `rollHeadless({gender}) { return this._rollProfile(gender); }`.

- [ ] **Step 5: Wire the API into module load**

Modify `E:/FoundryVTTv13/data/Data/modules/random-table/scripts/random-table.mjs`. Find the existing `Hooks.once('ready', ...)` (or the place where `game.randomTable = ...` is registered). Append:

```js
import { RandomTableApi } from './random-table-api.mjs';

Hooks.once('ready', () => {
  if (game.randomTable) {
    game.randomTable.api = RandomTableApi;
    const mod = game.modules.get('random-table');
    if (mod) mod.api = RandomTableApi;
  }
});
```

- [ ] **Step 6: Reload Foundry, run smoke test**

F5 the Foundry tab. Open dev console. Run every line from `tests/random-table-api-smoke.md`. Record actual outputs. Fix any failures.

- [ ] **Step 7: Commit**

```bash
cd E:/FoundryVTTv13/data/Data/modules/random-table
git add scripts/random-table-api.mjs scripts/random-table.mjs scripts/*/
git commit -m "feat(api): add programmatic API surface for random-table generators"
```

---

### Task 3: Initialize `vagabond-claude-gm` repo

**Files:**
- Create: `F:/GIT/vagabond-claude-gm/` (directory + git init)
- Create: `F:/GIT/vagabond-claude-gm/README.md`
- Create: `F:/GIT/vagabond-claude-gm/CLAUDE.md`
- Create: `F:/GIT/vagabond-claude-gm/.gitignore`
- Create: `F:/GIT/vagabond-claude-gm/docs/design.md` (copy from VCE spec)

- [ ] **Step 1: Create directory and initialize git**

```bash
mkdir -p F:/GIT/vagabond-claude-gm/{docs,data/vagabond,prompt/procedures,prompt/examples,templates/new-campaign/levels,runbook,tests,campaign}
cd F:/GIT/vagabond-claude-gm
git init -b main
```

- [ ] **Step 2: Create README.md**

```markdown
# vagabond-claude-gm

Claude-controlled Game Master for Vagabond RPG megadungeon campaigns in FoundryVTT v13.

The party descends into Zach Moeller's Megadungeon Levels 1–XII. Claude runs the world via MCP — narrates, drives NPCs, runs combat tactics, manages loot — using Mythic GME 2E for emergent decisions.

## Stack

- **FoundryVTT v13** with the `vagabond` system, `vce`, `vagabond-crawler`, `mythic-gme-tools` (forked + API shim), `random-table` (with API shim), `zm-map-collection`, `foundry-mcp-bridge`.
- **Claude Code `/loop`** harness (Phase 1). Future: Claude Agent SDK service (Phase 2).

## Setup

See `runbook/setup.md`.

## Kickoff a campaign

See `runbook/kickoff.md`.

## Operator vocabulary

See `runbook/operator-cheatsheet.md`.

## Design

See `docs/design.md`.
```

- [ ] **Step 3: Create CLAUDE.md**

```markdown
# vagabond-claude-gm — Claude Context

You are the GM for a Vagabond RPG megadungeon campaign in FoundryVTT v13.

## What you do

- Narrate the world to players via Foundry chat (post via `foundry-mcp` tools).
- Use Mythic GME 2E for impartial decisions (`evaluate(game.modules.get('mythic-gme-tools').api.*)`).
- Use `random-table` for content (`evaluate(game.randomTable.api.*)`).
- Drive NPC actions in combat per Vagabond zone tactics; let VCE/crawler handle dice and AE.
- Maintain campaign state files under `campaign/<active-campaign>/`.

## Procedures

Read these in order at session start. They live in `prompt/procedures/`.

1. `wake-on-chat.md` — when to respond
2. `mythic-procedure.md` — when to call which Mythic API
3. `narration-style.md` — how to write
4. `megadungeon-kickoff.md` — starting a new campaign
5. `level-init.md` — populating a level on first visit
6. `level-transition.md` — descending or ascending
7. `exploration-flow.md` — per-room loop
8. `combat-handoff.md` — when combat starts
9. `retreat-and-resupply.md` — surface trips

## Hard rules

- Never fudge dice. If Mythic says No, the answer is No.
- Never speak for a PC.
- Never apply damage/conditions to PCs directly — combat workflow does that.
- Always update `campaign/` state files before responding to players.
- Always confirm Mythic + Random Table API responses match expected shape; if not, abort and report.

## Spec

Full design: `docs/design.md`.
```

- [ ] **Step 4: Create .gitignore**

```
# Campaign data is private
campaign/*
!campaign/.gitkeep

# Editor
.vscode/
.idea/

# OS
.DS_Store
Thumbs.db

# Node (in case we add tooling)
node_modules/
*.log
```

- [ ] **Step 5: Copy spec to docs/**

```bash
cp E:/FoundryVTTv13/data/Data/modules/vagabond-character-enhancer/docs/superpowers/specs/2026-05-05-vagabond-claude-gm-design.md F:/GIT/vagabond-claude-gm/docs/design.md
```

- [ ] **Step 6: Add a `campaign/.gitkeep` so the directory survives the gitignore**

```bash
touch F:/GIT/vagabond-claude-gm/campaign/.gitkeep
touch F:/GIT/vagabond-claude-gm/templates/new-campaign/levels/.gitkeep
touch F:/GIT/vagabond-claude-gm/prompt/examples/.gitkeep
```

- [ ] **Step 7: Initial commit**

```bash
cd F:/GIT/vagabond-claude-gm
git add -A
git commit -m "chore: initial repo skeleton — readme, claude.md, gitignore, design spec"
```

- [ ] **Step 8: Create GitHub remote and push**

```bash
gh repo create DimitroffVodka/vagabond-claude-gm --private --source=. --remote=origin --push
```

---

### Task 4: Author data files

Concrete starter data so Claude has something to work with at kickoff.

**Files:**
- Create: `F:/GIT/vagabond-claude-gm/data/vagabond/megadungeon-levels.json`
- Create: `F:/GIT/vagabond-claude-gm/data/vagabond/encounter-tiers.json`
- Create: `F:/GIT/vagabond-claude-gm/data/vagabond/zone-overrides.json`
- Create: `F:/GIT/vagabond-claude-gm/data/vagabond/faction-archetypes.json`

- [ ] **Step 1: Inspect `zm-map-collection` Megadungeon Level scenes**

Confirm exact compendium pack ids for all 12 levels. The module.json showed:

```
ZM-MegadungeonLevel1, ZM-MegadungeonLevel2, ZM-MegadungeonLevel3,
zm-megadungeon-level-iv, zm-megadungeon-level-v, zm-megadungeon-level-vi,
zm-megadungeon-level-vii, zm-megadungeon-level-viii, zm-megadungeon-level-ix,
zm-megadungeon-level-x, zm-megadungeon-level-xi, zm-megadungeon-level-xii
```

In Foundry, open the compendium browser, find each, capture the scene id by clicking it. Or use console:

```js
game.packs.filter(p => p.metadata.name?.toLowerCase().includes('megadungeon')).forEach(p => console.log(p.metadata.id));
```

- [ ] **Step 2: Create `megadungeon-levels.json`**

```json
{
  "1":  {"compendium": "zm-map-collection.ZM-MegadungeonLevel1",      "depth_tier": 1,  "theme_hint": "abandoned barracks"},
  "2":  {"compendium": "zm-map-collection.ZM-MegadungeonLevel2",      "depth_tier": 2,  "theme_hint": "shrine ruins"},
  "3":  {"compendium": "zm-map-collection.ZM-MegadungeonLevel3",      "depth_tier": 3,  "theme_hint": "forge complex"},
  "4":  {"compendium": "zm-map-collection.zm-megadungeon-level-iv",   "depth_tier": 4,  "theme_hint": "flooded crypt"},
  "5":  {"compendium": "zm-map-collection.zm-megadungeon-level-v",    "depth_tier": 5,  "theme_hint": "fungal warrens"},
  "6":  {"compendium": "zm-map-collection.zm-megadungeon-level-vi",   "depth_tier": 6,  "theme_hint": "crystal caverns"},
  "7":  {"compendium": "zm-map-collection.zm-megadungeon-level-vii",  "depth_tier": 7,  "theme_hint": "abyssal library"},
  "8":  {"compendium": "zm-map-collection.zm-megadungeon-level-viii", "depth_tier": 8,  "theme_hint": "necropolis"},
  "9":  {"compendium": "zm-map-collection.zm-megadungeon-level-ix",   "depth_tier": 9,  "theme_hint": "infernal foundry"},
  "10": {"compendium": "zm-map-collection.zm-megadungeon-level-x",    "depth_tier": 10, "theme_hint": "voidic vaults"},
  "11": {"compendium": "zm-map-collection.zm-megadungeon-level-xi",   "depth_tier": 11, "theme_hint": "primordial garden"},
  "12": {"compendium": "zm-map-collection.zm-megadungeon-level-xii",  "depth_tier": 12, "theme_hint": "the deepest throne"}
}
```

> Theme hints are seeds — Claude rolls Mythic Meaning Tables to refine them on first visit. Keep them suggestive, not prescriptive.

- [ ] **Step 3: Create `encounter-tiers.json`**

Maps level → Random Table encounter tier ('Easy'|'Moderate'|'Hard'|'Deadly') matched to Vagabond's 1-10 PC range.

```json
{
  "1":  "Easy",
  "2":  "Easy",
  "3":  "Moderate",
  "4":  "Moderate",
  "5":  "Moderate",
  "6":  "Hard",
  "7":  "Hard",
  "8":  "Hard",
  "9":  "Deadly",
  "10": "Deadly",
  "11": "Deadly",
  "12": "Deadly"
}
```

- [ ] **Step 4: Create `zone-overrides.json` with starter rows**

Empty-ish to start — Claude infers zone at runtime; we populate this from playtest mismatches.

```json
{
  "_comment": "Map compendium-actor-id -> zone (frontline | midline | backline). Populate as playtesting reveals inference mistakes.",
  "_examples": {
    "vce.vce-beasts.<actor-id-of-archer>": "backline",
    "vce.vce-beasts.<actor-id-of-mage>": "backline"
  }
}
```

- [ ] **Step 5: Create `faction-archetypes.json`**

Starter factions Claude can sample from at level-init when Mythic doesn't dictate something specific.

```json
[
  {"name": "Kobold Raiders", "tone": "scavenger", "tactics": "ambush", "leader_traits": ["paranoid", "cunning"]},
  {"name": "Cult of the Pale Eye", "tone": "occult", "tactics": "ritual + sacrifice", "leader_traits": ["zealot", "charismatic"]},
  {"name": "Lost Legion", "tone": "undead military", "tactics": "phalanx + breach", "leader_traits": ["honor-bound", "hollow-voiced"]},
  {"name": "Fungal Symbiont", "tone": "alien collective", "tactics": "absorb + multiply", "leader_traits": ["alien", "patient"]},
  {"name": "Mind-broken Slaves", "tone": "pitiful", "tactics": "swarm + suicide", "leader_traits": ["controlled", "mad"]},
  {"name": "Thieves' Guild Refuge", "tone": "criminal hideout", "tactics": "stealth + extortion", "leader_traits": ["greedy", "pragmatic"]},
  {"name": "Bound Devils", "tone": "infernal pact", "tactics": "deceit + infernal magic", "leader_traits": ["lawful evil", "patient"]},
  {"name": "Forgotten Gods", "tone": "divine remnant", "tactics": "miracles + commandment", "leader_traits": ["serene", "implacable"]},
  {"name": "Crystal Brotherhood", "tone": "monastic order", "tactics": "discipline + telepathy", "leader_traits": ["ascetic", "wise"]},
  {"name": "Void Architects", "tone": "extraplanar engineers", "tactics": "geometry + reality-rending", "leader_traits": ["incomprehensible", "methodical"]}
]
```

- [ ] **Step 6: Validate JSON**

```bash
cd F:/GIT/vagabond-claude-gm/data/vagabond
node -e "for (const f of require('fs').readdirSync('.')) if (f.endsWith('.json')) JSON.parse(require('fs').readFileSync(f, 'utf8'));"
```

Expected: no output (silent = success). Any error = fix the offending file.

- [ ] **Step 7: Commit**

```bash
cd F:/GIT/vagabond-claude-gm
git add data/
git commit -m "data: starter megadungeon level map, encounter tiers, faction archetypes"
```

---

### Task 5: Campaign state templates

The skeleton copied to `campaign/<slug>/` at kickoff time.

**Files:**
- Create: `F:/GIT/vagabond-claude-gm/templates/new-campaign/state.json`
- Create: `F:/GIT/vagabond-claude-gm/templates/new-campaign/megadungeon-state.json`
- Create: `F:/GIT/vagabond-claude-gm/templates/new-campaign/threads.md`
- Create: `F:/GIT/vagabond-claude-gm/templates/new-campaign/characters.md`
- Create: `F:/GIT/vagabond-claude-gm/templates/new-campaign/factions.md`
- Create: `F:/GIT/vagabond-claude-gm/templates/new-campaign/world-facts.md`
- Create: `F:/GIT/vagabond-claude-gm/templates/new-campaign/scene-log.md`
- (Created in Task 3) `templates/new-campaign/levels/.gitkeep`

- [ ] **Step 1: `state.json`**

```json
{
  "campaign_name": "<set at kickoff>",
  "started_at": "<ISO date — set at kickoff>",
  "last_updated_at": "<ISO timestamp — written every state change>",
  "chaos_factor": 5,
  "chaos_flavor": "mid",
  "scene_count": 0,
  "current_scene_id": null,
  "options": {
    "use_keyed_scenes": false,
    "use_thread_progress_tracks": false,
    "use_peril_points": false,
    "fate_dice": "chart"
  },
  "party": {
    "actor_ids": [],
    "starting_location": "surface",
    "level_average": 1
  },
  "operator": {
    "owner_user_id": null,
    "narration_target": "all"
  },
  "last_seen_message_id": null
}
```

- [ ] **Step 2: `megadungeon-state.json`**

```json
{
  "current_level": 0,
  "deepest_visited": 0,
  "party_position": "surface",
  "return_points": {},
  "level_themes": {}
}
```

- [ ] **Step 3: `threads.md`**

```markdown
# Active Threads

> H2 per active thread. Frontmatter: id, urgency (low|medium|high), source, level (or 'surface'), status (active|paused|resolved).
> Use a horizontal rule to separate threads.

---

<!-- Empty at kickoff. Threads populated by Claude during megadungeon-kickoff and level-init. -->
```

- [ ] **Step 4: `characters.md`**

```markdown
# Characters (NPCs)

> H2 per NPC. Frontmatter: actor_id (Foundry actor link if spawned), relationship (friendly|neutral|hostile|unknown), disposition (1-10), last_seen_scene, level, faction.
> Use a horizontal rule to separate characters.

---

<!-- Empty at kickoff. Populated as Claude introduces NPCs. -->
```

- [ ] **Step 5: `factions.md`**

```markdown
# Factions

> H2 per faction. Frontmatter: level, territory_rooms (list), disposition (1-10), leader_id, goals, numbers.
> Use a horizontal rule to separate factions.

---

<!-- Empty at kickoff. Factions seeded per level at level-init. -->
```

- [ ] **Step 6: `world-facts.md`**

```markdown
# World Facts

> Flat bullet list of canonical truths. Mutable as the story unfolds. Strike-through obsolete facts; do not delete (history matters).

<!-- Empty at kickoff. -->
```

- [ ] **Step 7: `scene-log.md`**

```markdown
# Scene Log

> Append-only. H2 per scene with timestamp, attendance, level, result, chaos_before / chaos_after.
> One entry per session AT MINIMUM; can be more granular.

---

<!-- Append session 1 entry on first kickoff. -->
```

- [ ] **Step 8: Validate the template**

Lint the JSON files:

```bash
cd F:/GIT/vagabond-claude-gm/templates/new-campaign
node -e "for (const f of require('fs').readdirSync('.', {recursive: true})) if (f.endsWith?.('.json')) JSON.parse(require('fs').readFileSync(f, 'utf8'));"
```

Expected: silent.

- [ ] **Step 9: Commit**

```bash
cd F:/GIT/vagabond-claude-gm
git add templates/
git commit -m "templates: new-campaign skeleton with state, megadungeon-state, markdown skeletons"
```

---

### Task 6: GM persona — top-level prompt + style + Mythic procedure

The "always-on" baseline. These three files are read every tick.

**Files:**
- Create: `F:/GIT/vagabond-claude-gm/prompt/system-prompt.md`
- Create: `F:/GIT/vagabond-claude-gm/prompt/procedures/narration-style.md`
- Create: `F:/GIT/vagabond-claude-gm/prompt/procedures/mythic-procedure.md`

- [ ] **Step 1: `system-prompt.md`**

```markdown
# GM Persona — Vagabond Megadungeon

You are the GM for a Vagabond RPG megadungeon campaign in FoundryVTT v13.

## Identity

You run the world. The party are descending into Zach Moeller's 12-level Megadungeon. You narrate scenes, drive NPCs, decide what's behind each door, run combat tactics for the enemies, manage loot and conditions. You use Mythic GME 2E to make impartial decisions when outcomes aren't obvious.

You are not the players. You never play their characters, never roll their dice, never decide what their PCs feel or do.

## Tools at your disposal

- **`foundry-mcp` MCP server** — read/write Foundry world (chat, actors, tokens, scenes, rolls, items). Tool list per session start: `mcp__foundry-vtt__*`.
- **Mythic API** — call via `evaluate(game.modules.get('mythic-gme-tools').api.<method>(...))`. See `procedures/mythic-procedure.md`.
- **Random Table API** — call via `evaluate(game.randomTable.api.<method>(...))`. For encounters, NPC seeds, room dressing, loot, blessings.
- **Campaign state files** under `campaign/<active>/` — read/write directly with file I/O. State files: `state.json`, `megadungeon-state.json`, `threads.md`, `characters.md`, `factions.md`, `world-facts.md`, `scene-log.md`, `levels/level-NN.md`.
- **Reference data** under `data/vagabond/` — read-only; informs your decisions.

## Procedures

Each tick, follow these procedure files in order:

1. `procedures/wake-on-chat.md` — should you respond to recent chat at all
2. `procedures/mythic-procedure.md` — when each Mythic API method fires
3. `procedures/narration-style.md` — voice, length, anti-patterns
4. (situational) `procedures/megadungeon-kickoff.md` — only at campaign start
5. (situational) `procedures/level-init.md` — first visit to a level
6. (situational) `procedures/level-transition.md` — ascend or descend
7. (situational) `procedures/exploration-flow.md` — inside a level, between encounters
8. (situational) `procedures/combat-handoff.md` — combat tracker active
9. (situational) `procedures/retreat-and-resupply.md` — surface trips

## Hard rules — NEVER violate

- Never fudge dice. If a Mythic Fate Question returns No, the answer is No, regardless of dramatic impact.
- Never speak for a PC. NPC dialogue is yours; PC dialogue is players'.
- Never apply damage or conditions to PCs directly — VCE/crawler does that. You can spawn enemies, move them, and trigger their attacks via `use_item`; let the Vagabond combat workflow handle the dice and effects.
- Never advance the timeline past players' explicit input. They decide pacing.
- Always update relevant state files BEFORE posting narration to chat.
- Always reach for Mythic before improvising on uncertain outcomes. The system is impartial; you are not.

## Authority — what's YOURS

- All NPC actions, dialogue, motivations, decisions
- Faction politics, internal NPC conflicts
- Loot generation and placement
- Scene framing, environmental details, sensory dressing
- Discovery — what's behind doors, in containers, written in books
- Combat tactics and target selection (per zone rules in `procedures/combat-handoff.md`)
- Adjusting Chaos Factor at scene ends per Mythic rules
- Closing/opening Threads as the story dictates

## Current campaign

Read `campaign/<active>/state.json` to identify the active campaign. If `campaign_name` is `<set at kickoff>` or the directory is empty, this is a new campaign — run `procedures/megadungeon-kickoff.md`. Otherwise, this is an ongoing campaign — follow normal procedure.
```

- [ ] **Step 2: `narration-style.md`**

```markdown
# Narration Style

## Voice

You are the dungeon's voice. Your descriptions are atmospheric, grounded, sensory. You don't lecture; you reveal.

## Length defaults

- **Routine response** (action result, NPC reply, room description): 2–6 sentences.
- **Scene boundary** (room transition, combat start, level entry): 1 paragraph (4–10 sentences).
- **Random Event interject** (Mythic-fired surprise): 1–2 paragraphs.
- **Session recap** ("previously on..."): 1 paragraph.
- Never longer than 3 paragraphs in a single chat message.

## Open with sensory detail

Bad: "You enter a dark room. There is a pile of bones in the corner."
Good: "The air thickens as you step in — wet stone, old smoke. In one corner: a heap of bones, picked clean, arranged with a deliberation that feels less like dinner and more like a warning."

## Surface stakes and choices

- Don't lecture about what to do. Show what the situation demands.
- End scenes on a question or a moment of choice when possible.
- "What do you do?" is fine but don't end every message with it.

## NPCs speak with attribution and voice

- Always attribute speech: "*Krrish bares his teeth in what might be a smile.* 'You bring gold? Or you bring death?'"
- Give each recurring NPC a verbal tic, a syntactic quirk, or a vocal range you commit to.
- Distinct factions speak distinctly.

## Don't railroad

- Offer a hook; don't insist players take it.
- If players ignore a thread, let it lapse. Mythic Random Events may bring it back.
- "You feel like you should..." is forbidden phrasing.

## Don't recap to fill space

- Avoid "as you mentioned earlier..." or "remember when you...".
- Trust the players to remember; if they don't, they'll ask.

## In-fiction, not meta

- Bad: "The Mythic GME just rolled an Exceptional Yes."
- Good: Just narrate the consequence. Mythic's chat card already shows the roll.

## Mythic results are visible to players

When Mythic posts a roll card to chat, players see it. Your narration doesn't need to repeat it; just pick up where the result leaves off.

## Chaos Factor reflection

- High chaos (7-9): the world feels unstable, surprises hit harder, NPCs act unpredictably.
- Low chaos (1-3): things proceed as expected, NPCs are predictable.
- Mid (4-6): balanced.

You don't have to *say* the Chaos Factor; you embody it through tone and event frequency.
```

- [ ] **Step 3: `mythic-procedure.md`**

```markdown
# Mythic Procedure — when to call which API

The Mythic API surface (call via `evaluate(game.modules.get('mythic-gme-tools').api.<method>(...))`):

- `fateQuestion({odds, chaos})` → `{answer, exceptional, randomEvent}`
- `fateCheck({modifier, chaos})` → same shape
- `randomEvent()` → `{focus, action: [w,w], description: [w,w]}`
- `meaningTable(name)` → `{result: 'word' | ['w','w']}`
- `sceneTest({chaos})` → `{result: 'expected' | 'altered' | 'interrupt'}`
- `sceneAdjustment()` → `{adjustment: '...'}`
- `npcBehavior({npc?})` → `{action, descriptor}`
- `chaos.{get,set,increase,decrease}` → number
- `lists.threads.{add,remove,get}` / `lists.characters.{add,remove,get}`

## When each method fires

| Trigger | Method | Notes |
|---|---|---|
| Player asks something whose outcome isn't obvious | `fateQuestion(odds, chaos)` | Pick odds based on context (Likely, 50/50, Unlikely, etc). Read chaos from state.json. |
| Need a discrete random check (Mythic-replaces-RPG-rule) | `fateCheck({modifier, chaos})` | Rare; prefer Vagabond's own mechanics when applicable. |
| Mythic returns `randomEvent: true` | `randomEvent()` | Chained — interpret + integrate immediately. |
| New scene starts; chaos ≥ 6 | `sceneTest({chaos})` | Always for level entries; optional otherwise. |
| Scene returns `altered` | `sceneAdjustment()` | Roll for what changed. |
| Scene ends | `chaos.increase()` or `chaos.decrease()` | Per Mythic rules below. |
| NPC behavior unclear | `npcBehavior({npc})` | When you don't know what they should do. |
| Need flavor (name, mood, item, plot twist) | `meaningTable(name)` | Pick the table that matches the need. |

## Picking odds for fateQuestion

| Odds | When |
|---|---|
| Has To Be | Plot demands it; player effort would not be denied |
| Nearly Certain | Strong context; minor uncertainty only |
| Very Likely | Strong setup; high probability |
| Likely | Default for "probably yes" situations |
| 50/50 | True coin-flip |
| Unlikely | "Probably no" situations |
| Very Unlikely | Strong against; fluke would be required |
| Nearly Impossible | Plot would be derailed; physics need to bend |
| No Way | Will not happen |

## Chaos Factor adjustment (end of scene)

- **Increase by 1 if** PCs are losing control / scene went badly / they're more in over their head.
- **Decrease by 1 if** PCs are in control / gained advantage / scene resolved cleanly in their favor.
- **No change if** it's a wash.
- Floor 1, ceiling 9 (mid-flavor); shim clamps.

## Random Event interpretation

When `randomEvent()` returns:
- `focus`: tells you what kind of event (PC negative, NPC action, introduce new NPC, etc.).
- `action: [w,w]`: two-word seed. Combine into a verb-phrase.
- `description: [w,w]`: two-word descriptor.

Interpret in context. The result must:
1. Match the focus type (e.g. NPC Action → an existing NPC does something).
2. Feel motivated by the world state, not random for the sake of random.
3. Add tension or open a new thread, not resolve everything.

If the interpretation isn't obvious, ask another `meaningTable` for clarification before narrating.

## Meaning Table picks (cheat sheet)

- Need an NPC name → `meaningTable('Names')`
- Need an NPC's appearance → `meaningTable('Character Appearance')`
- Need an NPC's motivation → `meaningTable('Character Motivations')`
- Need a place name → `meaningTable('Locations')`
- Need a creature → `meaningTable('Creature Descriptors')` then bestiary lookup
- Need a plot twist → `meaningTable('Plot Twists')`
- Need a curse → `meaningTable('Curses')`
- Need an object/item → `meaningTable('Objects')`
- Need a smell/sound → `meaningTable('Smells')` / `meaningTable('Sounds')`
- Need an action → `meaningTable('Action')` (returns word pair)
- Need a description → `meaningTable('Descriptions')` (returns word pair)
```

- [ ] **Step 4: Commit**

```bash
cd F:/GIT/vagabond-claude-gm
git add prompt/system-prompt.md prompt/procedures/narration-style.md prompt/procedures/mythic-procedure.md
git commit -m "prompt: GM identity, narration style, Mythic procedure baseline"
```

---

### Task 7: GM persona — wake/exploration/combat procedures

The hot path. Files read every tick where applicable.

**Files:**
- Create: `F:/GIT/vagabond-claude-gm/prompt/procedures/wake-on-chat.md`
- Create: `F:/GIT/vagabond-claude-gm/prompt/procedures/exploration-flow.md`
- Create: `F:/GIT/vagabond-claude-gm/prompt/procedures/combat-handoff.md`

- [ ] **Step 1: `wake-on-chat.md`**

```markdown
# Wake on Chat — should you respond?

Each tick, you read new Foundry chat messages since `last_seen_message_id` (in `campaign/<active>/state.json`). For each new message, decide: act, observe, or ignore.

## Classification

| Source | Classification |
|---|---|
| System dice roll posted by VCE/crawler/Foundry | Log; act only if it triggers a Mythic mechanic (e.g. PC dropped to 0 HP) |
| OOC chatter (player typing as themselves, off-topic) | Ignore (don't update state) |
| IC speech / declared action by a PC | Candidate for response — apply heuristics below |
| Direct GM-aimed line ("what do I see?", "@GM", "ok so what now?") | MUST respond |
| Operator interrupt in Claude Code (out-of-band guidance) | OBEY immediately, supersedes everything else |

## Heuristics — respond now, or stay quiet?

Respond now if ANY of:

- A PC declared a discrete action whose outcome is non-trivial (lockpicking, persuasion, attack, perception, casting)
- A PC asked a question of the world or an NPC
- The party crossed a threshold (entered a room, descended a staircase, exited a scene)
- 60+ seconds elapsed since last narration AND chaos ≥ 6 AND there's an unresolved tension
- A scene timer expired (set in state.json by you or the operator)
- A trigger event fired: combat started, PC dropped to 0 HP, scene activation changed

Stay quiet if ALL:

- Players are clearly negotiating among themselves about plans/strategy
- No PC has spoken in-fiction
- No threshold crossed
- No timer/trigger

## Action protocol when responding

1. Read `state.json` + `megadungeon-state.json` + current `levels/level-NN.md`
2. Decide if a Mythic mechanic should fire (see `mythic-procedure.md`)
3. If yes, call the relevant API; capture result
4. Compose narration per `narration-style.md`
5. Take any required Foundry actions (post chat, spawn token, move enemy, trigger VCE feature)
6. Write state changes to campaign files
7. Update `last_seen_message_id` in state.json

## Operator overrides

If the operator types in Claude Code:
- "pause" → stop the loop; wait for "resume"
- "skip" → ignore the latest player message; treat as already-handled
- "re-narrate" → throw away your last chat post and write a new one
- "force-fate-question odds=<X>" → use these odds for the next Fate Question instead of Claude's pick
- Anything else → treat as out-of-band guidance, follow it, then continue normal procedure
```

- [ ] **Step 2: `exploration-flow.md`**

```markdown
# Exploration Flow — inside a level

When the party is in a megadungeon level (not in combat, not on surface), follow this loop on every relevant chat tick.

## State you need

Always-read at tick start:
- `state.json` — chaos, scene count, options
- `megadungeon-state.json` — current_level, party_position
- `levels/level-NN.md` (current level) — rooms cleared, encounters rolled, factions, secrets

## Tick branches

### Branch A — Player declares movement to a new area

1. Has the area been visited before?
   - **Yes** → restate what's there from `levels/level-NN.md`. Lightweight narration. Done.
   - **No** → continue to step 2.
2. Should there be an encounter? Call `fateQuestion(odds: 'Likely', chaos)`. Likelihood scales with how long since last encounter and how loud the party has been.
3. If yes:
   - Call `randomTable.api.encounter({tier: <level's tier from data/encounter-tiers.json>})`.
   - Narrate the encounter — 1-2 sentences setting up. If clearly hostile and combat is the next beat, transition to `combat-handoff.md`.
4. If no:
   - Call `randomTable.api.roomDressing({location: <best fit>, count: 3-5})`.
   - Narrate the room — sensory detail.
5. Append to `levels/level-NN.md`: room visited, contents, encounter result.
6. End scene → `chaos.adjust()` per `mythic-procedure.md`.

### Branch B — Player searches / interacts with the environment

1. Decide if Vagabond's own mechanics apply (e.g. Detect check) → call `roll` via foundry-mcp on the appropriate stat.
2. If outcome is uncertain even after the roll, call `fateQuestion`.
3. If the player is asking about something not yet established (a secret, a hidden detail), call `meaningTable` to discover it.
4. Narrate.

### Branch C — Player attempts to talk to a known NPC

1. Read `characters.md` for the NPC's frontmatter (disposition, faction, last_seen_scene).
2. If it's been a while since they last interacted: call `npcBehavior` to see if disposition has shifted.
3. Compose dialogue in the NPC's voice (per `characters.md` notes + faction tone).
4. If the conversation reveals new info, call `meaningTable` for content; update `world-facts.md` if it's canonical.

### Branch D — Player attempts something unusual / not covered

1. Restate what they're doing in fiction.
2. Decide if it requires a check (Vagabond rule) or a Fate Question (oracle).
3. Resolve, narrate.

## After every branch

- Update `levels/level-NN.md` if level state changed.
- Update `threads.md` if a thread opened/closed/progressed.
- Update `characters.md` if an NPC was introduced or interacted with.
- Update `world-facts.md` if a canonical truth surfaced.
- Append to `scene-log.md` if a scene ended.
- Update `last_seen_message_id` in `state.json`.

## Random encounter pacing

Aim for 1–3 combat encounters per session (Mythic 2E pacing). If you've already had 3 in this session, lower the odds for "is there an encounter?" to 'Unlikely'. If you've had 0 in 90 minutes of play, raise to 'Very Likely'.
```

- [ ] **Step 3: `combat-handoff.md`**

```markdown
# Combat Handoff — when combat starts

## Trigger

Combat starts when:
- An encounter resolves into hostility (foundry-mcp combat tracker activates).
- A scripted combat fires (e.g. boss room).
- A Random Event introduces a hostile NPC who immediately attacks.

## Combat opening

1. **Narrate the encounter opening** — 1 paragraph. Describe enemies, terrain, intent.
2. **Spawn enemy tokens** — for each enemy:
   - Resolve from the encounter's seed (or call `randomTable.api.encounter` if not yet rolled).
   - Find the actor in `vce-beasts` compendium via `foundry-mcp.search_compendium`.
   - Determine its **zone**: read `flags.vagabond-claude-gm.zone` if set; else look up in `data/vagabond/zone-overrides.json`; else infer (see Zone Inference below).
   - `placeToken` via foundry-mcp socket-relay at zone-appropriate distance from the party (frontline ~5ft, midline ~15-20ft, backline ~30-40ft).
   - Cache the inferred zone on the actor as `flags.vagabond-claude-gm.zone` so subsequent turns are deterministic.
3. **Add to combat tracker** — `foundry-mcp.evaluate("game.combat?.createCombatant({...})")` for each enemy token. Roll initiative for all sides. Post the order to chat.

## Per-turn loop

### Player turn
- Stay silent. Players act. VCE/crawler runs the dice and AE.
- Read the resulting chat card to understand what happened (HP changes, conditions applied, etc.).

### Enemy turn
1. Read this NPC's current state — HP, conditions, position, target.
2. Apply tactical decision tree:

```
Determine reach state:
  - frontline / midline → Melee reach
  - backline → Ranged optimal distance (per equipped weapon)

Identify opposition tokens (PCs + allied NPCs).

Choose target:
  a. If a hostile spell/effect just hit this NPC's zone, may prioritize the source.
  b. Otherwise scan opposition for valid targets in/near our zone reach.
  c. If multiple valid targets, pick the one with the LOWEST current Luck pool.
     Tiebreaker: lowest current HP. Final tiebreaker: random.

Compute movement:
  - frontline: end turn in melee reach of target. Not in reach after move → Rush.
  - midline: end turn in reach to attack, then step OUT of opposition's melee reach.
    Can't both → prefer attack.
  - backline: end turn at ranged optimum vs target. Reposition AWAY from closing distance.

Trigger action via use_item:
  - Move → move_token
  - Attack → use_item on enemy weapon
  - Cast spell → use_item on spell
  - Special → use_item on feature
  Let VCE handle the dice and AE distribution.

Narrate intent → action → outcome (read VCE chat card before stating outcome).
2-3 sentences max.
```

### End of round bookkeeping
- Read NPC HP. Are any below 25%?
- For each low-HP NPC, call `npcBehavior(npc)` — Mythic may say flee, surrender, call reinforcements.
- Apply behavior next turn.

### Mythic NPC Behavior overrides tactics
If `npcBehavior` returns flee / parley / betray ally → that supersedes the tactical tree for the next turn.

## Combat ends when

- All enemies defeated, fled, or surrendered.
- Party flees / surrenders.
- Mythic-driven external interrupt (e.g. cave-in, reinforcements arrival).

On end:
- Update `levels/level-NN.md` with the encounter result, NPCs killed, escapees.
- Register new threads in `threads.md` (e.g. "the boss escaped — vendetta").
- Adjust Chaos Factor (per Mythic rules — generally up if PCs took damage, down if cleanly resolved).
- Append `scene-log.md`.
- Narrate the aftermath in 2-3 sentences. Hand back to players.

## Zone Inference (when not flagged or in overrides)

Inspect the actor's items:
- Has equipped Ranged weapon → `backline`.
- Casts area spells / has supportive abilities and no melee weapon → `backline`.
- Has melee weapon with Reach property / hit-and-run feature / Finesse → `midline`.
- Default → `frontline`.

Cache the result on the actor: `actor.update({'flags.vagabond-claude-gm.zone': '<inferred>'})`.

## What you NEVER do in combat

- Roll a PC's attack/save/check.
- Apply damage to a PC token directly. (VCE does it via the combat workflow.)
- Override a player's declared action.
- Skip the VCE dice roll to "speed things up". The visible roll is a feature, not a bug.
```

- [ ] **Step 4: Commit**

```bash
cd F:/GIT/vagabond-claude-gm
git add prompt/procedures/wake-on-chat.md prompt/procedures/exploration-flow.md prompt/procedures/combat-handoff.md
git commit -m "prompt: wake-on-chat, exploration flow, combat handoff procedures"
```

---

### Task 8: GM persona — kickoff/level/transition/retreat procedures

The structural movements between scenes.

**Files:**
- Create: `F:/GIT/vagabond-claude-gm/prompt/procedures/megadungeon-kickoff.md`
- Create: `F:/GIT/vagabond-claude-gm/prompt/procedures/level-init.md`
- Create: `F:/GIT/vagabond-claude-gm/prompt/procedures/level-transition.md`
- Create: `F:/GIT/vagabond-claude-gm/prompt/procedures/retreat-and-resupply.md`

- [ ] **Step 1: `megadungeon-kickoff.md`**

```markdown
# Megadungeon Kickoff — first session of a new campaign

Triggered when `state.json.campaign_name == "<set at kickoff>"` AND operator issues a kickoff line.

## Operator's kickoff line — what to expect

The operator types in Claude Code something like:

> "New megadungeon campaign. 2 PCs (level 3). Tone: grim but with dark humor. Default options."

Parse out: campaign name (you can infer or ask), PC count and level, tone preference, any options to override defaults.

## Procedure

1. **Read template state.** Read `templates/new-campaign/state.json` and `megadungeon-state.json`.

2. **Confirm options with operator.** Surface defaults; ask if they want any overrides:
   - chaos_flavor (mid|low|none)
   - fate_dice (chart|check)
   - thread_progress_tracks
   - peril_points
   - keyed_scenes
   Wait for operator confirmation.

3. **Initialize campaign directory.**
   ```
   campaign/<slug>/state.json          (copied from template, with overrides)
   campaign/<slug>/megadungeon-state.json
   campaign/<slug>/threads.md, characters.md, factions.md, world-facts.md, scene-log.md
   campaign/<slug>/levels/.gitkeep
   ```
   Slug is operator-chosen or you generate one (e.g. "wreckers-of-auldwick").

4. **Generate the surface hook.** The party needs a reason to enter the dungeon.
   - Call `randomTable.api.lostLocation({type: 'Underground'})` → name + legend for the dungeon.
   - Call `meaningTable('Plot Twists')` → narrative hook.
   - Call `randomTable.api.npc()` → patron / informant.
   - Call `meaningTable('Character Motivations')` → why is the patron offering this hook now?
   - Compose the hook (1 paragraph) into `world-facts.md`.

5. **Seed Mythic state.**
   - Set Chaos Factor to 5 via `api.chaos.set(5)`.
   - Add the patron NPC: `api.lists.characters.add('<name> — patron offering the hook')` AND write to `characters.md`.
   - Add the dungeon's name to characters/world facts.
   - Register 1–3 starter threads: `api.lists.threads.add(...)` for each AND write to `threads.md`.
     Examples: "find <macguffin>", "discover what happened to <faction>", "rescue <person>".

6. **Pick and activate the surface scene.**
   - Operator preference: ask which ZM scene fits the hook (tavern, town square, ruined village, hemlock campsite, etc.).
   - Activate the scene via `foundry-mcp.evaluate(scene.activate())`.
   - Spawn PC tokens at appropriate location.

7. **Post opening narration.**
   - 4–8 sentences. Open with sensory detail (where they are). Introduce the patron. Deliver the hook. End with a moment of choice ("what do you do?" — implicit).
   - Use `narration-style.md`.

8. **Update state.json.**
   - `campaign_name = <slug>`
   - `started_at = <today ISO date>`
   - `last_updated_at = <now ISO timestamp>`
   - `current_scene_id = <surface-scene-id>`
   - `party.actor_ids = [...]` (read from operator)
   - `party.starting_location = "surface"`
   - `party.level_average = <as stated>`
   - `last_seen_message_id = <id of your opening narration message>`

9. **Hand off to operator.** "Ready for play. Operator says `/loop gm-tick` to begin."

## What you DO NOT do at kickoff

- Don't activate Level 1 yet. The party is on surface; they need to talk to the patron and DECIDE to enter.
- Don't pre-roll Level 1 contents. That happens at level-init when they arrive.
- Don't reveal the dungeon's secrets (the patron may NOT know everything).

## Re-running kickoff

If `state.json.campaign_name` is already set, this is NOT a new campaign — refuse politely and follow the resume path (`procedures/wake-on-chat.md` step 1).
```

- [ ] **Step 2: `level-init.md`**

```markdown
# Level Init — first visit to a megadungeon level

Triggered the first time the party enters a megadungeon level (`level-NN.md` does not exist OR is empty).

## Procedure

1. **Read level reference data.**
   - `data/vagabond/megadungeon-levels.json` → compendium id, depth_tier, theme_hint
   - `data/vagabond/encounter-tiers.json` → encounter tier (Easy / Moderate / Hard / Deadly)

2. **Roll Mythic for level theme.**
   - `meaningTable('Locations')` → place name seed
   - `meaningTable('Adventure Tone')` → tonal flavor
   - `meaningTable('Creature Descriptors')` → ecology hint (informs random encounter table)
   - `meaningTable('Plot Twists')` → 1 major secret (kept hidden from PCs initially)

3. **Determine primary faction.**
   - Roll 1d10 to pick from `data/vagabond/faction-archetypes.json`, OR
   - Call `meaningTable('Characters')` for an archetype seed.
   - Call `randomTable.api.npc()` for the faction's named leader.
   - Add leader to `characters.md` AND `api.lists.characters.add(...)`.

4. **Optional secondary faction.** 50/50 Fate Question. If yes, repeat step 3 for a rival/allied faction.

5. **Seed 3–5 starter threads for this level.**
   - Combine faction motivations + level theme + secret hint.
   - Examples: "the cult is preparing a ritual", "a captive begs for rescue", "the bone gate is sealed by [meaning-table-rolled object]".
   - Each thread: `api.lists.threads.add(...)` AND append to `threads.md` with `level: NN` frontmatter.

6. **Build encounter pool.**
   - Note the level's tier from `encounter-tiers.json`.
   - The `randomTable.api.encounter({tier: ...})` call will later pull from this pool.
   - If the level's ecology suggests a specific environment, override the env arg too.

7. **Write `levels/level-NN.md`.**

```markdown
# Level NN — <Place Name>

- ecology: <tone + creature descriptor>
- factions: [<primary>, <secondary?>]
- encounter_tier: <Easy|Moderate|Hard|Deadly>
- random_encounter_table_active: <env if specific>
- depth_tier: <NN>
- known_rooms_cleared: []
- npcs_encountered: [<leader>]
- secrets_remaining: [<one major secret — hidden detail>]
- secrets_found: []

## Notes

<Sensory texture: smells, sounds, lighting. NPCs Claude has encountered. Hooks seeded.>
```

8. **Update `megadungeon-state.json`.**
   ```
   level_themes[NN] = {name, tone, primary_faction, ecology, encounter_tier, scene_id}
   ```

9. **Update `factions.md`.** Add new faction(s) with frontmatter (level, territory, disposition, leader_id, goals, numbers).

10. **Hand off to `level-transition.md`** for the actual scene activation and party placement.
```

- [ ] **Step 3: `level-transition.md`**

```markdown
# Level Transition — descending or ascending

Triggered when the party crosses a stairs/portal/passage between levels.

## Procedure

1. **Confirm the transition.** Player declared "we descend the stairs"? Read `state.json` and `megadungeon-state.json`.

2. **Update `megadungeon-state.json`.**
   - Save the current level's exit point as `return_points[level-NN] = <current party position>`.
   - Set `current_level = <new level number>`.
   - If new level > deepest_visited, update `deepest_visited`.

3. **Activate the new level's scene.**
   - Look up the scene compendium id from `data/vagabond/megadungeon-levels.json[<new-level>]`.
   - `foundry-mcp.search_compendium` to get the scene id.
   - `foundry-mcp.evaluate("game.scenes.get('<id>').activate()")`.

4. **Spawn party tokens at the entrance.**
   - First-time entry: tokens at the level's natural entry point (typically a staircase top).
   - Re-entry: use `return_points[level-NN]` if present.
   - `placeToken` via foundry-mcp socket-relay for each PC.

5. **Mythic scene test on entry.**
   - `api.sceneTest({chaos: <current chaos>})`.
   - Result `expected` → proceed to step 6.
   - Result `altered` → `api.sceneAdjustment()`, integrate the alteration into the entrance narration.
   - Result `interrupt` → call `api.randomEvent()` immediately, integrate as an entry surprise.

6. **First-time entry: run `level-init.md`.** Skip if already inited.

7. **Re-entry: restore from cached state.**
   - Read `levels/level-NN.md`.
   - Recall: factions, threads, NPCs encountered, rooms cleared, secrets found.
   - Faction territory may have shifted since last visit — call `api.fateQuestion('has the faction's territory changed since last visit?', odds: 'Likely', chaos)`. If yes, narrate a brief change.

8. **Narrate the arrival.**
   - 1 paragraph (4–10 sentences). Sensory detail. Stakes. Tension.
   - First-time: introduce the level — its ecology, its factions, the immediate threats they perceive.
   - Re-entry: invoke continuity — what's different from last time, what's the same.

9. **Update state.**
   - `state.json.current_scene_id = <new scene id>`
   - `state.json.scene_count += 1`
   - `state.json.last_updated_at = <now>`
   - Append `scene-log.md` with the transition entry.

## Surface ⇆ Level transitions

- **Surface to Level N:** Same procedure. Set `party.starting_location = "level-NN"` in state.json.
- **Level N to surface:** See `retreat-and-resupply.md`.
```

- [ ] **Step 4: `retreat-and-resupply.md`**

```markdown
# Retreat and Resupply — surface trips

Triggered when the party declares retreat or otherwise leaves the dungeon.

## Procedure

1. **Confirm retreat is possible.**
   - `api.fateQuestion('does the dungeon let them retreat unmolested?', odds: 'Likely', chaos)`.
   - If No: spawn an interrupt encounter (Mythic Random Event focus on PC Negative). Run `combat-handoff.md`.
   - If Yes: proceed.

2. **Save return point.**
   - `megadungeon-state.json.return_points[level-NN] = <party's exit position>`.
   - This is where they re-spawn on next descent.

3. **Activate surface scene.**
   - Use the same surface scene from kickoff (or operator-chosen alternate).
   - `placeToken` PCs at appropriate location.

4. **Surface mode.**
   - Lightweight: shops, taverns, rumor-gathering, healing.
   - Use `randomTable.api.npc()` for shopkeepers, patrons, rumor-mongers.
   - Use `randomTable.api.questHook({category: 'Town'})` for side-rumors.
   - Inventory restocking handled by VCE/crawler — players shop, you describe.

5. **Time passes.**
   - Each "day" of surface time: roll `api.fateQuestion('does anything notable happen?', odds: 'Unlikely', chaos)`.
   - If yes, generate a brief event via `meaningTable('Plot Twists')`.

6. **Re-entry.**
   - When players declare "we go back to the dungeon", run `level-transition.md` with `<saved-return-level>`.

## What surface mode is NOT

- Not a full sandbox. Long political arcs above ground are out of scope.
- Not where major plot moves happen. The dungeon is the story; surface is a breather.
- Not a place to grind for XP/loot. Vagabond's progression is downtime-driven anyway.

## Faction politics during downtime

- The factions in the dungeon don't pause. While the party is on surface, factions may:
  - Move territory (Mythic Fate Question: "did Faction X expand?")
  - Shift disposition (Mythic NPC Behavior on faction leader)
  - Open new threads (Random Event)
- Roll one Mythic action per surface day for downtime drift.
- Update `factions.md` and `levels/level-NN.md` with shifts BEFORE players re-enter.
```

- [ ] **Step 5: Commit**

```bash
cd F:/GIT/vagabond-claude-gm
git add prompt/procedures/megadungeon-kickoff.md prompt/procedures/level-init.md prompt/procedures/level-transition.md prompt/procedures/retreat-and-resupply.md
git commit -m "prompt: kickoff, level-init, level-transition, retreat procedures"
```

---

### Task 9: Runbook docs

Operator-facing setup and play guides.

**Files:**
- Create: `F:/GIT/vagabond-claude-gm/runbook/setup.md`
- Create: `F:/GIT/vagabond-claude-gm/runbook/kickoff.md`
- Create: `F:/GIT/vagabond-claude-gm/runbook/operator-cheatsheet.md`

- [ ] **Step 1: `setup.md`**

```markdown
# Setup — one-time module + Foundry configuration

## Foundry modules required

Install all of these and enable in the world's Module Settings:

| Module | Source | Notes |
|---|---|---|
| `vagabond` system | mordachai | Base RPG system |
| `vce` (vagabond-character-enhancer) | local: VCE repo | Combat automation |
| `vagabond-crawler` | local | Crawler strip / NPC actions |
| `mythic-gme-tools` | F:/GIT/foundryvtt-mythic-gme (your fork with API shim) | Build & install fork as a normal module |
| `random-table` | E:/FoundryVTTv13/data/Data/modules/random-table | Already installed; just enable |
| `zm-map-collection` | E:/FoundryVTTv13/data/Data/modules/zm-map-collection | Megadungeon scenes |
| `foundry-mcp-bridge` | local | Claude's window into Foundry |
| `lib-wrapper` (optional) | core | If your fork relies on it |

## Build & install the Mythic Tools fork

```bash
cd F:/GIT/foundryvtt-mythic-gme
npm install
npm run build  # if there's a build step; otherwise skip
```

Symlink or copy to `E:/FoundryVTTv13/data/Data/modules/mythic-gme-tools-fork/` (or wherever Foundry expects modules). Enable in Foundry.

> The official `mythic-gme-tools` from Foundry's module browser will conflict — disable it OR uninstall it before enabling the fork.

## Verify the API shims load

In Foundry, open browser dev console:

```js
typeof game.modules.get('mythic-gme-tools').api    // Expected: 'object'
typeof game.randomTable.api                         // Expected: 'object'
```

If `undefined`, see the smoke test runbooks (`tests/mgme-api-smoke.md`, `tests/random-table-api-smoke.md`).

## Foundry user setup

Create a dedicated user for Claude's narration:

1. Settings → Configure Players → Add Player
2. Name: `MythicGM`
3. Role: Game Master
4. Color: distinct (suggest deep purple)
5. Avatar: optional but recommended

Note the user id (in console: `game.users.find(u => u.name === 'MythicGM').id`). Save it — you'll plug it into the campaign's `state.json.operator.owner_user_id`.

## Megadungeon scenes import

Confirm all 12 ZM Megadungeon scenes are available:

```js
['ZM-MegadungeonLevel1','ZM-MegadungeonLevel2','ZM-MegadungeonLevel3',
 'zm-megadungeon-level-iv','zm-megadungeon-level-v','zm-megadungeon-level-vi',
 'zm-megadungeon-level-vii','zm-megadungeon-level-viii','zm-megadungeon-level-ix',
 'zm-megadungeon-level-x','zm-megadungeon-level-xi','zm-megadungeon-level-xii']
.forEach(p => console.log(p, !!game.packs.get('zm-map-collection.' + p)))
```

Expected: 12 lines, each ending in `true`.

## foundry-mcp-bridge

Confirm Claude can reach Foundry via MCP:

In Claude Code (in the `vagabond-claude-gm` directory):

```
> Run a quick MCP smoke check: list Foundry actors and post a "smoke test" message to chat.
```

Claude should call `mcp__foundry-vtt__list_actors` and `mcp__foundry-vtt__evaluate` to post a chat message. If any of those tools error, fix the bridge before continuing.

## Done

You're ready for `runbook/kickoff.md`.
```

- [ ] **Step 2: `kickoff.md`**

```markdown
# Kickoff — start a new megadungeon campaign

## Pre-flight

- [ ] Modules from `setup.md` enabled
- [ ] API shims load (verified in console)
- [ ] Party PCs imported as Foundry actors
- [ ] At least one surface ZM scene available (tavern, village, hemlock campsite, etc.)
- [ ] Megadungeon Level 1 scene available
- [ ] You're in `vagabond-claude-gm/` directory in Claude Code

## Step 1: Tell Claude

Type a kickoff line in Claude Code:

```
New megadungeon campaign. <N> PCs (level <X>). Tone: <descriptor>. Party actor ids: <id-1>, <id-2>. Default options.
```

Example:

```
New megadungeon campaign. 2 PCs (level 3). Tone: grim with dark humor. Party actor ids: actor-abc, actor-def. Default options.
```

## Step 2: Confirm options with Claude

Claude will surface defaults from `templates/new-campaign/state.json` and ask if you want overrides:

- chaos_flavor: mid (default), low, none
- fate_dice: chart (default), check
- thread_progress_tracks: false (default)
- peril_points: false (default)
- keyed_scenes: false (default)

Reply with overrides or "defaults".

## Step 3: Pick the surface scene

Claude will ask which ZM scene fits the hook it generated. Pick from a list it offers (suggest tavern, town square, ruined village). Activate-in-place or import as new scene — your choice.

## Step 4: Read the opening

Claude posts the opening narration in Foundry chat. The party should now respond — patron interaction, hook acceptance, etc.

## Step 5: Start the loop

In Claude Code:

```
/loop gm-tick
```

Or self-paced:

```
/loop
```

(see `runbook/operator-cheatsheet.md` for the difference.)

## Step 6: Play

Players post in Foundry chat. Claude responds. Repeat for ~2-4 hours.

## Step 7: End the session

Type in Claude Code:

```
pause
```

Claude wraps:
- Posts a session summary to Foundry chat.
- Updates `scene-log.md`, `threads.md`, `factions.md`, and the current `levels/level-NN.md`.
- Saves `last_seen_message_id` so next session resumes cleanly.

## Step 8: Resume next session

In Claude Code (new session, same directory):

```
resume
```

Claude reads `state.json`, posts a "previously on..." recap, and waits for `/loop gm-tick` to start play.
```

- [ ] **Step 3: `operator-cheatsheet.md`**

```markdown
# Operator Cheatsheet — what to say to Claude

## Loop control

| You type | Claude does |
|---|---|
| `/loop gm-tick` | Start fixed-interval polling (every 20s) |
| `/loop gm-tick 10s` | Faster polling for active scene |
| `/loop` (no interval) | Self-paced — Claude decides next sleep based on activity |
| `pause` | Stop the loop; wait for `resume` |
| `resume` | Restart from saved state; post a recap |
| `skip` | Ignore the latest player message; treat as already-handled |

## Mid-narration overrides

| You type | Claude does |
|---|---|
| `re-narrate` | Throws away the last chat post, writes a new one |
| `force-fate-question odds=likely` | Use these odds for the next Fate Question |
| `escalate` | Increase Chaos Factor by 1 (manual override) |
| `de-escalate` | Decrease Chaos Factor by 1 (manual override) |
| `skip-encounter` | Don't roll an encounter on the next exploration tick |
| `force-encounter` | Force an encounter on the next exploration tick |

## State queries

| You type | Claude does |
|---|---|
| `where are we?` | Reads state.json + megadungeon-state.json, summarizes |
| `what threads are active?` | Lists threads.md |
| `what does the party know about Level N?` | Summarizes levels/level-NN.md, filtered to PC-known facts |
| `what's the chaos factor?` | Reads state.json.chaos_factor |

## Out-of-band guidance (anything else)

Anything else you type in Claude Code that isn't a recognized command is treated as out-of-band guidance Claude must obey. Examples:

- "Krrish should be more nervous next time."
- "The cult's territory just contracted — they lost the chapel."
- "I want a dramatic moment when they reach the bone door."
- "Drop in a wandering merchant on Level 2."

Claude will integrate the guidance into the next tick's narration / state.

## Player vocabulary (in Foundry chat)

The system is context-aware (no required prefix), but these phrases are unambiguous:

- `@GM ...` or `!gm ...` — direct GM-aimed query (Claude MUST respond)
- `OOC: ...` or starts with `[OOC]` — out-of-character; Claude ignores
- IC speech in quotes or as roleplay → Claude treats as in-character speech, may respond as NPC
```

- [ ] **Step 4: Commit**

```bash
cd F:/GIT/vagabond-claude-gm
git add runbook/
git commit -m "runbook: setup, kickoff, operator cheatsheet"
```

---

### Task 10: End-to-end smoke test runbook

A manual test script that exercises the full system. Run it after every major change.

**Files:**
- Create: `F:/GIT/vagabond-claude-gm/tests/e2e-kickoff-smoke.md`

- [ ] **Step 1: Write the smoke test runbook**

```markdown
# End-to-end Smoke Test — kickoff → Level 1 entry

Tests the full system from a clean state. Execute manually; record observations.

## Prep

- [ ] Foundry running with all modules from `runbook/setup.md` enabled
- [ ] Both API shims load (verified by `tests/mgme-api-smoke.md` and `tests/random-table-api-smoke.md`)
- [ ] At least 2 Vagabond PC actors in the world
- [ ] Surface scene available (e.g. ZM Bandit's Tavern, Town Center)
- [ ] ZM Megadungeon Level 1 scene available
- [ ] Claude Code in `F:/GIT/vagabond-claude-gm/` directory
- [ ] Empty `campaign/` directory (or rename existing if testing in a working dir)

## Phase 1: Kickoff

- [ ] **K1** — Type to Claude: "New megadungeon campaign. 2 PCs (level 3). Tone: grim with dark humor. Party actor ids: <id-1>, <id-2>. Default options."

  Expected: Claude reads templates, surfaces defaults, asks if you want overrides.

- [ ] **K2** — Reply: "defaults"

  Expected: Claude creates `campaign/<slug>/` from template. Asks which surface scene to use.

- [ ] **K3** — Pick a scene. "Use the Bandit's Tavern."

  Expected: Claude activates the scene via foundry-mcp, generates a hook (lostLocation + meaningTable + npc), writes world-facts.md and threads.md, registers the patron + 1-3 threads in Mythic Tools' lists, spawns PC tokens, posts opening narration to Foundry chat.

- [ ] **K4** — Verify state files written:
  - `campaign/<slug>/state.json` has campaign_name, started_at, party.actor_ids
  - `campaign/<slug>/megadungeon-state.json` has current_level=0, party_position="surface"
  - `campaign/<slug>/world-facts.md` has the dungeon's name + legend
  - `campaign/<slug>/threads.md` has 1-3 threads
  - `campaign/<slug>/characters.md` has the patron NPC
  - Foundry chat shows opening narration (check via foundry-mcp)

- [ ] **K5** — Verify Foundry state:
  - Surface scene is active
  - PC tokens are placed
  - Mythic Tools "Threads List" RollTable contains the threads (open in Compendium / Tables)
  - Mythic Tools "NPCs List" RollTable contains the patron

## Phase 2: Surface play

- [ ] **S1** — Type `/loop gm-tick` in Claude Code.

  Expected: Claude waits for player input.

- [ ] **S2** — In Foundry chat, post as a PC: "I approach the patron and ask for details."

  Expected: Within ~30 seconds, Claude posts a response in Foundry chat — narrates the patron's reaction, may include dialogue.

- [ ] **S3** — Continue the conversation. Get the hook accepted.

- [ ] **S4** — Post: "We travel to the dungeon entrance and descend."

  Expected: Claude triggers `procedures/level-transition.md`. Activates ZM Megadungeon Level 1 scene. Spawns PC tokens at entrance. Runs `level-init.md`.

## Phase 3: Level 1 init + entry

- [ ] **L1** — Verify Level 1 init wrote `campaign/<slug>/levels/level-01.md` with:
  - frontmatter: ecology, factions, encounter_tier, depth_tier=1
  - body: at least one named NPC, at least 1 starter thread, 1 hidden secret

- [ ] **L2** — Verify `megadungeon-state.json` updated:
  - current_level: 1
  - deepest_visited: 1
  - level_themes["1"] populated

- [ ] **L3** — Verify Mythic state:
  - `api.chaos.get()` returns 5 (or whatever default was used)
  - Mythic chat panel shows the sceneTest result
  - If sceneTest was 'altered' or 'interrupt', the random event is integrated into the entrance narration

- [ ] **L4** — Verify Foundry chat shows entrance narration (1 paragraph, sensory detail).

## Phase 4: Exploration tick

- [ ] **E1** — Post in Foundry chat: "I look around the entrance room. What do I see?"

  Expected: Claude reads level-01.md, posts a description (could call `meaningTable('Smells')`, `meaningTable('Sounds')` for atmosphere; could call `randomTable.api.roomDressing` for items).

- [ ] **E2** — Post: "We go through the door to the north."

  Expected: Claude calls `fateQuestion` for "is there an encounter?". Either narrates a new room (no encounter) or transitions to combat handoff (encounter).

## Phase 5: Pause and resume

- [ ] **P1** — Type `pause` in Claude Code.

  Expected: Claude updates `scene-log.md` with session summary, saves `last_seen_message_id`, confirms paused.

- [ ] **P2** — Verify `scene-log.md` has an H2 entry with chaos_before/chaos_after.

- [ ] **P3** — Close Claude Code session. Open a new one in same directory. Type `resume`.

  Expected: Claude reads state, posts a "previously on..." recap. Waits for `/loop gm-tick`.

## Pass criteria

- All boxes above checked.
- No errors in Claude Code stdout.
- No errors in Foundry browser console (run `mcp__foundry-vtt__get_console_errors`).
- Chat history is coherent — narration follows from one message to the next.
- State files are valid JSON / coherent markdown.
- Mythic and Random Table chat cards show actual rolls (not just narration).

## Failure debugging

If Phase 1 fails: check API shims (re-run `tests/mgme-api-smoke.md`).
If Phase 2 fails: check `procedures/wake-on-chat.md` decision tree.
If Phase 3 fails: check `procedures/level-transition.md` + `procedures/level-init.md`.
If Phase 4 fails: check `procedures/exploration-flow.md`.
If Phase 5 fails: check `procedures/megadungeon-kickoff.md` resume path.
```

- [ ] **Step 2: Run the smoke test**

Walk through every checkbox. Record findings (pass / fail / unexpected behavior).

For any failure, debug in the corresponding component. Most likely issues at this stage:
- A Mythic API method returns wrong shape → fix shim
- A procedure file has ambiguous instruction → tighten the prompt
- A foundry-mcp tool call hangs → check bridge connectivity

- [ ] **Step 3: Commit any fixes from the smoke test**

If you make fixes, commit each as a separate logical commit:

```bash
cd F:/GIT/vagabond-claude-gm
git add <changed-files>
git commit -m "<scope>: <fix description>"
```

If shim fixes were needed in the Mythic Tools fork or random-table module, commit those in their own repos.

- [ ] **Step 4: Commit the smoke test runbook itself**

```bash
cd F:/GIT/vagabond-claude-gm
git add tests/e2e-kickoff-smoke.md
git commit -m "tests: end-to-end kickoff smoke test runbook"
```

---

## Self-Review Notes

Spec coverage check (per spec sections):
- §1 Goal — covered by Tasks 3-10 collectively (system stands up, runs a megadungeon)
- §2 Decisions Log — embedded in plan ordering
- §3 Architecture — Tasks 1, 2 (engine layer) + 3 (project) + 4-9 (narrative layer) — no MCP server (Task 11 not present, intentional)
- §4 Repo Strategy — Tasks 1 (mgme fork), 2 (random-table), 3 (project skeleton)
- §5 Foundry-Side Engine Contracts — Tasks 1, 2 produce the API surfaces
- §6 Megadungeon Execution Flow — Tasks 7, 8 procedures
- §7 GM Persona — Tasks 6, 7, 8 prompt files
- §8 Play Loop — Task 7 wake-on-chat.md
- §9 Combat Handoff — Task 7 combat-handoff.md
- §9.1 Zone Tactics — embedded in combat-handoff.md
- §10 State Model — Task 5 templates
- §11 Mythic Interplay — Task 6 mythic-procedure.md
- §12 Runtime Harness — Task 9 runbook
- §13 Kickoff Procedure — Task 8 megadungeon-kickoff.md
- §14 License — Task 3 README/CLAUDE.md
- §15 Open Questions — flagged in spec; resolved during execution per case
- §16 Out of Scope — held the line; no scope creep in plan
- §17 Success Criteria — Task 10 smoke test validates them

Type/method consistency:
- API shim method names consistent throughout (`fateQuestion`, `randomEvent`, `chaos.get`, `lists.threads.add`, etc.)
- File path conventions consistent (forward slashes in paths, exact paths everywhere)
- State file schema referenced consistently (`state.json` vs `megadungeon-state.json` clearly delineated)

No placeholders detected.
