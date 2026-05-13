/**
 * Tier B tests: martial/skirmisher class signature checks.
 * Barbarian, Fighter, Vanguard, Pugilist, Rogue — 5 tests.
 *
 * Each test reconfigures _smoke-TestPC to the target class via Fixtures.swapClass,
 * then asserts the class feature flag (and optionally a managed AE) is present.
 *
 * Flag keys sourced directly from the class registries:
 *   barbarian  → barbarian_rage          (level 1, has managed AE "Rage")
 *   fighter    → fighter_momentum        (level 2, runtime AE only)
 *   vanguard   → vanguard_guard          (level 1) + vanguard_wall AE (level 4)
 *   pugilist   → pugilist_haymaker       (level 6 — swap at L6)
 *   rogue      → rogue_sneakAttack       (level 1)
 *
 * NOTE: Monk is NOT in the vagabond.classes compendium (v5.3.0) and therefore
 * cannot be tested via swapClass. Replaced with Vanguard.
 */
import { MODULE_ID } from "../../../utils.mjs";

export const tests = [

  // ── Tier B Test 1 ────────────────────────────────────────────────────────
  {
    id: "barbarian.rage-flag-set-on-class",
    name: "Barbarian: rage flag + managed AE present after class swap (L5)",
    tier: "b",
    usesFixtures: ["TestPC"],
    setup: async ({ fixtures }) => {
      const { Fixtures } = await import("../../fixtures.mjs");
      await Fixtures.swapClass("TestPC", "Barbarian", 5);
    },
    run: async ({ fixtures, assert, wait }) => {
      const actor = fixtures.TestPC;
      if (!actor) { assert(false, "TestPC fixture missing"); return; }

      // Allow detector to settle after swapClass
      await wait(300);

      const features = actor.getFlag(MODULE_ID, "features") ?? {};
      assert(features.barbarian_rage === true,
        `expected barbarian_rage=true; features=${JSON.stringify(features)}`);

      // Rage has an effects array → FeatureDetector should have created a "Rage" AE
      const rageAE = actor.effects.find(e => /^rage$/i.test(e.name));
      assert(!!rageAE,
        `expected a "Rage" managed AE; effects=${actor.effects.map(e => e.name).join(", ")}`);

      // BEHAVIORAL: Rage AE writes `system.incomingDamageReductionPerDie +1`.
      // If the AE is properly applied, the actor's prepared data reflects this.
      // Rip and Tear (L9) stacks another +1; at L5 only Rage contributes.
      assert((actor.system.incomingDamageReductionPerDie ?? 0) >= 1,
        `Rage AE should set incomingDamageReductionPerDie >= 1; got ${actor.system.incomingDamageReductionPerDie}`);
    }
  },

  // ── Tier B Test 2 ────────────────────────────────────────────────────────
  {
    id: "fighter.momentum-flag-set",
    name: "Fighter: momentum flag present after class swap (L5)",
    tier: "b",
    usesFixtures: ["TestPC"],
    setup: async ({ fixtures }) => {
      const { Fixtures } = await import("../../fixtures.mjs");
      await Fixtures.swapClass("TestPC", "Fighter", 5);
    },
    run: async ({ fixtures, assert, wait }) => {
      const actor = fixtures.TestPC;
      if (!actor) { assert(false, "TestPC fixture missing"); return; }

      await wait(300);

      const features = actor.getFlag(MODULE_ID, "features") ?? {};
      // fighter_momentum unlocks at level 2 — level 5 is sufficient
      assert(features.fighter_momentum === true,
        `expected fighter_momentum=true; features=${JSON.stringify(features)}`);
    }
  },

  // ── Tier B Test 3 ────────────────────────────────────────────────────────
  // NOTE: Monk is not in the vagabond.classes compendium (v5.3.0).
  // Using Vanguard instead: guard (L1, module) + wall (L4, managed AE).
  {
    id: "vanguard.flag-and-wall-ae",
    name: "Vanguard: guard flag + Wall (Large) AE present after class swap (L5)",
    tier: "b",
    usesFixtures: ["TestPC"],
    setup: async ({ fixtures }) => {
      const { Fixtures } = await import("../../fixtures.mjs");
      await Fixtures.swapClass("TestPC", "Vanguard", 5);
    },
    run: async ({ fixtures, assert, wait }) => {
      const actor = fixtures.TestPC;
      if (!actor) { assert(false, "TestPC fixture missing"); return; }

      await wait(300);

      const features = actor.getFlag(MODULE_ID, "features") ?? {};
      // vanguard_guard unlocks at level 1 — level 5 is sufficient
      assert(features.vanguard_guard === true,
        `expected vanguard_guard=true; features=${JSON.stringify(features)}`);

      // vanguard_wall unlocks at level 4; it has an effects array → managed AE "Wall (Large)"
      assert(features.vanguard_wall === true,
        `expected vanguard_wall=true; features=${JSON.stringify(features)}`);

      const wallAE = actor.effects.find(e => /wall \(large\)/i.test(e.name));
      assert(!!wallAE,
        `expected a "Wall (Large)" managed AE; effects=${actor.effects.map(e => e.name).join(", ")}`);
    }
  },

  // ── Tier B Test 4 ────────────────────────────────────────────────────────
  {
    id: "pugilist.haymaker-flag",
    name: "Pugilist: haymaker flag present after class swap (L6)",
    tier: "b",
    usesFixtures: ["TestPC"],
    setup: async ({ fixtures }) => {
      const { Fixtures } = await import("../../fixtures.mjs");
      // Haymaker unlocks at level 6 — must swap at L6 or higher
      await Fixtures.swapClass("TestPC", "Pugilist", 6);
    },
    run: async ({ fixtures, assert, wait }) => {
      const actor = fixtures.TestPC;
      if (!actor) { assert(false, "TestPC fixture missing"); return; }

      await wait(300);

      const features = actor.getFlag(MODULE_ID, "features") ?? {};
      assert(features.pugilist_haymaker === true,
        `expected pugilist_haymaker=true; features=${JSON.stringify(features)}`);
    }
  },

  // ── Tier B Test 4b — Pugilist Impact (L8 — has managed AE) ──────────────
  // Impact writes `system.brawlDamageDieSizeBonus +2`. Different test from
  // haymaker because Impact unlocks at L8 — the haymaker test (L6) misses it.
  {
    id: "pugilist.impact-die-bonus",
    name: "Pugilist Impact: brawlDamageDieSizeBonus increments at L8",
    tier: "b",
    usesFixtures: ["TestPC"],
    setup: async () => {
      const { Fixtures } = await import("../../fixtures.mjs");
      await Fixtures.swapClass("TestPC", "Pugilist", 8);
    },
    run: async ({ fixtures, assert, wait }) => {
      const actor = fixtures.TestPC;
      if (!actor) { assert(false, "TestPC fixture missing"); return; }
      await wait(300);

      const features = actor.getFlag(MODULE_ID, "features") ?? {};
      assert(features.pugilist_impact === true,
        `expected pugilist_impact=true at L8; features=${JSON.stringify(features)}`);

      // BEHAVIORAL: Impact AE writes brawlDamageDieSizeBonus +2
      assert((actor.system?.brawlDamageDieSizeBonus ?? 0) >= 2,
        `Impact should set brawlDamageDieSizeBonus ≥ 2; got ${actor.system?.brawlDamageDieSizeBonus}`);
    }
  },

  // ── Tier B Test 5 ────────────────────────────────────────────────────────
  {
    id: "rogue.sneak-attack-flag",
    name: "Rogue: sneak attack flag present after class swap (L5)",
    tier: "b",
    usesFixtures: ["TestPC"],
    setup: async ({ fixtures }) => {
      const { Fixtures } = await import("../../fixtures.mjs");
      await Fixtures.swapClass("TestPC", "Rogue", 5);
    },
    run: async ({ fixtures, assert, wait }) => {
      const actor = fixtures.TestPC;
      if (!actor) { assert(false, "TestPC fixture missing"); return; }

      await wait(300);

      const features = actor.getFlag(MODULE_ID, "features") ?? {};
      assert(features.rogue_sneakAttack === true,
        `expected rogue_sneakAttack=true; features=${JSON.stringify(features)}`);
    }
  },
];
