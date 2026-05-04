# VCE Smoke Test Harness — Design

**Status:** Draft for review
**Date:** 2026-05-03
**Owner:** FlimtotheFlam
**Goal:** Pre-release confidence that VCE's runtime systems work end-to-end. Catch regressions in focus, companions, polymorph, spell managers, AE distribution, and per-class hooks before shipping.

---

## 1. Motivation

VCE is a large module (~20 classes, 7 ancestries, 104 perks, 59 spells, plus companion/focus/polymorph/alchemy/brawl/imbue/ward/aura systems). It wraps system-side methods on `SpellHandler`, `VagabondItem`, `VagabondDamageHelper`, plus dozens of `Hooks.on(...)` listeners. Static review can't catch interaction bugs — they only show up at runtime.

Recent bug history shows the failure mode: a stale `focus.spellIds` ID lingers because there was no cleanup hook, and the FX is stuck on a token with no UI to remove it. The bug existed for an unknown amount of time before a player surfaced it. A smoke test would have caught this on day one.

We need a fast, automated harness that runs before each release and proves the module's hooks fire, AEs land, flags persist, and chat cards render without throwing.

## 2. Scope

**In scope**
- Tier A: ~25 hand-authored tests for fragile/recently-fixed systems
- Tier B: ~20 hand-authored tests, one signature feature per class
- Tier C: ~55-65 auto-generated tests driven by `PERK_REGISTRY` and spell-feature managers
- In-Foundry execution via `game.vagabondCharacterEnhancer.smokeTest()`
- Console + chat output with pass/fail summary
- Per-test fixture isolation via snapshot/restore

**Out of scope**
- UI/visual assertions (chat card colors, sheet panel layout) — manual review
- Multi-client sync tests (GM ↔ player race conditions) — different harness
- Load/perf tests — separate concern
- CI integration — local-only for v1
- Hand-authored per-perk and per-spell tests beyond Tier A/B — Tier C covers breadth via generation

## 3. Architecture

### 3.1 File Layout

```
scripts/smoke-test/
  index.mjs              — barrel export, registers game.vagabondCharacterEnhancer.smokeTest
  runner.mjs             — orchestrator: discovers tests, runs sequentially, reports
  fixtures.mjs           — creates/finds the "VCE Smoke Test" actor folder + fixtures
  fixture-defs.mjs       — fixture specs (which class, level, items, spells)
  assertions.mjs         — assert helpers: assertFlag, assertAEPresent, assertChatContains
  console-watcher.mjs    — captures errors/warnings during a test, attaches to result
  spell-assertions.mjs   — per-spell-manager assertion handlers used by Tier C
  tier-c-config.mjs      — TIER_C_SKIPS and TIER_C_OVERRIDES tables
  tests/
    tier-a/
      boot.mjs
      focus.mjs
      companion.mjs
      spells.mjs
      aura-polymorph-brawl.mjs
      detection-ae.mjs
      encumbrance-fx.mjs
    tier-b/
      one file per class — alchemist.mjs, barbarian.mjs, ... wizard.mjs
    tier-c/
      perks.mjs          — generator: reads PERK_REGISTRY, emits tests
      spells.mjs         — generator: reads spell-feature managers, emits tests
  overrides/
    deep-pockets.mjs     — example: per-perk override
    imbue-spell.mjs      — example: per-spell override
```

### 3.2 Runner Behavior

- Sequential execution (Foundry mutations race in parallel).
- Each test wrapped in try/catch — exceptions become `error` results, suite continues.
- Per-test lifecycle:
  1. `beforeEach`: snapshot fixture state for `usesFixtures` (HP, focus.spellIds, statuses, all VCE flags, items by ID)
  2. Snapshot `console.error` count via `console-watcher`
  3. Snapshot `messages.size` for chat-tail capture
  4. `run({ fixtures, assert, wait, chatTail, consoleErrors })`
  5. `afterEach`: restore fixture snapshots, delete added items/AEs, clear created chat messages
- Tier order: A → B → C. Failures don't halt the suite.
- Filter API: `smokeTest({ tier, pattern, fixtureFilter, failFast })`.

### 3.3 Invocation

```js
// Run all tiers
game.vagabondCharacterEnhancer.smokeTest()

// Filter
game.vagabondCharacterEnhancer.smokeTest({ tier: "a" })
game.vagabondCharacterEnhancer.smokeTest({ pattern: /focus/ })

// Halt on first failure (dev mode)
game.vagabondCharacterEnhancer.smokeTest({ failFast: true })
```

### 3.4 Output

- **Console**: `console.table` of every test with `id`, `name`, `tier`, `status`, `durationMs`, first failure reason.
- **Chat**: GM-only `ChatMessage` with summary banner (✓ N passed / ✗ N failed) and a collapsible list of failures (test name + reason). Red banner on any fail, green on all-pass. Yellow banner if any tests skipped due to missing deps.
- **Console errors during a test**: attached to the test result, do not auto-fail unless test opts in via `failOnConsoleError: true`.

## 4. Fixture System

### 4.1 Fixtures

Six actors in a folder named `VCE Smoke Test (do not delete)`:

| Fixture | Class / Type | Purpose |
|---|---|---|
| `_smoke-Generic` | Fighter L5, Human, mid stats | Default character — focus, status, brawl, AE detection, range validator |
| `_smoke-Druid` | Druid L5, Human | Polymorph, Beast Form panel |
| `_smoke-Revelator` | Revelator L5, Human | Aura system, Paragon's Aura, lay on hands |
| `_smoke-Witch` | Witch L5, Human | Spell systems (imbue, bless, ward, hex), familiar |
| `_smoke-NPC` | NPC, low HP | Target for attacks, saves, companion termination |
| `_smoke-TestPC` | Generic Human L5, no class | Class-swap target for Tier B and Tier C |

### 4.2 Fixture Builder

- On first suite run, runner checks for the folder — creates if missing.
- Runner iterates `FIXTURE_DEFS` in `fixture-defs.mjs` — each def declares: name, type, class (compendium ID), level, perks, items, spells, stat overrides.
- For each def: find or create the actor, diff against spec, patch deltas (rename-safe).
- Equipment and spells imported from VCE compendiums by name.

### 4.3 Per-Test Isolation

- Test declares `usesFixtures: ["Witch", "NPC"]`.
- `beforeEach`: snapshot HP, focus.spellIds, statuses, all `flags[MODULE_ID]`, and embedded item IDs.
- `afterEach`: `actor.update()` to restore primitive fields; delete any items/AEs created during the test that weren't in the snapshot; clear any chat messages created during the test (snapshot `messages.size` at start, delete additions).
- Snapshot/restore costs ~50ms vs ~2s for full recreation; suite stays fast.

### 4.4 Class Swap (Tier B / C)

For tests that declare `class: "barbarian"` (or similar):

1. Delete existing class items from `_smoke-TestPC`.
2. Import the named class item from `vce-classes` compendium at declared level.
3. Run `feature-detector.rescan(actor)` to populate flags + managed AEs.
4. After test: snapshot/restore wipes everything.

Class swap costs ~500ms per test. Acceptable given Tier B+C tests are most of the suite (~80 tests × 500ms = 40s overhead).

## 5. Test Definition Format

```js
// scripts/smoke-test/tests/tier-a/focus.mjs
export const tests = [
  {
    id: "focus.acquire-feature-focus",
    name: "FocusManager.acquireFeatureFocus adds entry + plays FX",
    tier: "a",
    usesFixtures: ["Generic"],
    skip: () => typeof Sequencer === "undefined",
    run: async ({ fixtures, assert }) => {
      const a = fixtures.Generic;
      const FM = game.vagabondCharacterEnhancer.focus;
      const ok = await FM.acquireFeatureFocus(a, "smoke_test", "Smoke Test");
      assert(ok === true, "acquire returned true");
      assert(FM.hasFeatureFocus(a, "smoke_test"), "feature focus flag set");
      assert(FM.getTotalFocusCount(a) === 1, "total count is 1");
    },
  },
];
```

### 5.1 Run Context

- `fixtures` — map of fixture-name → live `Actor`, only the ones declared in `usesFixtures`
- `assert(condition, message)` — collects failures, doesn't throw mid-test (multiple failures per test reported)
- `wait(ms)` — `setTimeout` promise wrapper for hook-settling delays
- `chatTail()` — chat messages created since test start
- `consoleErrors()` — console errors captured during test

### 5.2 Result Shape

```js
{
  id, name, tier,
  status: "pass" | "fail" | "skip" | "error",
  durationMs,
  failures: [{ message, ... }],   // assertion failures
  errors: [{ message, stack }],   // exceptions thrown
  consoleErrors: [{ message, level }]
}
```

## 6. Tier A — Systems Tests (~25)

The fragile, recently-fixed systems. Hand-authored, real assertions.

**Module bootstrap (3)**
1. `boot.no-console-errors-on-load`
2. `boot.api-surface-present`
3. `boot.feature-detector-runs-on-create`

**Focus (4)**
4. `focus.acquire-and-release`
5. `focus.cap-enforced`
6. `focus.stale-spellid-deleteItem-hook`
7. `focus.berserk-drops-all-focus`

**Companion (4)**
8. `companion.spawn-via-CompanionSpawner`
9. `companion.dismiss-clears-flags-and-token`
10. `companion.zero-hp-auto-terminates`
11. `companion.save-routing-uses-controller-stats`

**Spell systems (5)**
12. `imbue.attaches-to-weapon`
13. `imbue.detaches-on-focus-drop`
14. `bless.applies-AE-to-target`
15. `ward.absorbs-damage-non-lethal-cap`
16. `hex.applies-hexed-status-and-clears-on-betwixt`

**Aura / Polymorph / Brawl (4)**
17. `aura.template-follows-token`
18. `polymorph.druid-becomes-beast-and-reverts`
19. `polymorph.spell-focus-cleared-on-revert`
20. `brawl.grapple-intent-applies-grapple-status`

**Detection / AE (3)**
21. `feature-detector.adds-managed-AE`
22. `feature-detector.removes-AE-when-class-removed`
23. `range-validator.hinders-out-of-range-attack`

**Encumbrance / FX (2)**
24. `encumbrance.over-capacity-applies-encumbered`
25. `feature-fx.config-roundtrip`

## 7. Tier B — Class Signature Tests (~20)

One canonical feature per class. Each test uses `_smoke-TestPC` with class swapped in.

| # | Class | Signature feature tested |
|---|---|---|
| 1 | Alchemist | Cookbook crafts a concoction → item created on PC |
| 2 | Barbarian | Auto-Berserk on HP threshold → status applies, focus dropped |
| 3 | Bard | `virtuoso(actor)` → flag set, next check rolls 2d20 |
| 4 | Dancer | `stepUp(actor)` → flag, applied to next attack |
| 5 | Druid | Lunar/Solar Tide AE applies based on time-of-day flag |
| 6 | Fighter | Momentum stack increments on hit, button injected on chat card |
| 7 | Gunslinger | Trick Shot intent dialog routes through `rollAttack` patch |
| 8 | Hunter | `hunterMark(actor, target)` → flag on target, favor on attacks |
| 9 | Luminary | `_focus` of Light spell → token light emission patched |
| 10 | Magus | Imbue weapon flag landed via Magus path |
| 11 | Merchant | Deep Pockets bonus slots = `ceil(level/2)` |
| 12 | Monk | Unarmed attack uses Monk damage die scaling |
| 13 | Pugilist | Haymaker bonus damage applied to brawl attack |
| 14 | Revelator | `layOnHands(actor)` heals + consumes resource |
| 15 | Rogue | Sneak attack bonus damage when target is vulnerable |
| 16 | Sorcerer | Glamour casting routes through Presence/Influence |
| 17 | Summoner | `conjure(actor)` opens picker, spawns NPC with summoner companionMeta |
| 18 | Vanguard | Defender/Bodyguard mark feature applies AE |
| 19 | Witch | `betwixt(actor)` cycles hex targets |
| 20 | Wizard | Sculpt Spell — passive AE present on actor + correct system fields |

For tests where deeper assertions are hard (Trick Shot dialog, Alchemy UI clicks): pass = trigger doesn't throw + console errors stay at zero + expected chat card posts.

## 8. Tier C — Registry-Driven Auto-Generation (~55-65)

### 8.1 Perk Generator

For each `PERK_REGISTRY` entry with `status: "module"` or `"partial"`:

1. Setup `_smoke-TestPC`, equip perk from `vce-perks` compendium.
2. Assert `actor.getFlag(MODULE_ID, "features")[entry.flag] === true` after `feature-detector.rescan()`.
3. If `entry.effects` declared: assert each AE present with matching `changes` array.
4. Trigger probe (best-effort): if perk hooks attack/save/cast, fire one such roll and assert zero console errors. Skip if purely passive.
5. Cleanup: snapshot/restore.

### 8.2 Spell Generator

For each spell-feature manager — confirmed list from `scripts/spell-features/`: `imbue-manager`, `bless-manager`, `ward-manager`, `effect-only-handler` (covers Hex and other effect-only spells), `beast-spell`, `raise-spell`, `animate-spell`. Plus polymorph from `scripts/polymorph/`. Plus light/moon focus emission from `focus-manager._syncLightFocus`. (~10 manager-driven test groups total.)

1. Setup `_smoke-TestPC` equipped with spell; for target spells, `_smoke-NPC` as target.
2. Cast probe via the manager's primary entry.
3. Per-manager assertion handler from `spell-assertions.mjs` (~15 lines per manager).
4. Cleanup: drop focus / dismiss / restore.

### 8.3 Skip + Override Tables

```js
// scripts/smoke-test/tier-c-config.mjs
export const TIER_C_SKIPS = {
  perks: {
    "lucky-strike": "GM-arbitrated, no automation hooks",
    "iron-stomach": "Pure flavor flag, no observable side-effect",
  },
  spells: {
    "polymorph": "Already covered by Tier A polymorph test",
  },
};

export const TIER_C_OVERRIDES = {
  perks: {
    "deep-pockets": "scripts/smoke-test/overrides/deep-pockets.mjs",
  },
  spells: {
    "imbue": "scripts/smoke-test/overrides/imbue-spell.mjs",
  },
};
```

Generated test consults skip table → emits `skip` result with reason. Override table → loads custom `run`. Otherwise default generator.

### 8.4 Probe-Doesn't-Fail Philosophy

Tier C is shallow on purpose. A perk like "Quick Reflexes" needs only:
- Flag landed
- AE present with correct `changes`
- Triggering Reflex save doesn't throw

Arithmetic correctness (does `+1` actually apply?) is for hand-authored Tier A or Tier B tests. Tier C catches regressions in the registry-AE pipeline, not rules math.

### 8.5 Ongoing Maintenance

- New perk added to `PERK_REGISTRY`: gets a Tier C test for free.
- New spell manager: requires one ~15-line entry in `spell-assertions.mjs` plus the manager hook itself.
- Override or skip needed: edit `tier-c-config.mjs` only.

## 9. Failure Modes and Output

### 9.1 Result Status Definitions

- **pass**: zero `assert` failures, zero exceptions, zero console errors (or `failOnConsoleError` not set).
- **fail**: at least one `assert` failure.
- **error**: exception thrown from `run`.
- **skip**: `skip()` predicate returned true, or test in skip table.

### 9.2 Suite-Level Output

```
=== VCE Smoke Test ===
Tier A:  ✓ 25 / 25
Tier B:  ✓ 18 / 20  (✗ 2)
Tier C:  ✓ 55 / 60  (✗ 3, skip 2)
─────────────────────
Total:   ✓ 98 / 105 (✗ 5, skip 2)  in 47s

Failures:
  ✗ tier-b.bard.virtuoso-favor: expected favor flag set, got undefined
  ✗ tier-c.perk.swift-strike: AE 'Swift Strike' not found on actor
  ...
```

Console table includes all 105 rows. Chat banner shows summary; collapsible section lists failures.

### 9.3 Slow Test Warning

If a single test takes > 5000ms, runner logs a `console.warn` with the test ID. Doesn't fail — just flags.

## 10. Build / Release Notes

- Harness ships with the module. Code size is small (~tens of KB). Useful for end-user bug repros: "Run `game.vagabondCharacterEnhancer.smokeTest()` and paste the output."
- Fixtures auto-create only when the suite runs. They do not appear on module load — players who never run the suite never see the folder.
- `build-zip.ps1` does not exclude `scripts/smoke-test/`; it ships as part of the module.

## 11. Implementation Phases

Suggested build order, each phase shippable on its own:

**Phase 1 — Skeleton + Tier A** (target: half-day)
- runner, fixtures, assertions, console-watcher
- 25 hand-authored Tier A tests
- Console + chat output
- Validates the harness architecture before scaling

**Phase 2 — Tier B** (target: half-day)
- Class-swap mechanics in runner
- 20 hand-authored class signature tests

**Phase 3 — Tier C** (target: half-day)
- Perk generator (reads `PERK_REGISTRY`)
- Spell generator + `spell-assertions.mjs` per manager
- Skip/override tables
- ~55-65 generated tests

**Phase 4 — Polish** (optional)
- Module Settings button to launch suite
- Re-run-failed-only filter
- Per-tier timing budgets

## 12. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Fixture corruption breaks all tests | Fixture builder is idempotent — re-runs heal drift. Manual recovery: delete folder, re-run. |
| Async hook race makes a test flaky | `wait(ms)` helper for hook-settling. If still flaky, mark `flaky: true` → runner retries once before failing. |
| New Vagabond system version breaks fixture imports | Fixture builder logs missing compendium entries with names — easy to identify what to update. |
| Tier C generator produces a test for a perk that's intentionally GM-only | Add to `TIER_C_SKIPS` with reason. |
| Suite gets slow as it grows | Tier filter for dev re-runs; per-tier timings logged. If full suite > 2min, revisit isolation strategy. |
| Tests rot when class registries change | Fixture builder + `feature-detector.rescan()` handle most of this. Tier B class tests pin specific feature names — those must be updated when renaming features (rare). |

## 13. Open Questions

None blocking — design is ready for implementation planning.

---
