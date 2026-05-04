# VCE Smoke Test Suite

Automated in-Foundry test harness covering focus, companion, polymorph, spell-manager, AE-distribution, and per-class hook paths. ~157 tests across three tiers, runs in ~2-3 minutes.

## Running

In Foundry's developer console (or via the foundry-mcp-bridge `evaluate` tool):

```js
await game.vagabondCharacterEnhancer.smokeTest();
```

You'll see:
- `console.table` of every test row (id, status, duration, failure/error/console-error counts)
- A GM-whispered ChatMessage with a colored banner: green (all pass), yellow (passes with skips), red (failures)

## Filters

```js
smokeTest({ tier: "a" })            // just hand-authored systems tests (~25)
smokeTest({ tier: "b" })            // just per-class signatures (~19)
smokeTest({ tier: "c" })            // just registry-driven generated tests (~113)
smokeTest({ pattern: /focus/ })     // any test whose id matches the regex
smokeTest({ failFast: true })       // halt on first failure
smokeTest({ silent: true })         // no console output, no chat banner
```

## Tiers

- **Tier A (~25)** — Hand-authored tests for the fragile, recently-fixed systems. Real assertions on flag/AE/chat state. Files at `scripts/smoke-test/tests/tier-a/`.
- **Tier B (~19)** — Hand-authored, one signature feature per class. Files at `scripts/smoke-test/tests/tier-b/`.
- **Tier C (~113)** — Auto-generated from `PERK_REGISTRY` and per-spell-manager handlers. New perks added to the registry get tests for free.

## Fixtures

Six fixture actors auto-create on first run in a folder named `VCE Smoke Test (do not delete)`:
- `_smoke-Generic` (Fighter L5)
- `_smoke-Druid` (Druid L5)
- `_smoke-Revelator` (Revelator L5)
- `_smoke-Witch` (Witch L5)
- `_smoke-NPC` (low-HP target)
- `_smoke-TestPC` (class-swappable for Tier B/C)

The fixture builder is idempotent — re-runs heal drift. To reset fixtures completely, delete the folder and run the suite again.

## Known signal failures

Two tests are currently failing because they correctly detect real bugs in VCE that should be fixed:

1. **`boot.feature-detector-runs-on-create`** — Creating an actor and adding a class item doesn't auto-populate feature flags. The `createItem` hook appears to fire before the item is fully committed to the actor's items collection. Workaround: callers can run `api.rescan(actor)` after item creation.

2. **`focus.berserk-drops-all-focus`** — Applying the berserk status leaves 1 focus slot still active instead of clearing all focus. The drop logic likely processes per-entry rather than as a whole.

These tests are intentionally left failing so the red banner is visible until they're fixed.

## Known infrastructure gaps (skip list)

Some tests are skipped because the underlying compendium content is incomplete:

- `perk.primordial-summoner` — Perk is in `PERK_REGISTRY` but missing from `vagabond.perks` system compendium (v5.3.0).
- `spell.polymorph` — Already covered by the Tier A polymorph round-trip test; second test would be redundant.
- Monk class signature test — Monk is missing from `vagabond.classes` system compendium (v5.3.0). Substituted with Vanguard.
- Summoner class flag check — Summoner is missing from `vagabond.classes` compendium. Test asserts API surface only.

When the compendiums are updated, remove the corresponding skips from `scripts/smoke-test/tier-c-config.mjs` and substitute the originally-intended class in the Tier B martial test file.

## Adding tests

- **Tier A**: hand-author in `scripts/smoke-test/tests/tier-a/`. Add the new file's import to `_discoverTests` in `scripts/smoke-test/index.mjs`.
- **Tier B**: hand-author in `scripts/smoke-test/tests/tier-b/`. Use the `setup` hook to call `Fixtures.swapClass`.
- **Tier C**: nothing to do for new perks — they're picked up from `PERK_REGISTRY` automatically. New spell managers: add an entry to `SPELL_HANDLERS` in `scripts/smoke-test/spell-assertions.mjs`. Use `TIER_C_SKIPS` and `TIER_C_OVERRIDES` for special cases.

## Test definition shape

```js
{
  id: "focus.acquire-and-release",
  name: "Human-readable name",
  tier: "a" | "b" | "c",
  usesFixtures: ["Generic"],   // declared so runner can snapshot/restore
  skip: () => false,           // optional predicate
  setup: async ({ fixtures }) => {},   // optional pre-run hook
  failOnConsoleError: false,   // optional, defaults false
  run: async ({ fixtures, assert, wait, chatTail, consoleErrors }) => {
    // assert(condition, message) collects failures, doesn't throw
  }
}
```

The runner injects:
- `fixtures` — only the actors declared in `usesFixtures`
- `assert(condition, message)` — collects failures (multiple per test allowed)
- `wait(ms)` — promise wrapper
- `chatTail()` — chat messages created during the test
- `consoleErrors()` — console errors captured during the test
