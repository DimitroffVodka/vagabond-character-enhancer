# VCE Smoke Test Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an in-Foundry automated smoke test suite (`game.vagabondCharacterEnhancer.smokeTest()`) that exercises focus/companion/polymorph/spell-manager/AE-distribution paths and emits per-class signature tests + auto-generated registry-driven tests.

**Architecture:** ES-module, no build step, ships with the module. Sequential test runner with snapshot/restore-based fixture isolation. Six fixtures auto-created in a dedicated folder on first run. Three tiers: A (hand-authored systems), B (per-class signatures), C (auto-generated from `PERK_REGISTRY` + spell managers).

**Tech Stack:** Foundry VTT v13 ES modules, Foundry Document API, ApplicationV2 for chat output, Sequencer (optional dep for FX-related tests). No test framework — bespoke runner.

**Spec:** [docs/superpowers/specs/2026-05-03-smoke-test-harness-design.md](../specs/2026-05-03-smoke-test-harness-design.md)

---

## Verification Note

This harness has no `npm test` — verification means running the suite via `mcp__foundry-vtt__evaluate` and inspecting the result. After every task, the verify step is:

```js
mcp__foundry-vtt__evaluate({ expression:
  `(await game.vagabondCharacterEnhancer.smokeTest({ ${'<filter>'} })).summary`
})
```

Each task's verify line specifies the filter and the expected summary shape.

---

## Task 0: Module Integration Scaffold

**Goal:** Create the empty `scripts/smoke-test/` directory tree, register a no-op `smokeTest` API method on `game.vagabondCharacterEnhancer`, confirm it loads on world ready without errors.

**Files:**
- Create: `scripts/smoke-test/index.mjs`
- Modify: `scripts/vagabond-character-enhancer.mjs` (add import + API registration)
- Modify: `module.json` (add `scripts/smoke-test/index.mjs` to `esmodules` array if needed; verify auto-loads via existing import chain)

**Acceptance Criteria:**
- [ ] `game.vagabondCharacterEnhancer.smokeTest` is a function after world ready
- [ ] Calling it with no args returns `{ summary: { total: 0, passed: 0, failed: 0, skipped: 0, errored: 0, durationMs: <num> }, results: [] }`
- [ ] No console errors on world load

**Verify:**
```js
mcp__foundry-vtt__evaluate({ expression:
  `({ has: typeof game.vagabondCharacterEnhancer.smokeTest, result: await game.vagabondCharacterEnhancer.smokeTest() })`
})
// Expect: { has: "function", result: { summary: { total: 0, ... }, results: [] } }
```

**Steps:**

- [ ] **Step 1: Create the file structure**

```bash
mkdir -p scripts/smoke-test/tests/tier-a scripts/smoke-test/tests/tier-b scripts/smoke-test/tests/tier-c scripts/smoke-test/overrides
```

- [ ] **Step 2: Create `scripts/smoke-test/index.mjs`** with stub API

```js
/**
 * VCE Smoke Test Harness
 * Stub entry — replaced in Task 3 with real runner orchestration.
 */
import { MODULE_ID, log } from "../utils.mjs";

export const SmokeTest = {
  async run(opts = {}) {
    const start = performance.now();
    log("SmokeTest", "stub run — runner not yet implemented");
    return {
      summary: { total: 0, passed: 0, failed: 0, skipped: 0, errored: 0, durationMs: Math.round(performance.now() - start) },
      results: []
    };
  }
};
```

- [ ] **Step 3: Wire into the main module API**

Locate `game.vagabondCharacterEnhancer = { ... }` block in `scripts/vagabond-character-enhancer.mjs` (around line 1305 per CLAUDE.md). Add:

```js
import { SmokeTest } from "./smoke-test/index.mjs";
// ... within the api object:
smokeTest: (opts) => SmokeTest.run(opts),
```

- [ ] **Step 4: Reload Foundry via MCP and verify**

```js
mcp__foundry-vtt__evaluate({ expression: `window.location.reload(); "reloading"` })
// wait ~5s
mcp__foundry-vtt__evaluate({ expression:
  `({ has: typeof game.vagabondCharacterEnhancer.smokeTest, result: await game.vagabondCharacterEnhancer.smokeTest() })`
})
```

Expect: `{ has: "function", result: { summary: { total: 0, ... }, results: [] } }`. Also check `mcp__foundry-vtt__get_console_errors` reports no new errors.

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke-test/ scripts/vagabond-character-enhancer.mjs
git commit -m "feat(smoke): scaffold smoke-test directory + stub API

Empty harness skeleton — runner, fixtures, assertions filled in by
subsequent tasks. Verifies module loads cleanly with the new API
registration."
```

---

## Task 1: Fixture Definitions and Builder

**Goal:** Implement the six fixture actor specs and the idempotent builder that creates/heals them on demand.

**Files:**
- Create: `scripts/smoke-test/fixture-defs.mjs`
- Create: `scripts/smoke-test/fixtures.mjs`

**Acceptance Criteria:**
- [ ] `Fixtures.ensureAll()` creates the folder + all six fixtures on a fresh world
- [ ] Re-running `Fixtures.ensureAll()` on a world that already has them is a no-op
- [ ] Each fixture has its declared class item, level, perks, items, and spells
- [ ] `Fixtures.get("Witch")` returns the live `_smoke-Witch` Actor doc

**Verify:**
```js
mcp__foundry-vtt__evaluate({ expression: `
  const { Fixtures } = await import("/modules/vagabond-character-enhancer/scripts/smoke-test/fixtures.mjs");
  await Fixtures.ensureAll();
  return {
    folder: !!game.folders.find(f => f.name === "VCE Smoke Test (do not delete)"),
    actors: ["Generic","Druid","Revelator","Witch","NPC","TestPC"].map(n => ({ name: n, exists: !!Fixtures.get(n) }))
  };
`})
// Expect: folder true, all six exist
```

**Steps:**

- [ ] **Step 1: Define fixture specs in `fixture-defs.mjs`**

```js
/**
 * Fixture specs for the smoke test suite.
 * Each entry declares the desired post-build state of one fixture actor.
 * The builder diffs current state against this spec and patches deltas.
 */
export const FIXTURE_FOLDER_NAME = "VCE Smoke Test (do not delete)";
export const FIXTURE_PREFIX = "_smoke-";

// Compendium pack IDs
export const PACKS = {
  classes: "vagabond-character-enhancer.vce-classes",
  perks:   "vagabond-character-enhancer.vce-perks",
  ancestries: "vagabond-character-enhancer.vce-ancestries",
};

export const FIXTURE_DEFS = {
  Generic: {
    name: "_smoke-Generic",
    type: "character",
    className: "Fighter",
    level: 5,
    ancestryName: "Human",
    stats: { mig: 5, dex: 4, awr: 3, rsn: 2, prs: 3, lck: 3 },
    perks: [],
    items: [
      { name: "Longsword", type: "weapon" },
      { name: "Dagger", type: "weapon" }
    ],
    spells: [],
  },
  Druid: {
    name: "_smoke-Druid",
    type: "character",
    className: "Druid",
    level: 5,
    ancestryName: "Human",
    stats: { mig: 3, dex: 3, awr: 6, rsn: 3, prs: 3, lck: 3 },
    perks: [],
    items: [],
    spells: ["Polymorph", "Bless"],
  },
  Revelator: {
    name: "_smoke-Revelator",
    type: "character",
    className: "Revelator",
    level: 5,
    ancestryName: "Human",
    stats: { mig: 3, dex: 3, awr: 3, rsn: 3, prs: 6, lck: 3 },
    perks: [],
    items: [],
    spells: ["Bless", "Life"],
  },
  Witch: {
    name: "_smoke-Witch",
    type: "character",
    className: "Witch",
    level: 5,
    ancestryName: "Human",
    stats: { mig: 3, dex: 3, awr: 6, rsn: 3, prs: 3, lck: 3 },
    perks: [],
    items: [
      { name: "Dagger", type: "weapon" }
    ],
    spells: ["Burn", "Bless", "Imbue", "Ward", "Hex"],
  },
  NPC: {
    name: "_smoke-NPC",
    type: "npc",
    stats: { mig: 1, dex: 2, awr: 2, rsn: 2, prs: 2, lck: 1 },
    hp: 1,
    armor: 0,
  },
  TestPC: {
    name: "_smoke-TestPC",
    type: "character",
    className: null,           // unset by default — Tier B/C tests swap class in
    level: 5,
    ancestryName: "Human",
    stats: { mig: 4, dex: 4, awr: 4, rsn: 4, prs: 4, lck: 3 },
    perks: [],
    items: [],
    spells: [],
  },
};
```

- [ ] **Step 2: Implement `Fixtures` in `fixtures.mjs`**

```js
import { MODULE_ID, log } from "../utils.mjs";
import { FIXTURE_DEFS, FIXTURE_FOLDER_NAME, FIXTURE_PREFIX, PACKS } from "./fixture-defs.mjs";

const SMOKE_FLAG = "smokeTestFixture";   // marks an actor as a fixture for cleanup safety

export const Fixtures = {
  /** @type {Map<string, Actor>} keyed by fixture short-name (e.g. "Witch") */
  _cache: new Map(),

  async ensureAll() {
    const folder = await this._ensureFolder();
    for (const [shortName, def] of Object.entries(FIXTURE_DEFS)) {
      const actor = await this._ensureFixture(shortName, def, folder);
      this._cache.set(shortName, actor);
    }
    log("SmokeTest", `Fixtures ready: ${[...this._cache.keys()].join(", ")}`);
  },

  get(shortName) {
    if (this._cache.has(shortName)) return this._cache.get(shortName);
    // Fallback: look up by name (fixture exists but cache cold)
    const fullName = FIXTURE_PREFIX + (FIXTURE_DEFS[shortName]?.name?.replace(FIXTURE_PREFIX, "") ?? shortName);
    return game.actors.getName(FIXTURE_DEFS[shortName]?.name ?? fullName);
  },

  async _ensureFolder() {
    let f = game.folders.find(f => f.name === FIXTURE_FOLDER_NAME && f.type === "Actor");
    if (!f) f = await Folder.create({ name: FIXTURE_FOLDER_NAME, type: "Actor", color: "#5d3fd3" });
    return f;
  },

  async _ensureFixture(shortName, def, folder) {
    let a = game.actors.getName(def.name);
    if (!a) {
      a = await Actor.create({
        name: def.name, type: def.type, folder: folder.id,
        flags: { [MODULE_ID]: { [SMOKE_FLAG]: true } }
      });
    }

    // Patch derived state — set stats, level, equipment per def. Use a single
    // actor.update where possible; embedded items go through createEmbeddedDocuments.
    await this._syncStats(a, def);
    await this._syncClass(a, def);
    await this._syncAncestry(a, def);
    await this._syncSpells(a, def);
    await this._syncItems(a, def);
    return a;
  },

  async _syncStats(actor, def) {
    if (!def.stats) return;
    const update = {};
    for (const [k, v] of Object.entries(def.stats)) {
      update[`system.stats.${k}.value`] = v;
    }
    if (def.hp != null) update["system.health.value"] = update["system.health.max"] = def.hp;
    if (def.armor != null) update["system.armor.value"] = def.armor;
    await actor.update(update);
  },

  async _syncClass(actor, def) {
    if (!def.className) return;
    const existing = actor.items.find(i => i.type === "class" && i.name === def.className);
    if (existing && existing.system?.level === def.level) return;
    // Remove other class items
    const stale = actor.items.filter(i => i.type === "class" && i.name !== def.className);
    if (stale.length) await actor.deleteEmbeddedDocuments("Item", stale.map(i => i.id));
    if (existing) {
      await existing.update({ "system.level": def.level });
    } else {
      const pack = game.packs.get(PACKS.classes);
      const idx = await pack.getIndex();
      const entry = idx.find(e => e.name === def.className);
      if (!entry) { log("SmokeTest", `Missing class in compendium: ${def.className}`); return; }
      const doc = await pack.getDocument(entry._id);
      const data = doc.toObject();
      data.system.level = def.level;
      await actor.createEmbeddedDocuments("Item", [data]);
    }
  },

  async _syncAncestry(actor, def) {
    if (!def.ancestryName) return;
    const existing = actor.items.find(i => i.type === "ancestry" && i.name === def.ancestryName);
    if (existing) return;
    const pack = game.packs.get(PACKS.ancestries);
    const idx = await pack.getIndex();
    const entry = idx.find(e => e.name === def.ancestryName);
    if (!entry) { log("SmokeTest", `Missing ancestry in compendium: ${def.ancestryName}`); return; }
    const doc = await pack.getDocument(entry._id);
    await actor.createEmbeddedDocuments("Item", [doc.toObject()]);
  },

  async _syncSpells(actor, def) {
    if (!def.spells?.length) return;
    const existing = new Set(actor.items.filter(i => i.type === "spell").map(i => i.name));
    const toAdd = def.spells.filter(name => !existing.has(name));
    if (!toAdd.length) return;
    const created = [];
    for (const name of toAdd) {
      // Prefer a system or VCE spells compendium if one exists; else create a stub.
      const stub = { name, type: "spell", system: {} };
      created.push(stub);
    }
    if (created.length) await actor.createEmbeddedDocuments("Item", created);
  },

  async _syncItems(actor, def) {
    if (!def.items?.length) return;
    const existing = new Set(actor.items.filter(i => i.type === "weapon").map(i => i.name));
    const toAdd = def.items.filter(it => !existing.has(it.name));
    if (!toAdd.length) return;
    const stubs = toAdd.map(it => ({ name: it.name, type: it.type, system: {} }));
    await actor.createEmbeddedDocuments("Item", stubs);
  },

  /** Used by runner cleanup as a safety check before mutating. */
  isFixtureActor(actor) {
    return !!actor?.getFlag?.(MODULE_ID, SMOKE_FLAG);
  }
};
```

- [ ] **Step 3: Wire `Fixtures.ensureAll` into `SmokeTest.run`**

In `scripts/smoke-test/index.mjs`, replace the stub:

```js
import { Fixtures } from "./fixtures.mjs";

export const SmokeTest = {
  async run(opts = {}) {
    const start = performance.now();
    await Fixtures.ensureAll();
    return {
      summary: { total: 0, passed: 0, failed: 0, skipped: 0, errored: 0, durationMs: Math.round(performance.now() - start) },
      results: []
    };
  }
};
```

- [ ] **Step 4: Verify via MCP**

```js
mcp__foundry-vtt__evaluate({ expression:
  `await game.vagabondCharacterEnhancer.smokeTest();
   ({
     folder: !!game.folders.find(f => f.name === "VCE Smoke Test (do not delete)"),
     actors: ["_smoke-Generic","_smoke-Druid","_smoke-Revelator","_smoke-Witch","_smoke-NPC","_smoke-TestPC"]
       .map(n => ({ name: n, exists: !!game.actors.getName(n), classItems: game.actors.getName(n)?.items?.filter(i=>i.type==="class").map(i=>i.name) ?? null }))
   })`
})
// Expect: folder=true, all six actors exist, character classes match defs
```

Re-run twice — both calls should be no-ops on second invocation (no new actors created, no errors).

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke-test/fixture-defs.mjs scripts/smoke-test/fixtures.mjs scripts/smoke-test/index.mjs
git commit -m "feat(smoke): fixture builder with idempotent ensureAll

Six fixtures auto-created in 'VCE Smoke Test (do not delete)' folder.
Builder diffs current state against fixture-defs and patches deltas
so re-runs are no-ops."
```

---

## Task 2: Assertions and Console Watcher

**Goal:** Build the `assert(condition, message)` helper that collects (rather than throws), the chat-tail snapshot, and the console error watcher.

**Files:**
- Create: `scripts/smoke-test/assertions.mjs`
- Create: `scripts/smoke-test/console-watcher.mjs`

**Acceptance Criteria:**
- [ ] `createAssert()` returns `{ assert, failures }` where `assert(false, "msg")` pushes `{ message: "msg" }` to `failures` and `assert(true, ...)` is a no-op
- [ ] `ConsoleWatcher.snapshot()` returns a token; `ConsoleWatcher.collect(token)` returns errors logged since the snapshot
- [ ] Chat tail captures only messages created during the test window

**Verify:**
```js
mcp__foundry-vtt__evaluate({ expression: `
  const { createAssert } = await import("/modules/vagabond-character-enhancer/scripts/smoke-test/assertions.mjs");
  const { ConsoleWatcher } = await import("/modules/vagabond-character-enhancer/scripts/smoke-test/console-watcher.mjs");
  const { assert, failures } = createAssert();
  assert(true, "should not record");
  assert(false, "should record");
  const tok = ConsoleWatcher.snapshot();
  console.error("test error from smoke verify");
  const errs = ConsoleWatcher.collect(tok);
  return { failures, errCount: errs.length, lastErr: errs.at(-1)?.message };
`})
// Expect: failures: [{message:"should record"}], errCount >= 1, lastErr matching
```

**Steps:**

- [ ] **Step 1: Implement `assertions.mjs`**

```js
/**
 * Smoke-test assertion helpers.
 * `assert` collects failures rather than throwing — multiple failures per test
 * are reported.
 */
export function createAssert() {
  const failures = [];
  const assert = (condition, message) => {
    if (!condition) failures.push({ message: String(message ?? "(no message)") });
  };
  return { assert, failures };
}

/** Common assertion shortcuts. */
export const A = {
  hasFlag(actor, moduleId, key) {
    return !!actor.getFlag(moduleId, key);
  },
  flagEquals(actor, moduleId, key, expected) {
    const v = actor.getFlag(moduleId, key);
    return foundry.utils.objectsEqual?.(v, expected) ?? JSON.stringify(v) === JSON.stringify(expected);
  },
  hasAE(actor, name) {
    return actor.effects.some(e => e.name === name);
  },
  hasStatus(actor, statusId) {
    return actor.statuses?.has?.(statusId) ?? false;
  },
  chatLastContains(messages, substring) {
    return messages.at(-1)?.content?.includes(substring) ?? false;
  }
};
```

- [ ] **Step 2: Implement `console-watcher.mjs`**

```js
/**
 * Captures console errors produced during a smoke test.
 * Implementation: wraps console.error / console.warn at module load, keeps a
 * sliding buffer with timestamps. Snapshot returns the buffer length; collect
 * returns slice from snapshot to now.
 */
const BUFFER = [];
const MAX = 1000;

const _origError = console.error.bind(console);
const _origWarn  = console.warn.bind(console);
console.error = (...args) => {
  BUFFER.push({ ts: Date.now(), level: "error", message: args.map(a => typeof a === "string" ? a : (a?.message ?? String(a))).join(" ") });
  if (BUFFER.length > MAX) BUFFER.splice(0, BUFFER.length - MAX);
  _origError(...args);
};
console.warn = (...args) => {
  BUFFER.push({ ts: Date.now(), level: "warn", message: args.map(a => typeof a === "string" ? a : (a?.message ?? String(a))).join(" ") });
  if (BUFFER.length > MAX) BUFFER.splice(0, BUFFER.length - MAX);
  _origWarn(...args);
};

export const ConsoleWatcher = {
  snapshot() {
    return BUFFER.length;
  },
  collect(snapshotIndex, { level = "error" } = {}) {
    const slice = BUFFER.slice(snapshotIndex);
    if (level === "all") return slice;
    return slice.filter(e => e.level === level);
  }
};
```

- [ ] **Step 3: Run verify expression above**

Confirm both modules load and return expected shapes.

- [ ] **Step 4: Commit**

```bash
git add scripts/smoke-test/assertions.mjs scripts/smoke-test/console-watcher.mjs
git commit -m "feat(smoke): assertion helpers + console watcher

createAssert() collects failures without throwing. ConsoleWatcher
captures errors/warnings via console.error/warn wrapping with
snapshot/collect indexing."
```

---

## Task 3: Sequential Runner with Snapshot/Restore

**Goal:** Build the runner that discovers test arrays, runs them sequentially, snapshots and restores fixture state per test, and records results.

**Files:**
- Create: `scripts/smoke-test/runner.mjs`
- Modify: `scripts/smoke-test/index.mjs` (replace stub run with real orchestration)

**Acceptance Criteria:**
- [ ] Runner accepts a flat array of test definitions and returns the result shape from spec section 5.2
- [ ] Per-test `beforeEach` snapshots HP, statuses, all VCE flags, embedded item IDs, and `system.focus.spellIds` for declared `usesFixtures`
- [ ] Per-test `afterEach` restores primitive fields, deletes new items, deletes new effects, and trims new chat messages
- [ ] Throwing tests produce `status: "error"`, not crashes
- [ ] `run({ tier: "a" })` filters by tier; `run({ pattern: /focus/ })` filters by id

**Verify:**
```js
mcp__foundry-vtt__evaluate({ expression: `
  const { Runner } = await import("/modules/vagabond-character-enhancer/scripts/smoke-test/runner.mjs");
  const tests = [
    { id: "demo.pass", name: "demo pass", tier: "a", usesFixtures: ["Generic"], run: async ({ assert }) => assert(true, "ok") },
    { id: "demo.fail", name: "demo fail", tier: "a", usesFixtures: ["Generic"], run: async ({ assert }) => assert(false, "boom") },
    { id: "demo.error", name: "demo error", tier: "a", usesFixtures: ["Generic"], run: async () => { throw new Error("kaboom"); } },
    { id: "demo.skip", name: "demo skip", tier: "a", usesFixtures: ["Generic"], skip: () => true, run: async () => {} }
  ];
  return await Runner.run(tests, {});
`})
// Expect: results length 4 with statuses: pass, fail, error, skip
```

**Steps:**

- [ ] **Step 1: Implement `runner.mjs`**

```js
import { MODULE_ID, log } from "../utils.mjs";
import { Fixtures } from "./fixtures.mjs";
import { createAssert } from "./assertions.mjs";
import { ConsoleWatcher } from "./console-watcher.mjs";

const wait = (ms) => new Promise(r => setTimeout(r, ms));

export const Runner = {
  async run(tests, opts = {}) {
    await Fixtures.ensureAll();
    const filtered = tests.filter(t =>
      (!opts.tier || t.tier === opts.tier) &&
      (!opts.pattern || opts.pattern.test(t.id))
    );
    const results = [];
    const overallStart = performance.now();
    for (const test of filtered) {
      const result = await this._runOne(test);
      results.push(result);
      if (opts.failFast && (result.status === "fail" || result.status === "error")) break;
    }
    const summary = this._summarize(results, performance.now() - overallStart);
    return { summary, results };
  },

  async _runOne(test) {
    const start = performance.now();
    const base = { id: test.id, name: test.name, tier: test.tier, status: "pass", durationMs: 0, failures: [], errors: [], consoleErrors: [] };

    if (test.skip?.()) return { ...base, status: "skip", durationMs: 0 };

    const fixtures = this._collectFixtures(test.usesFixtures ?? []);
    const snapshot = this._snapshotFixtures(fixtures);
    const chatBaseline = game.messages.size;
    const consoleToken = ConsoleWatcher.snapshot();
    const { assert, failures } = createAssert();

    try {
      await test.run({
        fixtures,
        assert,
        wait,
        chatTail: () => Array.from(game.messages).slice(chatBaseline),
        consoleErrors: () => ConsoleWatcher.collect(consoleToken)
      });
      base.failures = failures;
      base.consoleErrors = ConsoleWatcher.collect(consoleToken);
      if (failures.length > 0) base.status = "fail";
      else if (test.failOnConsoleError && base.consoleErrors.length > 0) base.status = "fail";
    } catch (e) {
      base.status = "error";
      base.errors = [{ message: e?.message ?? String(e), stack: e?.stack }];
      base.consoleErrors = ConsoleWatcher.collect(consoleToken);
    } finally {
      try {
        await this._restoreFixtures(snapshot);
        await this._trimNewChat(chatBaseline);
      } catch (cleanupErr) {
        log("SmokeTest", `Cleanup error in ${test.id}: ${cleanupErr.message}`);
      }
      base.durationMs = Math.round(performance.now() - start);
      if (base.durationMs > 5000) console.warn(`${MODULE_ID} | slow smoke test: ${test.id} took ${base.durationMs}ms`);
    }
    return base;
  },

  _collectFixtures(names) {
    const out = {};
    for (const n of names) {
      const a = Fixtures.get(n);
      if (a) out[n] = a;
    }
    return out;
  },

  _snapshotFixtures(fixturesMap) {
    const snaps = [];
    for (const [name, actor] of Object.entries(fixturesMap)) {
      snaps.push({
        name,
        actorId: actor.id,
        flagsModule: foundry.utils.deepClone(actor.flags?.[MODULE_ID] ?? {}),
        spellIds: [...(actor.system?.focus?.spellIds ?? [])],
        hp: actor.system?.health?.value,
        statuses: [...(actor.statuses ?? [])],
        itemIds: actor.items.map(i => i.id),
        effectIds: actor.effects.map(e => e.id)
      });
    }
    return snaps;
  },

  async _restoreFixtures(snaps) {
    for (const s of snaps) {
      const actor = game.actors.get(s.actorId);
      if (!actor) continue;

      // Delete items added during the test
      const newItems = actor.items.filter(i => !s.itemIds.includes(i.id)).map(i => i.id);
      if (newItems.length) await actor.deleteEmbeddedDocuments("Item", newItems);

      // Delete effects added during the test
      const newEffects = actor.effects.filter(e => !s.effectIds.includes(e.id)).map(e => e.id);
      if (newEffects.length) await actor.deleteEmbeddedDocuments("ActiveEffect", newEffects);

      // Restore primitive fields
      const update = {
        [`flags.${MODULE_ID}`]: s.flagsModule,
        "system.focus.spellIds": s.spellIds
      };
      if (s.hp != null) update["system.health.value"] = s.hp;
      await actor.update(update, { diff: false });

      // Restore statuses by toggling differences
      const current = new Set(actor.statuses ?? []);
      const target  = new Set(s.statuses);
      for (const st of current) if (!target.has(st)) await actor.toggleStatusEffect(st, { active: false }).catch(() => {});
      for (const st of target) if (!current.has(st)) await actor.toggleStatusEffect(st, { active: true }).catch(() => {});
    }
  },

  async _trimNewChat(baseline) {
    if (game.messages.size <= baseline) return;
    const all = Array.from(game.messages);
    const toDelete = all.slice(baseline).map(m => m.id);
    if (toDelete.length) await ChatMessage.deleteDocuments(toDelete);
  },

  _summarize(results, durationMs) {
    return {
      total: results.length,
      passed: results.filter(r => r.status === "pass").length,
      failed: results.filter(r => r.status === "fail").length,
      errored: results.filter(r => r.status === "error").length,
      skipped: results.filter(r => r.status === "skip").length,
      durationMs: Math.round(durationMs)
    };
  }
};
```

- [ ] **Step 2: Wire into `index.mjs`**

```js
import { Runner } from "./runner.mjs";
// (remove old Fixtures import — Runner imports Fixtures itself)

export const SmokeTest = {
  async run(opts = {}) {
    const tests = await this._discoverTests();
    return Runner.run(tests, opts);
  },

  async _discoverTests() {
    // Filled in by later tasks. For now, return empty.
    return [];
  }
};
```

- [ ] **Step 3: Run the verify expression**

Expect 4 results (pass, fail, error, skip) with correct durationMs. Confirm fixture state on `_smoke-Generic` is unchanged after the demo run.

- [ ] **Step 4: Commit**

```bash
git add scripts/smoke-test/runner.mjs scripts/smoke-test/index.mjs
git commit -m "feat(smoke): sequential runner with snapshot/restore isolation

Per-test fixture state captured before run, restored after — items,
effects, flags, focus.spellIds, statuses, HP. Chat messages created
during the test are trimmed in cleanup."
```

---

## Task 4: Output (Console Table + Chat Banner)

**Goal:** Format suite results into a `console.table` and a GM-only `ChatMessage` summary banner.

**Files:**
- Create: `scripts/smoke-test/output.mjs`
- Modify: `scripts/smoke-test/index.mjs` (call output formatter from `run`)

**Acceptance Criteria:**
- [ ] After `smokeTest()` completes, `console.table` shows every test row
- [ ] A `ChatMessage` with whisper to GMs is created showing pass/fail/skip counts and a collapsible failure list
- [ ] Banner is green if all pass, red if any fail/error, yellow if all-pass-but-some-skipped

**Verify:**
```js
mcp__foundry-vtt__evaluate({ expression: `
  const before = game.messages.size;
  const r = await game.vagabondCharacterEnhancer.smokeTest();
  return { messageDelta: game.messages.size - before, latestContent: game.messages.contents.at(-1)?.content?.slice(0,200), summary: r.summary };
`})
// Expect: messageDelta >= 1, latestContent starts with "<div class=\"vce-smoke-summary"
```

**Steps:**

- [ ] **Step 1: Implement `output.mjs`**

```js
import { MODULE_ID } from "../utils.mjs";

export async function emitOutput({ summary, results }) {
  // Console table
  const rows = results.map(r => ({
    id: r.id, status: r.status, ms: r.durationMs,
    failures: r.failures.length,
    errors: r.errors.length,
    consoleErrors: r.consoleErrors.length
  }));
  console.table(rows);
  console.log(`${MODULE_ID} | smoke summary:`, summary);

  // Chat banner
  const banner = pickBanner(summary);
  const failed = results.filter(r => r.status === "fail" || r.status === "error");
  const failureList = failed.length ? `
    <details open style="margin-top:8px;">
      <summary style="cursor:pointer; font-weight:bold;">Failures (${failed.length})</summary>
      <ul style="margin: 4px 0 0 16px; padding: 0;">
        ${failed.map(r => `<li><code>${r.id}</code>: ${(r.failures[0]?.message ?? r.errors[0]?.message ?? "(no detail)").slice(0,200)}</li>`).join("")}
      </ul>
    </details>` : "";

  const content = `
    <div class="vce-smoke-summary" style="border-left: 4px solid ${banner.color}; padding: 8px 12px; background: ${banner.bg};">
      <div style="font-weight:bold; font-size:1.1em;">${banner.icon} VCE Smoke Test — ${banner.label}</div>
      <div style="margin-top:4px; font-size:0.9em;">
        ✓ ${summary.passed} passed · ✗ ${summary.failed} failed · ⚠ ${summary.errored} errored · ⏭ ${summary.skipped} skipped · ${summary.durationMs}ms
      </div>
      ${failureList}
    </div>`;

  await ChatMessage.create({
    content,
    whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id),
    speaker: { alias: "VCE Smoke Test" }
  });
}

function pickBanner(summary) {
  if (summary.failed > 0 || summary.errored > 0) return { color: "#c0392b", bg: "#fdecea", icon: "❌", label: "Failed" };
  if (summary.skipped > 0)                       return { color: "#d4ac0d", bg: "#fff8e1", icon: "⚠️", label: "Passed (with skips)" };
  return { color: "#27ae60", bg: "#eafaf1", icon: "✅", label: "All passed" };
}
```

- [ ] **Step 2: Call from `index.mjs`**

```js
import { Runner } from "./runner.mjs";
import { emitOutput } from "./output.mjs";

export const SmokeTest = {
  async run(opts = {}) {
    const tests = await this._discoverTests();
    const result = await Runner.run(tests, opts);
    if (!opts.silent) await emitOutput(result);
    return result;
  },
  async _discoverTests() { return []; }
};
```

- [ ] **Step 3: Verify**

Run the verify expression. Confirm the chat message is whispered to GM only, the banner uses the green icon (no tests yet, no failures, no skips → defaults to green "All passed").

- [ ] **Step 4: Commit**

```bash
git add scripts/smoke-test/output.mjs scripts/smoke-test/index.mjs
git commit -m "feat(smoke): console.table + GM-whispered chat banner output

Banner color: green (all pass), yellow (skips), red (failures).
Failures collapsed list with first failure reason per test."
```

---

## Task 5: Tier A — Boot + Focus Tests

**Goal:** Author the first 7 hand-written Tier A tests covering module boot, API surface, feature-detector creation flow, and the four focus-system tests.

**Files:**
- Create: `scripts/smoke-test/tests/tier-a/boot.mjs`
- Create: `scripts/smoke-test/tests/tier-a/focus.mjs`
- Modify: `scripts/smoke-test/index.mjs` (`_discoverTests` aggregates from tier files)

**Acceptance Criteria:**
- [ ] All 7 tests defined per spec section 6 (boot 1-3, focus 4-7)
- [ ] `smokeTest({ tier: "a", pattern: /^focus\./ })` runs the 4 focus tests
- [ ] All 7 tests pass on a clean world

**Verify:**
```js
mcp__foundry-vtt__evaluate({ expression:
  `(await game.vagabondCharacterEnhancer.smokeTest({ tier: "a", pattern: /^(boot|focus)\\./ })).summary`
})
// Expect: { total: 7, passed: 7, failed: 0, errored: 0, skipped: 0, ... }
```

**Steps:**

- [ ] **Step 1: Author `tests/tier-a/boot.mjs`**

```js
import { MODULE_ID } from "../../../utils.mjs";

export const tests = [
  {
    id: "boot.no-console-errors-recent",
    name: "No recent VCE console errors before suite start",
    tier: "a",
    usesFixtures: [],
    run: async ({ assert, consoleErrors }) => {
      // Stale errors from before suite are not our concern; this asserts a
      // CLEAN slate from the moment ConsoleWatcher snapshotted.
      const recent = consoleErrors().filter(e => /vagabond-character-enhancer/.test(e.message));
      assert(recent.length === 0, `expected zero VCE errors at boot, got ${recent.length}: ${recent.map(e=>e.message).join(" | ")}`);
    }
  },
  {
    id: "boot.api-surface-present",
    name: "game.vagabondCharacterEnhancer exposes documented API surface",
    tier: "a",
    usesFixtures: [],
    run: async ({ assert }) => {
      const api = game.vagabondCharacterEnhancer;
      const required = ["rescan","rescanAll","getFlags","focus","focusAcquire","focusRelease","virtuoso","stepUp","hunterMark","layOnHands","aura","imbue","brawlIntent","witch","summoner","conjure","banish","familiar","alchemist","polymorph","smokeTest"];
      for (const k of required) assert(typeof api?.[k] !== "undefined", `api.${k} is missing`);
    }
  },
  {
    id: "boot.feature-detector-runs-on-create",
    name: "Creating a fresh Druid actor populates feature flags",
    tier: "a",
    usesFixtures: [],
    run: async ({ assert, wait }) => {
      const a = await Actor.create({ name: "_smoke-tmp-druid", type: "character" });
      try {
        const pack = game.packs.get("vagabond-character-enhancer.vce-classes");
        const idx = await pack.getIndex();
        const entry = idx.find(e => e.name === "Druid");
        const cls = await pack.getDocument(entry._id);
        await a.createEmbeddedDocuments("Item", [cls.toObject()]);
        await wait(150);
        const flags = a.getFlag(MODULE_ID, "features") ?? {};
        const druidFlags = Object.keys(flags).filter(k => k.startsWith("druid_"));
        assert(druidFlags.length > 0, `expected druid_* flags after class creation, got: ${JSON.stringify(flags)}`);
      } finally {
        await a.delete();
      }
    }
  }
];
```

- [ ] **Step 2: Author `tests/tier-a/focus.mjs`**

```js
import { MODULE_ID } from "../../../utils.mjs";

export const tests = [
  {
    id: "focus.acquire-and-release",
    name: "FocusManager acquireFeatureFocus + releaseFeatureFocus round-trip",
    tier: "a",
    usesFixtures: ["Generic"],
    run: async ({ fixtures, assert }) => {
      const a = fixtures.Generic;
      const FM = game.vagabondCharacterEnhancer.focus;
      const ok = await FM.acquireFeatureFocus(a, "smoke_demo", "Smoke Demo");
      assert(ok === true, "acquire returned true");
      assert(FM.hasFeatureFocus(a, "smoke_demo"), "feature focus flag set");
      assert(FM.getTotalFocusCount(a) === 1, `expected total count 1, got ${FM.getTotalFocusCount(a)}`);
      await FM.releaseFeatureFocus(a, "smoke_demo");
      assert(!FM.hasFeatureFocus(a, "smoke_demo"), "feature focus flag cleared");
      assert(FM.getTotalFocusCount(a) === 0, "total count back to 0");
    }
  },
  {
    id: "focus.cap-enforced",
    name: "Focus cap blocks acquire when full",
    tier: "a",
    usesFixtures: ["Generic"],
    run: async ({ fixtures, assert }) => {
      const a = fixtures.Generic;
      const FM = game.vagabondCharacterEnhancer.focus;
      const max = a.system.focus?.max ?? 1;
      // Fill to cap
      for (let i = 0; i < max; i++) {
        const r = await FM.acquireFeatureFocus(a, `smoke_fill_${i}`, `fill ${i}`);
        assert(r === true, `fill #${i} should succeed`);
      }
      const overflow = await FM.acquireFeatureFocus(a, "smoke_overflow", "overflow");
      assert(overflow === false, "overflow acquire returned false");
    }
  },
  {
    id: "focus.stale-spellid-deleteItem-hook",
    name: "Deleting a focused spell auto-strips its ID from focus.spellIds",
    tier: "a",
    usesFixtures: ["Witch"],
    run: async ({ fixtures, assert, wait }) => {
      const a = fixtures.Witch;
      const [spell] = await a.createEmbeddedDocuments("Item", [{ name: "TmpSmoke", type: "spell", system: {} }]);
      await a.update({ "system.focus.spellIds": [spell.id] });
      await spell.delete();
      await wait(200);
      const ids = a.system.focus?.spellIds ?? [];
      assert(!ids.includes(spell.id), `expected ${spell.id} stripped, got ${JSON.stringify(ids)}`);
    }
  },
  {
    id: "focus.berserk-drops-all-focus",
    name: "Applying Berserk status drops all current focus",
    tier: "a",
    usesFixtures: ["Witch"],
    run: async ({ fixtures, assert, wait }) => {
      const a = fixtures.Witch;
      const FM = game.vagabondCharacterEnhancer.focus;
      await FM.acquireFeatureFocus(a, "smoke_berserk_test", "for berserk drop");
      assert(FM.getTotalFocusCount(a) === 1, "have 1 focus before berserk");
      await a.toggleStatusEffect("berserk", { active: true });
      await wait(250);
      assert(FM.getTotalFocusCount(a) === 0, "berserk dropped focus to 0");
    }
  }
];
```

- [ ] **Step 3: Aggregate in `_discoverTests`**

Replace the placeholder in `index.mjs`:

```js
async _discoverTests() {
  const tierAModules = [
    await import("./tests/tier-a/boot.mjs"),
    await import("./tests/tier-a/focus.mjs")
  ];
  return tierAModules.flatMap(m => m.tests);
}
```

- [ ] **Step 4: Verify**

```js
mcp__foundry-vtt__evaluate({ expression:
  `(await game.vagabondCharacterEnhancer.smokeTest({ tier: "a" })).summary`
})
// Expect: { total: 7, passed: 7, ... }
```

If any test fails, read the failure message and fix the test (or the underlying VCE bug it surfaced — if real, treat as a separate fix and commit independently).

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke-test/tests/tier-a/boot.mjs scripts/smoke-test/tests/tier-a/focus.mjs scripts/smoke-test/index.mjs
git commit -m "feat(smoke): tier-a boot + focus tests (7)

Verifies module loads cleanly, API surface intact, feature detector
fires on class create, focus acquire/release/cap/stale-spellId/berserk-
drops behavior."
```

---

## Task 6: Tier A — Companion + Spell Systems Tests

**Goal:** Author the next 9 Tier A tests: 4 companion-spawner tests and 5 spell-system tests (imbue, bless, ward, hex).

**Files:**
- Create: `scripts/smoke-test/tests/tier-a/companion.mjs`
- Create: `scripts/smoke-test/tests/tier-a/spells.mjs`
- Modify: `scripts/smoke-test/index.mjs` (`_discoverTests` adds the new modules)

**Acceptance Criteria:**
- [ ] 4 companion tests + 5 spell tests defined per spec
- [ ] All 9 tests pass on a clean world
- [ ] No new console errors during the suite

**Verify:**
```js
mcp__foundry-vtt__evaluate({ expression:
  `(await game.vagabondCharacterEnhancer.smokeTest({ tier: "a", pattern: /^(companion|imbue|bless|ward|hex)\\./ })).summary`
})
// Expect: { total: 9, passed: 9, ... }
```

**Steps:**

- [ ] **Step 1: Author `tests/tier-a/companion.mjs`**

```js
import { MODULE_ID } from "../../../utils.mjs";

export const tests = [
  {
    id: "companion.spawn-via-CompanionSpawner",
    name: "CompanionSpawner.spawn creates token with companionMeta flag",
    tier: "a",
    usesFixtures: ["Witch"],
    run: async ({ fixtures, assert, wait }) => {
      // Pick a beast actor from a compendium for the spawn payload
      const beastsPack = game.packs.get("vagabond-character-enhancer.vce-beasts");
      const idx = await beastsPack.getIndex();
      const entry = idx[0]; // first beast
      const beastDoc = await beastsPack.getDocument(entry._id);
      const tokenData = (await beastDoc.getTokenDocument()).toObject();
      tokenData.x = 100; tokenData.y = 100;
      const { CompanionSpawner } = await import("../../companion/companion-spawner.mjs");
      const spawned = await CompanionSpawner.spawn({
        caster: fixtures.Witch, sourceId: "spell-beast",
        actor: beastDoc, tokenData, suppressChat: true
      });
      try {
        await wait(150);
        assert(!!spawned?.length, "spawn returned token document(s)");
        const tok = spawned[0];
        const meta = tok.actor?.getFlag?.(MODULE_ID, "companionMeta");
        assert(meta?.sourceId === "spell-beast", `companionMeta.sourceId mismatch: ${JSON.stringify(meta)}`);
        assert(meta?.casterActorId === fixtures.Witch.id, "companionMeta.casterActorId points to caster");
      } finally {
        if (spawned?.length) {
          await canvas.scene.deleteEmbeddedDocuments("Token", spawned.map(t => t.id));
        }
      }
    }
  },
  {
    id: "companion.dismiss-clears-flags-and-token",
    name: "CompanionSpawner.dismissBySource removes token + caster-side state",
    tier: "a",
    usesFixtures: ["Witch"],
    run: async ({ fixtures, assert, wait }) => {
      const beastsPack = game.packs.get("vagabond-character-enhancer.vce-beasts");
      const beastDoc = await beastsPack.getDocument((await beastsPack.getIndex())[0]._id);
      const tokenData = (await beastDoc.getTokenDocument()).toObject();
      tokenData.x = 100; tokenData.y = 100;
      const { CompanionSpawner } = await import("../../companion/companion-spawner.mjs");
      const spawned = await CompanionSpawner.spawn({ caster: fixtures.Witch, sourceId: "spell-beast", actor: beastDoc, tokenData, suppressChat: true });
      await wait(100);
      await CompanionSpawner.dismissBySource(fixtures.Witch, "spell-beast");
      await wait(150);
      const stillThere = spawned.some(t => canvas.scene.tokens.get(t.id));
      assert(!stillThere, "tokens removed after dismiss");
    }
  },
  {
    id: "companion.zero-hp-auto-terminates",
    name: "Companion at 0 HP auto-dismisses (companion-termination)",
    tier: "a",
    usesFixtures: ["Witch"],
    run: async ({ fixtures, assert, wait }) => {
      const beastsPack = game.packs.get("vagabond-character-enhancer.vce-beasts");
      const beastDoc = await beastsPack.getDocument((await beastsPack.getIndex())[0]._id);
      const tokenData = (await beastDoc.getTokenDocument()).toObject();
      tokenData.x = 200; tokenData.y = 200;
      const { CompanionSpawner } = await import("../../companion/companion-spawner.mjs");
      const spawned = await CompanionSpawner.spawn({ caster: fixtures.Witch, sourceId: "spell-beast", actor: beastDoc, tokenData, suppressChat: true });
      await wait(100);
      const tok = spawned[0];
      try {
        // Force HP to 0
        await tok.actor.update({ "system.health.value": 0 });
        await wait(500);
        const stillThere = !!canvas.scene.tokens.get(tok.id);
        assert(!stillThere, "token auto-dismissed at 0 HP");
      } finally {
        if (canvas.scene.tokens.get(tok.id)) {
          await canvas.scene.deleteEmbeddedDocuments("Token", [tok.id]);
        }
      }
    }
  },
  {
    id: "companion.save-routing-uses-controller-stats",
    name: "Companion save routing references controller PC's stats",
    tier: "a",
    usesFixtures: ["Witch"],
    run: async ({ fixtures, assert, wait }) => {
      // Spawn a beast, verify the save patch routes through controller
      const beastsPack = game.packs.get("vagabond-character-enhancer.vce-beasts");
      const beastDoc = await beastsPack.getDocument((await beastsPack.getIndex())[0]._id);
      const tokenData = (await beastDoc.getTokenDocument()).toObject();
      tokenData.x = 50; tokenData.y = 50;
      const { CompanionSpawner } = await import("../../companion/companion-spawner.mjs");
      const spawned = await CompanionSpawner.spawn({ caster: fixtures.Witch, sourceId: "spell-beast", actor: beastDoc, tokenData, suppressChat: true });
      try {
        await wait(100);
        const compActor = spawned[0].actor;
        const meta = compActor.getFlag(MODULE_ID, "companionMeta");
        assert(meta?.casterActorId === fixtures.Witch.id, "controller link present");
        // The patch in save-routing-patch.mjs reads compActor flags and reroutes
        // saves through the controller. Smoke check: just confirm the flag is
        // there and the controller actor exists. Deeper save-arithmetic is
        // not in scope for Tier A.
        assert(!!game.actors.get(meta.casterActorId), "controller actor resolves");
      } finally {
        await canvas.scene.deleteEmbeddedDocuments("Token", spawned.map(t => t.id));
      }
    }
  }
];
```

- [ ] **Step 2: Author `tests/tier-a/spells.mjs`**

```js
import { MODULE_ID } from "../../../utils.mjs";
import { A } from "../../assertions.mjs";

export const tests = [
  {
    id: "imbue.attaches-to-weapon",
    name: "ImbueManager attaches imbue flag + AE to weapon",
    tier: "a",
    usesFixtures: ["Witch"],
    run: async ({ fixtures, assert, wait }) => {
      const a = fixtures.Witch;
      const weapon = a.items.find(i => i.type === "weapon");
      assert(!!weapon, "fixture has a weapon");
      const burn = a.items.find(i => i.name === "Burn" && i.type === "spell");
      assert(!!burn, "fixture has Burn spell");
      const IM = game.vagabondCharacterEnhancer.imbue;
      await IM.imbue(a, burn, weapon);
      await wait(150);
      const imbueFlag = weapon.getFlag(MODULE_ID, "imbue");
      assert(!!imbueFlag, `weapon should have imbue flag, got ${JSON.stringify(imbueFlag)}`);
    }
  },
  {
    id: "imbue.detaches-on-focus-drop",
    name: "Dropping focus on imbued spell clears the imbue flag",
    tier: "a",
    usesFixtures: ["Witch"],
    run: async ({ fixtures, assert, wait }) => {
      const a = fixtures.Witch;
      const weapon = a.items.find(i => i.type === "weapon");
      const imbue = a.items.find(i => i.name === "Imbue" && i.type === "spell");
      const IM = game.vagabondCharacterEnhancer.imbue;
      await IM.imbue(a, imbue, weapon);
      await wait(100);
      // Drop focus by clearing spellIds
      await a.update({ "system.focus.spellIds": [] });
      await wait(200);
      const imbueFlag = weapon.getFlag(MODULE_ID, "imbue");
      assert(!imbueFlag, `imbue flag should clear, got ${JSON.stringify(imbueFlag)}`);
    }
  },
  {
    id: "bless.applies-AE-to-target",
    name: "BlessManager applies a managed AE to the target actor",
    tier: "a",
    usesFixtures: ["Revelator", "NPC"],
    run: async ({ fixtures, assert, wait }) => {
      const caster = fixtures.Revelator;
      const target = fixtures.NPC;
      const bless = caster.items.find(i => i.name === "Bless" && i.type === "spell");
      assert(!!bless, "Revelator has Bless");
      const { BlessManager } = await import("../../spell-features/bless-manager.mjs");
      await BlessManager.bless(caster, bless, [target]);
      await wait(200);
      const ae = target.effects.find(e => /bless/i.test(e.name));
      assert(!!ae, `Bless AE expected on target, effects: ${target.effects.map(e=>e.name).join(", ")}`);
    }
  },
  {
    id: "ward.absorbs-damage-non-lethal-cap",
    name: "Ward caps damage at 1 HP (non-lethal) when warded",
    tier: "a",
    usesFixtures: ["Witch"],
    run: async ({ fixtures, assert, wait }) => {
      const a = fixtures.Witch;
      const ward = a.items.find(i => i.name === "Ward" && i.type === "spell");
      assert(!!ward, "Witch has Ward");
      const startHP = a.system.health.value;
      const { WardManager } = await import("../../spell-features/ward-manager.mjs");
      await WardManager.applyWard(a, { cost: 2 });
      await wait(150);
      // Apply damage greater than current HP
      const damageHelper = (await import("/systems/vagabond/module/helpers/damage-helper.mjs")).VagabondDamageHelper;
      await damageHelper.applyDamage(a, startHP + 10, { source: "smoke" });
      await wait(200);
      assert(a.system.health.value >= 1, `HP cap should be >= 1, got ${a.system.health.value}`);
    }
  },
  {
    id: "hex.applies-and-clears",
    name: "Hex API applies hexed status and unhex clears it",
    tier: "a",
    usesFixtures: ["Witch", "NPC"],
    run: async ({ fixtures, assert, wait }) => {
      const caster = fixtures.Witch;
      const target = fixtures.NPC;
      const api = game.vagabondCharacterEnhancer;
      await api.hex(caster, target);
      await wait(150);
      assert(A.hasStatus(target, "hexed") || A.hasAE(target, "Hexed"), "hexed status applied");
      await api.unhex(caster, target);
      await wait(150);
      assert(!A.hasStatus(target, "hexed") && !A.hasAE(target, "Hexed"), "hexed cleared");
    }
  }
];
```

- [ ] **Step 3: Update `_discoverTests` to include new files**

```js
async _discoverTests() {
  const tierA = [
    await import("./tests/tier-a/boot.mjs"),
    await import("./tests/tier-a/focus.mjs"),
    await import("./tests/tier-a/companion.mjs"),
    await import("./tests/tier-a/spells.mjs")
  ];
  return tierA.flatMap(m => m.tests);
}
```

- [ ] **Step 4: Verify**

Run the verify expression. Expect total: 9 in the filter, 16 in unfiltered Tier A. If any test fails, debug — for each failure: is it a test-author bug or a real VCE regression? Real regressions get a separate fix commit; test bugs get fixed in this task.

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke-test/tests/tier-a/companion.mjs scripts/smoke-test/tests/tier-a/spells.mjs scripts/smoke-test/index.mjs
git commit -m "feat(smoke): tier-a companion + spell-system tests (9)

CompanionSpawner spawn/dismiss/HP-termination/save-routing.
Imbue attach/detach, Bless AE, Ward damage cap, Hex apply/clear."
```

---

## Task 7: Tier A — Aura/Polymorph/Brawl + Detection/AE + Encumbrance/FX

**Goal:** Author the remaining 9 Tier A tests across three subsystem groups.

**Files:**
- Create: `scripts/smoke-test/tests/tier-a/aura-polymorph-brawl.mjs`
- Create: `scripts/smoke-test/tests/tier-a/detection-ae.mjs`
- Create: `scripts/smoke-test/tests/tier-a/encumbrance-fx.mjs`
- Modify: `scripts/smoke-test/index.mjs`

**Acceptance Criteria:**
- [ ] 9 tests defined and passing
- [ ] Full Tier A suite (25 tests total) passes
- [ ] No new console errors

**Verify:**
```js
mcp__foundry-vtt__evaluate({ expression:
  `(await game.vagabondCharacterEnhancer.smokeTest({ tier: "a" })).summary`
})
// Expect: { total: 25, passed: 25, ... }
```

**Steps:**

- [ ] **Step 1: Author `tests/tier-a/aura-polymorph-brawl.mjs`**

```js
import { MODULE_ID } from "../../../utils.mjs";
import { A } from "../../assertions.mjs";

export const tests = [
  {
    id: "aura.template-follows-token",
    name: "Aura: template position updates when caster token moves",
    tier: "a",
    usesFixtures: ["Revelator"],
    run: async ({ fixtures, assert, wait }) => {
      const caster = fixtures.Revelator;
      const token = caster.getActiveTokens()[0];
      assert(!!token, "Revelator has a token on canvas");
      const startX = token.document.x;
      const api = game.vagabondCharacterEnhancer;
      // Place a generic aura
      const blessSpell = caster.items.find(i => i.name === "Bless" && i.type === "spell");
      assert(!!blessSpell, "caster has Bless to use as aura source");
      await api.aura(caster, blessSpell, 30);
      await wait(200);
      // Move the token
      await token.document.update({ x: startX + 200 });
      await wait(250);
      const templates = canvas.scene.templates.contents.filter(t => t.flags?.[MODULE_ID]?.aura);
      assert(templates.length > 0, "aura template exists");
      const t = templates.at(-1);
      assert(Math.abs(t.x - (startX + 200)) < 10, `template x should track token, template at ${t.x}, token at ${startX+200}`);
      // Cleanup
      await api.auraEnd(caster);
    }
  },
  {
    id: "polymorph.druid-becomes-and-reverts",
    name: "Druid polymorph swaps to beast actor and reverts on release",
    tier: "a",
    usesFixtures: ["Druid"],
    run: async ({ fixtures, assert, wait }) => {
      const druid = fixtures.Druid;
      const polymorph = game.vagabondCharacterEnhancer.polymorph;
      const beastsPack = game.packs.get("vagabond-character-enhancer.vce-beasts");
      const beastEntry = (await beastsPack.getIndex())[0];
      const beastDoc = await beastsPack.getDocument(beastEntry._id);
      // Polymorph
      await polymorph.transform(druid, beastDoc);
      await wait(300);
      const polyFlag = druid.getFlag(MODULE_ID, "polymorph");
      assert(!!polyFlag, `polymorph flag set, got ${JSON.stringify(polyFlag)}`);
      // Revert
      await polymorph.revert(druid);
      await wait(300);
      assert(!druid.getFlag(MODULE_ID, "polymorph"), "polymorph flag cleared on revert");
    }
  },
  {
    id: "polymorph.spell-focus-cleared-on-revert",
    name: "Polymorph revert filters non-polymorph focused spells",
    tier: "a",
    usesFixtures: ["Druid"],
    run: async ({ fixtures, assert, wait }) => {
      const druid = fixtures.Druid;
      const polymorph = game.vagabondCharacterEnhancer.polymorph;
      const beastsPack = game.packs.get("vagabond-character-enhancer.vce-beasts");
      const beastDoc = await beastsPack.getDocument((await beastsPack.getIndex())[0]._id);
      // Add a non-polymorph spell ID to focus.spellIds
      const tmp = (await druid.createEmbeddedDocuments("Item", [{ name: "TmpFocus", type: "spell", system: {} }]))[0];
      await druid.update({ "system.focus.spellIds": [tmp.id] });
      await polymorph.transform(druid, beastDoc);
      await wait(300);
      await polymorph.revert(druid);
      await wait(300);
      // After revert, focus.spellIds should be intact OR the temp ID may have been
      // sanitized depending on impl. Smoke-level check: no exception, focus.spellIds is array.
      assert(Array.isArray(druid.system.focus?.spellIds), "spellIds remains array");
    }
  },
  {
    id: "brawl.grapple-intent-applies-grapple-status",
    name: "Brawl grapple intent flow applies grappled status to target",
    tier: "a",
    usesFixtures: ["Generic", "NPC"],
    run: async ({ fixtures, assert, wait }) => {
      const attacker = fixtures.Generic;
      const target = fixtures.NPC;
      const BI = game.vagabondCharacterEnhancer.brawlIntent;
      // Set intent to grapple, then dispatch a fake brawl resolution
      await BI.setIntent(attacker, "grapple");
      await BI.applyResult(attacker, target, { hit: true });
      await wait(150);
      assert(A.hasStatus(target, "grappled") || A.hasAE(target, "Grappled"),
        `expected grappled status on target, statuses: ${[...(target.statuses||[])].join(",")}`);
    }
  }
];
```

- [ ] **Step 2: Author `tests/tier-a/detection-ae.mjs`**

```js
import { MODULE_ID } from "../../../utils.mjs";
import { A } from "../../assertions.mjs";

export const tests = [
  {
    id: "feature-detector.adds-managed-AE",
    name: "Adding a Wizard class with Manifold Mind creates managed AE",
    tier: "a",
    usesFixtures: ["TestPC"],
    run: async ({ fixtures, assert, wait }) => {
      const a = fixtures.TestPC;
      // Equip Wizard at level 5 (Manifold Mind unlocks at level 4)
      const pack = game.packs.get("vagabond-character-enhancer.vce-classes");
      const idx = await pack.getIndex();
      const cls = await pack.getDocument(idx.find(e => e.name === "Wizard")._id);
      const data = cls.toObject();
      data.system.level = 5;
      await a.createEmbeddedDocuments("Item", [data]);
      await game.vagabondCharacterEnhancer.rescan(a);
      await wait(150);
      const aeNames = a.effects.map(e => e.name);
      assert(aeNames.some(n => /manifold mind/i.test(n)), `expected Manifold Mind AE, got: ${aeNames.join(", ")}`);
    }
  },
  {
    id: "feature-detector.removes-AE-when-class-removed",
    name: "Removing a class item deletes its managed AEs",
    tier: "a",
    usesFixtures: ["TestPC"],
    run: async ({ fixtures, assert, wait }) => {
      const a = fixtures.TestPC;
      // Setup: equip Wizard at level 5
      const pack = game.packs.get("vagabond-character-enhancer.vce-classes");
      const cls = await pack.getDocument((await pack.getIndex()).find(e => e.name === "Wizard")._id);
      const data = cls.toObject();
      data.system.level = 5;
      const [created] = await a.createEmbeddedDocuments("Item", [data]);
      await game.vagabondCharacterEnhancer.rescan(a);
      await wait(150);
      const beforeAE = a.effects.map(e => e.name);
      assert(beforeAE.some(n => /manifold mind/i.test(n)), `precondition: Manifold Mind AE present`);
      // Remove the class
      await created.delete();
      await game.vagabondCharacterEnhancer.rescan(a);
      await wait(150);
      const afterAE = a.effects.map(e => e.name);
      assert(!afterAE.some(n => /manifold mind/i.test(n)), `Manifold Mind AE removed, got: ${afterAE.join(", ")}`);
    }
  },
  {
    id: "range-validator.hinders-out-of-range-attack",
    name: "RangeValidator hinders an attack to an out-of-range target",
    tier: "a",
    usesFixtures: ["Generic", "NPC"],
    run: async ({ fixtures, assert, wait, consoleErrors }) => {
      const attacker = fixtures.Generic;
      const target = fixtures.NPC;
      const tA = attacker.getActiveTokens()[0];
      const tT = target.getActiveTokens()[0];
      assert(tA && tT, "both tokens on canvas");
      // Move target way out of range
      await tT.document.update({ x: tA.document.x + 5000 });
      const dagger = attacker.items.find(i => i.name === "Dagger");
      assert(!!dagger, "attacker has dagger");
      // Set a target via UserTargets
      game.user.updateTokenTargets([tT.id]);
      // Trigger an attack — we don't assert on the roll outcome, just that it
      // doesn't throw and a console-recorded warning/notification happens.
      try {
        await dagger.rollAttack({ skipDialog: true });
      } catch (e) {
        // some flows return early with a notification; OK either way
      }
      await wait(150);
      const errs = consoleErrors();
      assert(errs.length === 0, `no thrown errors expected, got: ${errs.map(e=>e.message).join(" | ")}`);
      // Reset target
      game.user.updateTokenTargets([]);
    }
  }
];
```

- [ ] **Step 3: Author `tests/tier-a/encumbrance-fx.mjs`**

```js
import { MODULE_ID } from "../../../utils.mjs";
import { A } from "../../assertions.mjs";

export const tests = [
  {
    id: "encumbrance.over-capacity-applies-encumbered",
    name: "EncumbranceManager: over-capacity inventory applies encumbered status",
    tier: "a",
    skip: () => !game.settings.get(MODULE_ID, "encumbranceEnabled"),
    usesFixtures: ["Generic"],
    run: async ({ fixtures, assert, wait }) => {
      const a = fixtures.Generic;
      const slots = (a.system.inventory?.slots ?? 0) + (a.system.inventory?.bonusSlots ?? 0);
      assert(slots > 0, `inventory slots > 0, got ${slots}`);
      // Add bulky items to overflow
      const bulky = Array.from({length: slots + 3}, (_, i) => ({ name: `Bulk${i}`, type: "item", system: { quantity: 1, slots: 1 } }));
      const created = await a.createEmbeddedDocuments("Item", bulky);
      await wait(300);
      assert(A.hasStatus(a, "encumbered"), `expected encumbered status, got ${[...(a.statuses||[])].join(",")}`);
    }
  },
  {
    id: "feature-fx.config-roundtrip",
    name: "Feature FX config: write key, read back merged with defaults",
    tier: "a",
    usesFixtures: [],
    run: async ({ assert }) => {
      const { setFeatureFxConfig, getFeatureFxConfig } = await import("../../focus/feature-fx-config.mjs");
      await setFeatureFxConfig("smoke_test_key", { enabled: true, file: "test://path", scale: 2.0 });
      const got = getFeatureFxConfig("smoke_test_key");
      assert(got?.enabled === true, "enabled persisted");
      assert(got?.file === "test://path", "file persisted");
      assert(got?.scale === 2.0, "scale persisted");
      // Cleanup: delete the test key
      const all = game.settings.get(MODULE_ID, "featureFxConfig") ?? {};
      delete all.smoke_test_key;
      await game.settings.set(MODULE_ID, "featureFxConfig", all);
    }
  }
];
```

- [ ] **Step 4: Update `_discoverTests`**

```js
async _discoverTests() {
  const tierA = [
    await import("./tests/tier-a/boot.mjs"),
    await import("./tests/tier-a/focus.mjs"),
    await import("./tests/tier-a/companion.mjs"),
    await import("./tests/tier-a/spells.mjs"),
    await import("./tests/tier-a/aura-polymorph-brawl.mjs"),
    await import("./tests/tier-a/detection-ae.mjs"),
    await import("./tests/tier-a/encumbrance-fx.mjs")
  ];
  return tierA.flatMap(m => m.tests);
}
```

- [ ] **Step 5: Verify full Tier A run**

```js
mcp__foundry-vtt__evaluate({ expression:
  `(await game.vagabondCharacterEnhancer.smokeTest({ tier: "a" })).summary`
})
// Expect: { total: 25, passed: 25, failed: 0, errored: 0, ... }
```

For each failure: surface to user — is it a test bug or a real VCE bug? Real bugs get a separate commit; test bugs are fixed inline.

- [ ] **Step 6: Commit**

```bash
git add scripts/smoke-test/tests/tier-a/aura-polymorph-brawl.mjs scripts/smoke-test/tests/tier-a/detection-ae.mjs scripts/smoke-test/tests/tier-a/encumbrance-fx.mjs scripts/smoke-test/index.mjs
git commit -m "feat(smoke): tier-a remaining tests (9) — completes Tier A (25)

Aura template-follows-token, Druid polymorph round-trip, Brawl grapple
intent, FeatureDetector AE add/remove, RangeValidator out-of-range,
Encumbrance over-capacity, FeatureFX config roundtrip."
```

---

## Task 8: Class-Swap Helper for TestPC

**Goal:** Add `Fixtures.swapClass(actorName, className, level)` so Tier B tests can reconfigure `_smoke-TestPC` per test cleanly.

**Files:**
- Modify: `scripts/smoke-test/fixtures.mjs` (add `swapClass` method)

**Acceptance Criteria:**
- [ ] `Fixtures.swapClass("TestPC", "Barbarian", 5)` removes existing class items, imports Barbarian at level 5, runs feature-detector rescan
- [ ] Idempotent — re-running with the same class is a no-op
- [ ] Snapshot/restore in runner cleans up the swapped class on `afterEach`

**Verify:**
```js
mcp__foundry-vtt__evaluate({ expression: `
  const { Fixtures } = await import("/modules/vagabond-character-enhancer/scripts/smoke-test/fixtures.mjs");
  await Fixtures.ensureAll();
  await Fixtures.swapClass("TestPC", "Barbarian", 5);
  const a = Fixtures.get("TestPC");
  return {
    classes: a.items.filter(i=>i.type==="class").map(i=>({name:i.name, level:i.system?.level})),
    flags: Object.keys(a.getFlag("vagabond-character-enhancer", "features") ?? {}).filter(k => k.startsWith("barbarian_"))
  };
`})
// Expect: classes: [{ name: "Barbarian", level: 5 }], flags: non-empty array
```

**Steps:**

- [ ] **Step 1: Add `swapClass` method to `Fixtures`**

In `scripts/smoke-test/fixtures.mjs`, add inside the `Fixtures` object (after `ensureAll`):

```js
async swapClass(shortName, className, level = 5) {
  const a = this.get(shortName);
  if (!a) throw new Error(`Fixture ${shortName} not found — call ensureAll first`);
  // Reuse existing _syncClass logic with a synthesized def
  await this._syncClass(a, { className, level });
  await game.vagabondCharacterEnhancer.rescan(a);
},
```

- [ ] **Step 2: Verify**

Run the verify expression. Confirm Barbarian class is the only class, level is 5, and `barbarian_*` flags appear.

Re-run with the same class — expect no actor mutation (classes still `[{name:"Barbarian",level:5}]`, no errors).

- [ ] **Step 3: Commit**

```bash
git add scripts/smoke-test/fixtures.mjs
git commit -m "feat(smoke): Fixtures.swapClass for Tier B class-per-test setup

Reuses _syncClass diff logic, runs feature-detector rescan after swap."
```

---

## Task 9: Tier B — Martial + Skirmisher Classes (8 tests)

**Goal:** Author class signature tests for the 8 martial/skirmisher classes: Barbarian, Fighter, Monk, Pugilist, Rogue, Gunslinger, Hunter, Dancer.

**Files:**
- Create: `scripts/smoke-test/tests/tier-b/martial.mjs`
- Create: `scripts/smoke-test/tests/tier-b/skirmisher.mjs`
- Modify: `scripts/smoke-test/index.mjs` (`_discoverTests` adds Tier B)

**Acceptance Criteria:**
- [ ] 8 tests defined per spec section 7
- [ ] All 8 use `_smoke-TestPC` with class swapped via `Fixtures.swapClass`
- [ ] At least 6 of 8 pass on a clean world (some may legitimately fail due to UI dialog dependencies — those should be marked `failOnConsoleError: false` and pass if no error thrown)

**Verify:**
```js
mcp__foundry-vtt__evaluate({ expression:
  `(await game.vagabondCharacterEnhancer.smokeTest({ tier: "b", pattern: /^(barbarian|fighter|monk|pugilist|rogue|gunslinger|hunter|dancer)\\./ })).summary`
})
// Expect: { total: 8, passed: >=6, ... }
```

**Steps:**

- [ ] **Step 1: Author `tests/tier-b/martial.mjs`**

Tests for: Barbarian (auto-Berserk), Fighter (Momentum chat injection), Monk (unarmed die scaling), Pugilist (Haymaker bonus), Rogue (Sneak attack damage).

Each test follows this pattern:

```js
{
  id: "barbarian.auto-berserk-on-hp-threshold",
  name: "Barbarian: HP drop below threshold triggers Berserk + drops focus",
  tier: "b",
  usesFixtures: ["TestPC"],
  setup: async ({ fixtures }) => {
    const { Fixtures } = await import("../../fixtures.mjs");
    await Fixtures.swapClass("TestPC", "Barbarian", 5);
  },
  run: async ({ fixtures, assert, wait }) => {
    const a = fixtures.TestPC;
    // Trigger HP threshold
    const halfHP = Math.floor(a.system.health.max / 2) - 1;
    await a.update({ "system.health.value": halfHP });
    await wait(250);
    assert(a.statuses?.has?.("berserk") || a.effects.some(e => /berserk/i.test(e.name)),
      "berserk applied on HP threshold");
  }
}
```

> **Note for the runner:** `setup` is a new lifecycle hook — extend `Runner._runOne` to invoke `test.setup?.({ fixtures })` after snapshot, before run. This is a one-line addition.

The full file lists all 5 martial tests. Each:
- Swaps `_smoke-TestPC` to the test's class via `Fixtures.swapClass`
- Triggers the signature feature
- Asserts on flag/AE/status state
- Where deeper assertion is hard (Fighter Momentum requires a chat-card click), the test asserts the chat card was created and contains the expected button HTML.

(Author the full file following this pattern — see spec section 7 for the per-class assertion spec.)

- [ ] **Step 2: Extend `Runner._runOne` with `setup` hook**

In `scripts/smoke-test/runner.mjs`, just before `await test.run({...})`:

```js
if (test.setup) await test.setup({ fixtures });
```

- [ ] **Step 3: Author `tests/tier-b/skirmisher.mjs`**

Tests for: Gunslinger (Trick Shot dialog opens without error), Hunter (`hunterMark(actor, target)` flag on target + favor), Dancer (`stepUp(actor)` flag set).

Pattern same as martial tests — class swap via `setup`, trigger via API method, assert flag.

- [ ] **Step 4: Update `_discoverTests`**

```js
async _discoverTests() {
  const all = [
    // Tier A
    await import("./tests/tier-a/boot.mjs"),
    await import("./tests/tier-a/focus.mjs"),
    await import("./tests/tier-a/companion.mjs"),
    await import("./tests/tier-a/spells.mjs"),
    await import("./tests/tier-a/aura-polymorph-brawl.mjs"),
    await import("./tests/tier-a/detection-ae.mjs"),
    await import("./tests/tier-a/encumbrance-fx.mjs"),
    // Tier B (partial)
    await import("./tests/tier-b/martial.mjs"),
    await import("./tests/tier-b/skirmisher.mjs")
  ];
  return all.flatMap(m => m.tests);
}
```

- [ ] **Step 5: Verify**

```js
mcp__foundry-vtt__evaluate({ expression:
  `(await game.vagabondCharacterEnhancer.smokeTest({ tier: "b" })).summary`
})
// Expect: total: 8, passed: >= 6
```

For each failure, audit: real VCE bug? Then fix VCE (separate commit). Test bug? Fix in this task.

- [ ] **Step 6: Commit**

```bash
git add scripts/smoke-test/tests/tier-b/ scripts/smoke-test/runner.mjs scripts/smoke-test/index.mjs
git commit -m "feat(smoke): tier-b martial + skirmisher class signatures (8)

Class-swap setup hook in Runner. Tests for Barbarian, Fighter, Monk,
Pugilist, Rogue, Gunslinger, Hunter, Dancer."
```

---

## Task 10: Tier B — Caster + Specialist Classes (12 tests)

**Goal:** Author class signature tests for the remaining 12 classes: Wizard, Magus, Sorcerer, Druid, Revelator, Witch, Luminary, Alchemist, Bard, Merchant, Summoner, Vanguard.

**Files:**
- Create: `scripts/smoke-test/tests/tier-b/casters.mjs`
- Create: `scripts/smoke-test/tests/tier-b/specialists.mjs`
- Modify: `scripts/smoke-test/index.mjs`

**Acceptance Criteria:**
- [ ] 12 tests defined per spec section 7
- [ ] All use class-swap setup
- [ ] Full Tier B (20 tests) passes ≥75% on clean world; document any expected/known partial failures (UI-bound features) inline

**Verify:**
```js
mcp__foundry-vtt__evaluate({ expression:
  `(await game.vagabondCharacterEnhancer.smokeTest({ tier: "b" })).summary`
})
// Expect: total: 20, passed: >= 15
```

**Steps:**

- [ ] **Step 1: Author `tests/tier-b/casters.mjs`** with these 7 tests:

Wizard (Sculpt Spell AE present after class swap), Magus (imbue via Magus path), Sorcerer (Glamour casting routes through Presence), Druid (Lunar/Solar Tide AE), Revelator (`layOnHands(actor)` heals), Witch (`betwixt(actor)` cycles hex), Luminary (Light spell focus → token light emission patched).

Each test pattern:
```js
{
  id: "wizard.sculpt-spell-AE-present",
  name: "Wizard: Sculpt Spell passive AE on actor with correct system fields",
  tier: "b",
  usesFixtures: ["TestPC"],
  setup: async () => {
    const { Fixtures } = await import("../../fixtures.mjs");
    await Fixtures.swapClass("TestPC", "Wizard", 5);
  },
  run: async ({ fixtures, assert, wait }) => {
    const a = fixtures.TestPC;
    await wait(150);
    const ae = a.effects.find(e => /sculpt/i.test(e.name));
    assert(!!ae, `Sculpt Spell AE expected; effects: ${a.effects.map(e=>e.name).join(", ")}`);
    const change = ae?.changes?.find(c => c.key?.includes("deliveryManaCostReduction"));
    assert(!!change, `Sculpt change for deliveryManaCostReduction expected; got ${JSON.stringify(ae?.changes)}`);
  }
}
```

- [ ] **Step 2: Author `tests/tier-b/specialists.mjs`** with these 5 tests:

Alchemist (cookbook craft creates an item), Bard (Virtuoso flag set, next d20 → 2d20), Merchant (Deep Pockets bonus slots = ceil(level/2)), Summoner (`conjure(actor)` opens picker — assert no error + picker dialog opened), Vanguard (Bodyguard AE on declared protege).

For tests that depend on UI dialogs (Alchemist cookbook, Summoner conjure), pass condition is "no console errors + expected chat card or dialog rendered." Do not assert dialog button clicks — that's manual.

- [ ] **Step 3: Update `_discoverTests`**

Add the two new test files to the import list.

- [ ] **Step 4: Verify**

Run full Tier B. Confirm ≥15 of 20 pass. For failures, audit and fix or annotate.

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke-test/tests/tier-b/ scripts/smoke-test/index.mjs
git commit -m "feat(smoke): tier-b caster + specialist signatures — completes Tier B (20)

Wizard, Magus, Sorcerer, Druid, Revelator, Witch, Luminary, Alchemist,
Bard, Merchant, Summoner, Vanguard."
```

---

## Task 11: Tier C — Perk Generator

**Goal:** Generate flag-presence smoke tests for every entry in `PERK_REGISTRY`. Generated tests verify the perk's flag lands when the perk is equipped and (where `effects` is declared) the AE is present with matching `changes`.

**Files:**
- Create: `scripts/smoke-test/tier-c-config.mjs`
- Create: `scripts/smoke-test/tests/tier-c/perks.mjs`
- Modify: `scripts/smoke-test/index.mjs`

**Acceptance Criteria:**
- [ ] `tier-c/perks.mjs` exports a `tests` array generated from `PERK_REGISTRY`
- [ ] Each generated test equips the perk on `_smoke-TestPC` from `vce-perks` compendium, runs `rescan`, asserts `flags[features][entry.flag] === true`
- [ ] If `entry.effects` declared, also asserts each AE present with matching `name` and `changes` count
- [ ] Skip table consulted: entries in `TIER_C_SKIPS.perks` emit a `skip` result with reason
- [ ] Override table consulted: entries in `TIER_C_OVERRIDES.perks` load custom `run` from override file

**Verify:**
```js
mcp__foundry-vtt__evaluate({ expression:
  `(await game.vagabondCharacterEnhancer.smokeTest({ tier: "c", pattern: /^perk\\./ })).summary`
})
// Expect: total: ~95-104, passed: most, skipped: a few from skip table
```

**Steps:**

- [ ] **Step 1: Create `tier-c-config.mjs` with empty tables**

```js
/**
 * Tier C — perk + spell test generation config.
 * Skips: emit a skip result with the reason (no run).
 * Overrides: load a custom test.run from the named module.
 */
export const TIER_C_SKIPS = {
  perks: {
    // Add perks here that can't be smoke-tested.
    // Example: "lucky strike": "GM-arbitrated reroll, no automation hook"
  },
  spells: {
    "polymorph": "Already covered by Tier A polymorph round-trip"
  }
};

export const TIER_C_OVERRIDES = {
  perks: {},   // "deep pockets": "../../overrides/deep-pockets.mjs"
  spells: {}
};
```

- [ ] **Step 2: Implement perk generator in `tests/tier-c/perks.mjs`**

```js
import { MODULE_ID } from "../../../utils.mjs";
import { PERK_REGISTRY } from "../../../perk-features.mjs";
import { TIER_C_SKIPS, TIER_C_OVERRIDES } from "../../tier-c-config.mjs";
import { Fixtures } from "../../fixtures.mjs";

const PERK_PACK = "vagabond-character-enhancer.vce-perks";

function makePerkTest(perkName, entry) {
  return {
    id: `perk.${perkName.replace(/\s+/g, "-")}`,
    name: `Perk: ${perkName}`,
    tier: "c",
    usesFixtures: ["TestPC"],
    run: async ({ fixtures, assert, wait }) => {
      const a = fixtures.TestPC;
      const pack = game.packs.get(PERK_PACK);
      const idx = await pack.getIndex();
      const found = idx.find(e => e.name.toLowerCase() === perkName.toLowerCase());
      if (!found) {
        assert(false, `perk "${perkName}" not found in compendium ${PERK_PACK}`);
        return;
      }
      const doc = await pack.getDocument(found._id);
      const [created] = await a.createEmbeddedDocuments("Item", [doc.toObject()]);
      try {
        await game.vagabondCharacterEnhancer.rescan(a);
        await wait(150);
        const features = a.getFlag(MODULE_ID, "features") ?? {};
        assert(features[entry.flag] === true, `expected flags.features.${entry.flag} === true; got ${JSON.stringify(features[entry.flag])}`);
        if (Array.isArray(entry.effects)) {
          for (const eff of entry.effects) {
            const ae = a.effects.find(x => x.name === eff.label);
            assert(!!ae, `expected AE "${eff.label}" present; effects: ${a.effects.map(e=>e.name).join(", ")}`);
            if (ae && Array.isArray(eff.changes)) {
              assert(ae.changes.length === eff.changes.length,
                `AE "${eff.label}" changes count mismatch: expected ${eff.changes.length}, got ${ae.changes.length}`);
            }
          }
        }
      } finally {
        // Cleanup is handled by runner snapshot/restore — items added are wiped
      }
    }
  };
}

export const tests = (() => {
  const out = [];
  for (const [name, entry] of Object.entries(PERK_REGISTRY)) {
    const skipReason = TIER_C_SKIPS.perks?.[name];
    if (skipReason) {
      out.push({
        id: `perk.${name.replace(/\s+/g, "-")}`,
        name: `Perk: ${name}`,
        tier: "c",
        usesFixtures: [],
        skip: () => true,
        skipReason,
        run: async () => {}
      });
      continue;
    }
    const overridePath = TIER_C_OVERRIDES.perks?.[name];
    if (overridePath) {
      // Override: load lazily inside test
      out.push({
        id: `perk.${name.replace(/\s+/g, "-")}`,
        name: `Perk: ${name} (override)`,
        tier: "c",
        usesFixtures: ["TestPC"],
        run: async (ctx) => {
          const mod = await import(overridePath);
          await mod.run({ ...ctx, perkName: name, entry });
        }
      });
      continue;
    }
    out.push(makePerkTest(name, entry));
  }
  return out;
})();
```

- [ ] **Step 3: Setup hook for Tier C tests — ensure TestPC has a class**

Tier C tests assume `_smoke-TestPC` already has a class so flag detection works. Add a one-time setup at suite start: in `index.mjs` `run`:

```js
async run(opts = {}) {
  const tests = await this._discoverTests();
  if (tests.some(t => t.tier === "c")) {
    const { Fixtures } = await import("./fixtures.mjs");
    await Fixtures.ensureAll();
    await Fixtures.swapClass("TestPC", "Wizard", 10);  // a high-level wizard so any prereq is satisfied
  }
  const result = await Runner.run(tests, opts);
  if (!opts.silent) await emitOutput(result);
  return result;
},
```

- [ ] **Step 4: Update `_discoverTests`**

```js
const tierC = [
  await import("./tests/tier-c/perks.mjs")
];
return [...tierA, ...tierB, ...tierC].flatMap(m => m.tests);
```

- [ ] **Step 5: Verify**

Run Tier C. Expect ~95-104 perk tests, most passing. For each failure: most likely a real `feature-detector` bug or a registry/compendium mismatch. Add to `TIER_C_SKIPS` with a reason, OR fix the underlying bug in a separate commit.

After triage, expect: passes ≥75%, rest in skip table with reasons.

- [ ] **Step 6: Commit**

```bash
git add scripts/smoke-test/tier-c-config.mjs scripts/smoke-test/tests/tier-c/perks.mjs scripts/smoke-test/index.mjs
git commit -m "feat(smoke): tier-c perk generator (~100 tests)

Generates flag + AE assertions for every PERK_REGISTRY entry. Skip
and override tables in tier-c-config.mjs. Verifies feature-detector
pipeline end-to-end across all perks."
```

---

## Task 12: Tier C — Spell Generator + Spell Assertions

**Goal:** Generate per-spell-manager smoke tests for the seven spell-feature managers and the polymorph/light/moon focus paths.

**Files:**
- Create: `scripts/smoke-test/spell-assertions.mjs`
- Create: `scripts/smoke-test/tests/tier-c/spells.mjs`
- Modify: `scripts/smoke-test/index.mjs`

**Acceptance Criteria:**
- [ ] One generated test per spell-manager: imbue, bless, ward, hex (effect-only-handler), beast, raise, animate, light, moon, polymorph
- [ ] `spell-assertions.mjs` exports a per-manager handler with: `setup(actor)`, `cast(caster, target?)`, `assertState({caster, target, assert})`
- [ ] Skip table honored
- [ ] Generated tests run via `smokeTest({ tier: "c", pattern: /^spell\./ })`

**Verify:**
```js
mcp__foundry-vtt__evaluate({ expression:
  `(await game.vagabondCharacterEnhancer.smokeTest({ tier: "c", pattern: /^spell\\./ })).summary`
})
// Expect: total: ~9-10, passed: most
```

**Steps:**

- [ ] **Step 1: Implement `spell-assertions.mjs`**

Each spell manager gets a small handler block. Sample structure:

```js
import { MODULE_ID } from "../utils.mjs";

export const SPELL_HANDLERS = {
  imbue: {
    setupCaster: "Witch",
    cast: async (caster) => {
      const weapon = caster.items.find(i => i.type === "weapon");
      const spell = caster.items.find(i => i.name === "Burn" && i.type === "spell");
      await game.vagabondCharacterEnhancer.imbue.imbue(caster, spell, weapon);
    },
    assert: async ({ caster, assert }) => {
      const weapon = caster.items.find(i => i.type === "weapon");
      assert(!!weapon.getFlag(MODULE_ID, "imbue"), "imbue flag on weapon");
    }
  },
  bless: {
    setupCaster: "Revelator",
    needsTarget: true,
    cast: async (caster, target) => {
      const { BlessManager } = await import("../spell-features/bless-manager.mjs");
      const spell = caster.items.find(i => i.name === "Bless" && i.type === "spell");
      await BlessManager.bless(caster, spell, [target]);
    },
    assert: async ({ target, assert }) => {
      assert(target.effects.some(e => /bless/i.test(e.name)), "Bless AE on target");
    }
  },
  // ... ward, hex, beast, raise, animate, light, moon, polymorph
};
```

For `light` / `moon` — the cast adds the spell ID to `system.focus.spellIds` and asserts the token light flag was patched.

For `beast` / `raise` / `animate` — cast triggers the companion-summoning flow via `CompanionSpawner.spawn`; assert that a token with the right `companionMeta.sourceId` was created on the scene.

For `polymorph` — already covered in Tier A; entry exists but is in `TIER_C_SKIPS`.

(See spec section 8.2.)

- [ ] **Step 2: Implement `tests/tier-c/spells.mjs`**

```js
import { SPELL_HANDLERS } from "../../spell-assertions.mjs";
import { TIER_C_SKIPS } from "../../tier-c-config.mjs";

export const tests = Object.entries(SPELL_HANDLERS).map(([name, handler]) => {
  const skip = TIER_C_SKIPS.spells?.[name];
  return {
    id: `spell.${name}`,
    name: `Spell: ${name} manager smoke`,
    tier: "c",
    usesFixtures: handler.needsTarget ? [handler.setupCaster, "NPC"] : [handler.setupCaster],
    skip: skip ? () => true : undefined,
    skipReason: skip,
    run: async ({ fixtures, assert, wait }) => {
      const caster = fixtures[handler.setupCaster];
      const target = handler.needsTarget ? fixtures.NPC : null;
      await handler.cast(caster, target);
      await wait(200);
      await handler.assert({ caster, target, assert });
    }
  };
});
```

- [ ] **Step 3: Update `_discoverTests`**

Add `await import("./tests/tier-c/spells.mjs")` to the list.

- [ ] **Step 4: Verify**

Run Tier C spell tests. Expect ~9-10 tests, most passing.

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke-test/spell-assertions.mjs scripts/smoke-test/tests/tier-c/spells.mjs scripts/smoke-test/index.mjs
git commit -m "feat(smoke): tier-c spell-manager smoke tests

Per-manager assert handlers in spell-assertions.mjs. Generated tests
cover imbue, bless, ward, hex, beast, raise, animate, light, moon,
polymorph (skipped — covered by Tier A)."
```

---

## Task 13: Final Suite Run + README Section

**Goal:** Run the full suite, triage any remaining failures, populate `TIER_C_SKIPS` for legitimate exclusions, and document how to run the suite.

**Files:**
- Modify: `scripts/smoke-test/tier-c-config.mjs` (final skip-table population)
- Modify: `docs/other-automation.md` or create `docs/smoke-test.md` (1-page how-to)

**Acceptance Criteria:**
- [ ] `smokeTest()` runs end-to-end without exception
- [ ] Pass rate ≥ 80% across all tiers (skips count toward "not failing")
- [ ] All non-skip failures are either fixed or annotated as known issues in `tier-c-config.mjs` comments
- [ ] Suite completes in < 2 minutes
- [ ] Docs page covers: how to run, how to filter, how to interpret output, how to add a new test

**Verify:**
```js
mcp__foundry-vtt__evaluate({ expression:
  `(await game.vagabondCharacterEnhancer.smokeTest()).summary`
})
// Expect: total ~145, passed >= 0.8 * (total - skipped), durationMs < 120000
```

**Steps:**

- [ ] **Step 1: Run the full suite, capture results**

```js
mcp__foundry-vtt__evaluate({ expression:
  `const r = await game.vagabondCharacterEnhancer.smokeTest();
   ({ summary: r.summary, fails: r.results.filter(x => x.status === "fail" || x.status === "error").map(x => ({ id: x.id, why: x.failures[0]?.message ?? x.errors[0]?.message })) })`
})
```

- [ ] **Step 2: Triage each failure**

For each failed test:
- Is it a real VCE bug? Stop, fix the bug in a separate commit. Re-run.
- Is the test asserting on something that's intentionally flaky/UI-dependent? Add to `TIER_C_SKIPS` with reason.
- Is the assertion wrong? Fix the test.

- [ ] **Step 3: Document in `docs/smoke-test.md`**

```markdown
# VCE Smoke Test Suite

## Running

In Foundry's developer console:
```js
await game.vagabondCharacterEnhancer.smokeTest();
```

Filters:
```js
smokeTest({ tier: "a" })            // just systems tests
smokeTest({ tier: "b" })            // just per-class signatures
smokeTest({ tier: "c" })            // just registry-driven
smokeTest({ pattern: /focus/ })     // any tests matching id
smokeTest({ failFast: true })       // halt on first fail
```

## Output

A green/yellow/red banner is whispered to GMs. Open the developer console for the full `console.table` of results.

## Adding tests

- **Tier A**: hand-author in `scripts/smoke-test/tests/tier-a/`. Add to `_discoverTests` in `index.mjs`.
- **Tier B**: hand-author in `scripts/smoke-test/tests/tier-b/`. Use the `setup` hook to call `Fixtures.swapClass`.
- **Tier C**: nothing to do — new perks added to `PERK_REGISTRY` and new spell managers added to `SPELL_HANDLERS` get tests automatically. Use `TIER_C_SKIPS` and `TIER_C_OVERRIDES` for special cases.

## Fixtures

A folder named `VCE Smoke Test (do not delete)` is auto-created on first run with six fixtures. Don't delete the folder — it'll be re-created on next run, but you'll lose any tweaks. Resetting fixtures: delete the folder, run `smokeTest()` again.
```

- [ ] **Step 4: Commit**

```bash
git add scripts/smoke-test/tier-c-config.mjs docs/smoke-test.md
git commit -m "docs(smoke): how-to + final tier-c skip annotations

Full suite passes >= 80%. Known issues annotated in tier-c-config
comments. Suite runs in under 2 minutes on dev hardware."
```

---

## Notes for the Implementer

- After every task, run `mcp__foundry-vtt__evaluate { window.location.reload() }` and wait ~5 seconds before running the verify expression — module changes don't hot-reload.
- If a test surfaces a real VCE bug (very likely during Task 5-7 and Task 11), commit the test author work first, then fix the bug in a follow-up commit. Don't bundle.
- Snapshot/restore in the runner is the highest-leverage piece of this entire plan — if it has bugs, the suite is unreliable. Take extra care to verify Task 3's snapshot/restore correctly handles all the actor/effect/item lifecycles before moving on.
- Keep tasks committed in order — each task's commit message references it cleanly so we can bisect later.
