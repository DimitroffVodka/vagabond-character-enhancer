# Smoke Test Audit (2026-05-13)

**Updated 2026-05-13 (later pass): post-Phases 2-5 + audit upgrade pass.**
Suite size grew from 58 → 227 tests; behavioral coverage went from 47% to
**~92%** (208 🟢 / 6 🟡 / 8 🔴 / 5 skip in the final count).

Categorizing the existing 44 tests + the 14 tests I added today by what they
actually verify. Each test gets a label:

- **🟢 BEHAVIORAL** — exercises the feature end-to-end and asserts on observable
  outcomes (damage values, HP changes, status applied, token state, etc.).
  These are the tests that catch real bugs.
- **🟡 MIXED** — partially behavioral. Verifies state after a setup step
  (e.g., "flag was set after class swap") but doesn't drive the actual feature
  through its user-facing path.
- **🔴 STRUCTURAL** — only asserts that an API exists, a flag is set, a
  function doesn't throw, or "no console errors." These look productive but
  almost never catch bugs because they don't model how a user would use
  the feature.

When a test fails on a real bug, it's almost always because a behavioral
assertion broke. Today's bug parade (Exalt-on-spells, disposition filter,
buff stacking, DialogV2 click, cleanup orphans) was missed by the prior
shallow harness because every relevant existing test was structural.

---

## Tier A (existing — 25 tests)

### boot.mjs (3)
| Test | Label | Notes |
|---|---|---|
| `boot.no-console-errors-recent` | 🔴 | "No errors" is necessary but not sufficient |
| `boot.api-surface-present` | 🔴 | Asserts keys exist on `game.vagabondCharacterEnhancer` |
| `boot.feature-detector-runs-on-create` | 🟡 | Creates an actor and checks feature flags — proves detection runs but not that the features behave |

### focus.mjs (4) — strongest existing file
| Test | Label | Notes |
|---|---|---|
| `focus.acquire-and-release` | 🟢 | Round-trips state through public API |
| `focus.cap-enforced` | 🟢 | Asserts the cap actually blocks |
| `focus.stale-spellid-deleteItem-hook` | 🟢 | Side-effect of delete is verified |
| `focus.berserk-drops-all-focus` | 🟢 | Cross-feature: status + focus interaction |

### companion.mjs (4) — also strong
| Test | Label | Notes |
|---|---|---|
| `companion.spawn-via-CompanionSpawner` | 🟢 | Spawns + verifies actor + flag |
| `companion.dismiss-clears-token` | 🟢 | Dismiss path proven end-to-end |
| `companion.zero-hp-auto-terminates` | 🟢 | Cross-feature trigger |
| `companion.controllerActorId-flag-set` | 🟢 | Verifies routing-critical flag |

### spells.mjs (5)
| Test | Label | Notes |
|---|---|---|
| `imbue.attaches-to-weapon` | 🟢 | Verifies flag on wielder |
| `imbue.detaches-on-clear` | 🟢 | Cleanup path verified |
| `bless.internal-apply-adds-AE` | 🟡 | Calls `_applyBlessAllies` directly — bypasses cast flow + targeting + region path |
| `ward.method-is-callable` | 🔴 | "Methods exist" — no actual ward applied or damage tested |
| `hex.applies-and-clears` | 🟢 | Apply + clear round-trip |

### aura-polymorph-brawl.mjs (4)
| Test | Label | Notes |
|---|---|---|
| `aura.template-follows-token` | 🟡 | Verifies `activeAura` flag is set after `activate()` — does NOT verify buff propagation, region attachment, hostile blocking, or cleanup. This was the canonical example of "looks like an aura test but isn't." Today's new `aura-buff-propagation.mjs` fills these gaps. |
| `polymorph.druid-becomes-and-reverts` | 🟢 | Form swap + revert with flag check |
| `polymorph.spellids-array-survives-roundtrip` | 🟢 | State preservation across transform |
| `brawl.grapple-intent-api-surface` | 🔴 | "API object accessible" — no grapple/shove actually executed |

### detection-ae.mjs (3)
| Test | Label | Notes |
|---|---|---|
| `feature-detector.adds-managed-AE` | 🟢 | Add class → verify AE materializes |
| `feature-detector.removes-AE-when-class-removed` | 🟢 | Remove class → verify cleanup |
| `range-validator.no-error-on-out-of-range` | 🔴 | "Doesn't throw" — doesn't verify the rejection actually fires |

### encumbrance-fx.mjs (2)
| Test | Label | Notes |
|---|---|---|
| `encumbrance.over-capacity-applies-encumbered` | 🟢 | Set inventory over cap, verify status |
| `feature-fx.config-roundtrip` | 🟢 | Settings roundtrip |

---

## Tier B (existing — 19 tests)

Tier B is dominated by "flag set after class swap" tests. These verify that
the feature detector recognizes a class, **not** that the class's features
work. They will not catch a Rage that fails to apply DR, a Hunter's Mark that
fails to mark, or a Sorcerer crit threshold that doesn't lower. Most could be
upgraded to 🟢 with one or two extra assertions exercising the feature.

| Test | Label | Notes |
|---|---|---|
| `wizard.page-master-flag` | 🔴 | Doesn't test Sculpt Spell or Manifold Mind effect |
| `magus.flag-set` | 🔴 | Doesn't test Spellstrike behavior |
| `sorcerer.flag-set` | 🟡 | Checks Spell-Slinger AE exists — but doesn't verify the cast crit threshold actually drops |
| `druid.flag-set` | 🔴 | No polymorph or savagery behavior tested |
| `revelator.layonhands-api-callable` | 🔴 | "API exists" + flag — doesn't call Lay on Hands or verify HP transfer |
| `witch.betwixt-api-callable` | 🔴 | "API exists" + flag — no actual betwixt |
| `luminary.flag-set` | 🔴 | No solar flare or healing tested |
| `barbarian.rage-flag-set-on-class` | 🟡 | Verifies Rage AE present — but doesn't trigger berserk or verify DR applied |
| `fighter.momentum-flag-set` | 🔴 | No momentum stacking/consumption tested |
| `vanguard.flag-and-wall-ae` | 🟡 | Wall AE present — Indestructible not tested |
| `pugilist.haymaker-flag` | 🔴 | No haymaker dice escalation tested |
| `rogue.sneak-attack-flag` | 🔴 | No sneak attack d4 injection tested |
| `gunslinger.flag-set` | 🔴 | No akimbo / steady aim behavior |
| `hunter.huntermark-api-callable` | 🔴 | API exists — mark not actually applied |
| `dancer.stepup-api-callable` | 🟡 | API exists + Fleet of Foot AE — no step-up execution |
| `alchemist.cookbook-api-callable` | 🔴 | API exists — no crafting flow |
| `bard.virtuoso-api-callable` | 🔴 | API exists — no favor injection on roll |
| `merchant.deep-pockets-bonus-slots` | 🟡 | bonusSlots > 0 — no actual inventory overflow tested |
| `summoner.conjure-api-callable` | 🔴 | API exists — no conjure flow |

---

## Tier C (existing — 0 tests)

Both files are empty placeholders:
- `tests/tier-c/perks.mjs` — 0 tests
- `tests/tier-c/spells.mjs` — 0 tests

Perks tests get cited by the orchestrator (`tests.some(t => t.tier === "c")`)
but never had any.

---

## Tests added today (Phase 1, v0.5.0 behavioral) — 14 tests

### catalog-integrity.mjs (3) — all 🟢
- Catalog UUID resolution
- `cloneFor()` strips fields that v14 silently rejects
- Cloned AE actually embeds (proves the silent-fail trap is closed)

### aura-buff-propagation.mjs (6) — all 🟢
- Bless propagation (caster + ally + hostile-blocked)
- Ward propagation
- Exalt propagation
- Bless no-double-stack (region + legacy paths don't both fire)
- Cancel sweeps regions + AEs (no orphans)
- Exalt writes `system.bonusPerDamageDie` + `bonusPerDamageDieDoubleVsBeingTypes`

### exalt-damage.mjs (6) — all 🟢
- Weapon damage gets +1 per die
- Spell damage gets +1 per die (via `rollSpellDamage` path)
- Doubling vs Undead target → +2 per die
- No-doubling vs non-Undead target → stays +1
- Multi-die formula counts both dice (Strike-relic regression guard)
- Bonus persists on critical-hit rolls

### dialog-v2.mjs (2) — all 🟢
- Draconic Resilience picker: button-click fires + flag persists
- Imbue weapon picker: click registers (skips if fixture lacks ≥2 equipped weapons)

---

## Score totals

| Category | Tier A existing | Tier B existing | Tier A new (today) | Total |
|---|---|---|---|---|
| 🟢 Behavioral | 13 | 0 | 14 | **27** |
| 🟡 Mixed | 4 | 5 | 0 | **9** |
| 🔴 Structural | 8 | 14 | 0 | **22** |

Before today: **13 / 44 (30%)** were truly behavioral. After today: **27 / 58 (47%)**.

---

## Recommended next-pass replacements (Phase 2 — class features, ~30 tests)

The Tier B "flag-set" tests can almost all be upgraded by adding one assertion
that exercises the feature. Suggested upgrades, ordered by user-visible impact:

1. **Barbarian Rage** — apply berserk status, attack, verify damage die size
   bumped + DR applied.
2. **Sorcerer Spell-Slinger** — assert `system.castCritBonus` is -1 (crit on 19+)
   AND that spell roll honors it.
3. **Wizard Manifold Mind / Sculpt Spell** — verify `focus.maxBonus` accumulates;
   for Sculpt verify mana cost reduction.
4. **Revelator Lay on Hands** — call API, verify caster HP debit + target HP gain.
5. **Witch Hex** — apply via API, verify hexed status + (eventually) crit bonus.
6. **Druid Polymorph** — full transform flow incl. spell preservation across
   transform (already partially covered — extend).
7. **Hunter's Mark** — call API, verify mark AE on target.
8. **Bard Virtuoso** — trigger via Inspiration AE, verify favor injected on the
   next save roll for an ally.
9. **Dancer Step Up** — invoke step-up, verify Reflex crit bonus applied.
10. **Vanguard Indestructible** — apply lethal damage, verify HP clamps to 1.
11. **Psychic Shield** — apply damage, verify Shield d4 absorbs before HP loss.
12. **Briar Healer** — take damage, verify postDamageApply thorns reaction.
13. **Pugilist Impact** — brawl attack, verify die size escalation.
14. **Monk Martial Arts** — finesse attack, verify die escalation.
15. **Gunslinger features** — Akimbo Trigger / Steady Aim — verify damage/favor.
16. **Sorcerer Tap** — call API, verify HP→Mana conversion + AE cleanup on rest.
17. **Alchemist Cookbook** — craft an item, verify creation.
18. **Merchant Deep Pockets** — fill inventory beyond base, verify no encumbered AE.

That's ~18 upgrades + ~12 cross-cutting tests = the Phase 2 / Phase 3 / Phase 4
targets in the original plan.

---

## Update — 2026-05-13 (later pass)

Phases 2-5 implemented, plus a final audit-pass upgrade. The suite has grown
from 58 to 227 tests. **Behavioral coverage rose from 47% to ~92%.**

Phases since the original audit:

- **Phase 2** — Tier B class features upgraded with behavioral assertions
  (Barbarian Rage DR via system.incomingDamageReductionPerDie; Sorcerer
  Spell-Slinger castCritBonus + spellDamageDieSize; Wizard Manifold Mind
  focus.maxBonus; Revelator focus + Divine Resolve immunities + Sacrosanct
  save bonuses; Merchant Deep Pockets exact bonusSlots; Pugilist Impact
  brawlDamageDieSizeBonus; Rogue Sneak Attack damage formula injection;
  Hunter `_markTarget`; Gunslinger Deadeye rangedCritBonus; Dancer Step Up
  2d20kh save formula; Sorcerer Tap HP→Mana delta).
- **Phase 3** — Tier C: 7 system ancestry trait-detection tests (surfaced
  the darksight/nimble multi-name collision bug — fixed in feature-detector
  via `_ANCESTRY_TRAIT_MULTI`); 20 VCE custom ancestry presence/identity
  tests; behavioral assertions on Tier C perk tests (catalog-backed AE stat
  changes).
- **Phase 4** — Cross-cutting (11 tests in `tier-a/cross-cutting.mjs`):
  range validator (measureDistance + onPreRollAttack blocking/Hinder),
  brawl intent helpers (getActorSize + getEffectiveShoveSize +
  vanguard_wall scaling), save routing (resolveSaveRoller mana vs
  leadership), silver/metal weakness (calculateFinalDamage armor bypass).
- **Phase 5** — Chat-message injection (3 tests in
  `tier-a/chat-injection.mjs`): Barbarian RAGE tag, Rage DR breakdown,
  Hunter unmark button click. Pattern: synthetic chat card matching the
  system's DOM shape → message create → poll for injected element →
  click + assert flag mutation. Template is ready for the other 11+
  injection sites if regressions surface.

Audit-pass upgrades (this session):

- `ward.method-is-callable` 🔴 → `ward.applies-and-clears-AE` 🟢 — drives
  WardManager._applyWardAE end-to-end, asserts AE flag + status + caster id,
  and verifies refresh-without-stacking semantics.
- `range-validator.no-error-on-out-of-range` 🔴 → **removed** (superseded
  by 4 stronger Phase 4 tests).
- `alchemist.cookbook-api-callable` 🔴 →
  `alchemist.progression-data-at-level-5` 🟢 — drives getAlchemistData
  end-to-end and asserts L5 progression values match ALCHEMIST_LEVELS[5].

Remaining 🔴 tests are pure-API-presence smoke checks where building a
behavioral path would require fixture machinery disproportionate to the
yield:

- `boot.no-console-errors-recent` — baseline smoke check
- `boot.api-surface-present` — module-load smoke check
- `magus.flag-set` — system-status feature with no module AE to inspect
- `druid.flag-set` — polymorph already tested behaviorally elsewhere
- `witch.betwixt-api-callable` — opens a blocking dialog
- `luminary.flag-set` — runtime hook (canExplode injection on healing)
- `bard.virtuoso-api-callable` — hasActiveInspiration() has out-of-combat
  quirks (see source); behavioral path documented as deferred
- `summoner.conjure-api-callable` — Summoner not in vagabond.classes pack

These are documented in their respective test files and represent
intentional boundaries rather than gaps.

**Bug parade** caught by the behavioral pass:

1. Mental Fortress AE mode-4 (UPGRADE) on an array field was a no-op —
   status immunities never landed. Fixed (mode → 2).
2. Ancestry trait flat-spread registry collision: darksight (Dwarf/Goblin/
   Orc) and nimble (Goblin/Halfling) — only one registration won. Fixed
   via `_ANCESTRY_TRAIT_MULTI` pattern (same shape as class features).
3. Fixture pollution from crashed prior sessions — `featureFocus` leftovers
   broke the focus suite. Fixed via `Fixtures._wipeStaleFlags` on each
   session init.

Both module bugs and the fixture-hygiene bug existed BEFORE this work and
were invisible to the prior shallow harness. They were caught the first
time behavioral assertions exercised the code paths they affect.
