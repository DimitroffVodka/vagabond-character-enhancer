# VCE Smoke Test Suite

Automated in-Foundry test harness covering focus, companion, polymorph, spell-manager, AE-distribution, and per-class hook paths. 235 tests across three tiers, runs in ~90 seconds.

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

## Drift canary

`tests/tier-a/system-contract.mjs` answers a different question from the rest of the
suite: not "does my feature behave correctly?" but "is the ground still there?".

VCE monkey-patches system methods and writes Active Effects at specific `system.*`
paths. Neither is a stable public API, and when the system renames one the failure is
**silent** — a patch installed on a method nobody calls, or an AE writing a field that
no longer exists, does nothing and throws nothing. Every other test can stay green
while half the module quietly stops working. That is the exact damage a big system
jump does, so it gets its own canary:

| Test | Asserts |
|---|---|
| `contract.patch-targets-still-exist` | every system method VCE **replaces** still resolves — both the import-reachable ones and those patched on classes resolved off `CONFIG` (the character data model, region movement-cost behaviour) |
| `contract.dependencies-still-exist` | every system method VCE **calls but does not patch** still resolves |
| `contract.crawler-spell-dialog-patch-target` | `CrawlerSpellDialog.prototype._cast` exists when the Crawler is active (skips otherwise) |
| `contract.ae-field-paths-still-resolve` | every `system.*` AE path resolves on a character or an NPC |
| `contract.declared-system-compat-is-current` | `module.json`'s verified system version tracks the installed one |

Patches and dependencies are listed **separately on purpose**: an earlier version
lumped them together and so overstated how many methods VCE actually patches.
Regenerate the patch list with a **class-agnostic** scan — the first version
grepped for known system class names and therefore missed every patch applied to
a class resolved at runtime, including `prepareDerivedData` on the character
data model.

The AE list is **derived** from the Active Effects catalog and the feature registries,
so new features are covered automatically; only the imperative paths (polymorph
overlay, undead template, aura buffs) are listed by hand, and that list can only
under-cover, never false-fail. The patch-target list is explicit — **add to it
whenever you add a monkey-patch**, or the canary silently guards less.

Run it alone after any system update:

```js
await game.vagabondCharacterEnhancer.smokeTest({ pattern: /^contract\./ });
```

## Expected result

A clean run is **green**: every test passes, with only the environmental skips below. There are no known-failing tests — any red is a real regression.

(This section previously documented `boot.feature-detector-runs-on-create` and `focus.berserk-drops-all-focus` as intentionally-failing signal tests. Both pass now; the underlying bugs were fixed.)

## Known skips

Three tests skip on a normal run. None indicate a defect — each is gated on a setting or a fixture the builder doesn't produce:

| Test | Why it skips | To un-skip |
|---|---|---|
| `encumbrance.over-capacity-applies-encumbered` | `homebrewEncumbranceSpeedPenalty` setting is OFF | Turn the setting on |
| `vanguard.indestructible-cancels-melee-damage` | Unconditional `skip: () => true` — needs an equipped-armor fixture for `system.armor >= 1`, which is derived and not directly writable | Build an armour fixture, then drop the skip |
| `perk.primordial-summoner` | Perk is in `PERK_REGISTRY` but missing from the `vagabond.perks` system compendium (v5.3.0) | Remove from `TIER_C_SKIPS.perks` once the system ships it |

> **Equipping fixture gear:** `system.equipped` is *derived*
> (`equipped = equipmentState !== "unequipped"`), so writing it is silently
> discarded. Declare `equipped: true` in the fixture def and let
> `Fixtures._equipmentStateFor` translate it to `equipmentState`.

Separately, `spell.polymorph` is listed in `TIER_C_SKIPS.spells` and is therefore **never generated** — it doesn't appear as a skipped row at all. It's redundant with the Tier A polymorph round-trip test.

Note that a Tier C skip for a *perk* still emits a row with `status: "skip"`, whereas a skip for a *spell* suppresses generation entirely. That asymmetry is why the counts don't line up with the config at a glance.

### Monk and Summoner are no longer gaps

This section used to list the Monk and Summoner class tests as skipped for missing compendium content. They aren't. Both are still absent from the system's `vagabond.classes` pack (18 entries), but VCE now ships its own `vce-classes` pack (Dragoon, Summoner, Samurai, Jester, Psychic, Monk), so `Fixtures.swapClass` resolves them and `monk.empowered-strikes-die-bonus`, `monk.martial-arts-flag` and `summoner.arcanum-flag` all pass.

One leftover: `summoner.conjure-api-callable` in `tests/tier-b/specialists.mjs` still carries a comment saying `swapClass` will silently fail for Summoner, and asserts only the API surface. The test passes, but that comment is stale and the flag assertion it forgoes could now be restored.

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
