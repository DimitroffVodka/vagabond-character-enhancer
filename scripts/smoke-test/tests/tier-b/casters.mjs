/**
 * Tier B tests: caster class signature checks.
 * Wizard, Magus, Sorcerer, Druid, Revelator, Witch, Luminary — 7 tests.
 *
 * Each test reconfigures TestPC to the target class via Fixtures.swapClass,
 * then asserts the class feature flag is present.
 *
 * Flag keys sourced directly from the class registries:
 *   wizard     → wizard_pageMaster      (level 1, module)
 *   magus      → magus_spellstriker     (level 1, system) — only system flag at L1
 *   sorcerer   → sorcerer_glamour       (level 1, system) — system flag, L2 gets module AE
 *   druid      → druid_primalMystic     (level 1, system)
 *   revelator  → revelator_selfless     (level 1, module)  + API check for layOnHands
 *   witch      → witch_occultist        (level 1, system)  + API check for betwixt
 *   luminary   → luminary_radiantHealer (level 1, module)
 *
 * For revelator and witch, blocking-dialog API methods are asserted callable
 * but NOT invoked.
 *
 * NOTE: For magus and sorcerer the L1 features are status:"system" (no managed AE).
 * The detector still sets the flag via the registry's flag field, so the assertion
 * is valid even without a module-status AE.
 */
import { MODULE_ID } from "../../../utils.mjs";

export const tests = [

  // ── Tier B Test 9 ─────────────────────────────────────────────────────────
  {
    id: "wizard.page-master-flag",
    name: "Wizard: pageMaster flag set after class swap (L5)",
    tier: "b",
    usesFixtures: ["TestPC"],
    setup: async ({ fixtures }) => {
      const { Fixtures } = await import("../../fixtures.mjs");
      await Fixtures.swapClass("TestPC", "Wizard", 5);
    },
    run: async ({ fixtures, assert, wait }) => {
      const actor = fixtures.TestPC;
      if (!actor) { assert(false, "TestPC fixture missing"); return; }

      await wait(300);

      const features = actor.getFlag(MODULE_ID, "features") ?? {};
      // wizard_pageMaster: level 1, status:"module"
      assert(features.wizard_pageMaster === true,
        `expected wizard_pageMaster=true; features=${JSON.stringify(features)}`);

      // BEHAVIORAL: at L5 Wizard has Manifold Mind which writes
      // `system.focus.maxBonus += 1`. Verify the bonus actually accumulates.
      const maxBonus = actor.system?.focus?.maxBonus;
      const bonusSum = Array.isArray(maxBonus)
        ? maxBonus.reduce((s, v) => s + Number(v || 0), 0)
        : Number(maxBonus || 0);
      assert(bonusSum >= 1,
        `Manifold Mind AE should bump focus.maxBonus by ≥1; got ${JSON.stringify(maxBonus)} (sum=${bonusSum})`);
    }
  },

  // ── Tier B Test 10 ────────────────────────────────────────────────────────
  {
    id: "magus.flag-set",
    name: "Magus: spellstriker flag set after class swap (L5)",
    tier: "b",
    usesFixtures: ["TestPC"],
    setup: async ({ fixtures }) => {
      const { Fixtures } = await import("../../fixtures.mjs");
      await Fixtures.swapClass("TestPC", "Magus", 5);
    },
    run: async ({ fixtures, assert, wait }) => {
      const actor = fixtures.TestPC;
      if (!actor) { assert(false, "TestPC fixture missing"); return; }

      await wait(300);

      const features = actor.getFlag(MODULE_ID, "features") ?? {};
      // magus_spellstriker: level 1, status:"system"
      assert(features.magus_spellstriker === true,
        `expected magus_spellstriker=true; features=${JSON.stringify(features)}`);
    }
  },

  // ── Tier B Test 11 ────────────────────────────────────────────────────────
  {
    id: "sorcerer.flag-set",
    name: "Sorcerer: glamour flag + Spell-Slinger AE after class swap (L5)",
    tier: "b",
    usesFixtures: ["TestPC"],
    setup: async ({ fixtures }) => {
      const { Fixtures } = await import("../../fixtures.mjs");
      await Fixtures.swapClass("TestPC", "Sorcerer", 5);
    },
    run: async ({ fixtures, assert, wait }) => {
      const actor = fixtures.TestPC;
      if (!actor) { assert(false, "TestPC fixture missing"); return; }

      await wait(300);

      const features = actor.getFlag(MODULE_ID, "features") ?? {};
      // sorcerer_glamour: level 1, status:"system"
      assert(features.sorcerer_glamour === true,
        `expected sorcerer_glamour=true; features=${JSON.stringify(features)}`);

      // sorcerer_spellSlinger: level 2, status:"module", has managed AE
      assert(features.sorcerer_spellSlinger === true,
        `expected sorcerer_spellSlinger=true at L5; features=${JSON.stringify(features)}`);

      // BEHAVIORAL: Spell-Slinger AE writes castCritBonus -1 (crit on 19+)
      // and overrides spellDamageDieSize to 8. Verify both reached actor data.
      assert((actor.system.castCritBonus ?? 0) <= -1,
        `Spell-Slinger should set castCritBonus ≤ -1; got ${actor.system.castCritBonus}`);
      assert((actor.system.spellDamageDieSize ?? 6) >= 8,
        `Spell-Slinger should set spellDamageDieSize >= 8; got ${actor.system.spellDamageDieSize}`);
    }
  },

  // ── Tier B Test 12 ────────────────────────────────────────────────────────
  {
    id: "druid.flag-set",
    name: "Druid: primalMystic flag set after class swap (L5)",
    tier: "b",
    usesFixtures: ["TestPC"],
    setup: async ({ fixtures }) => {
      const { Fixtures } = await import("../../fixtures.mjs");
      await Fixtures.swapClass("TestPC", "Druid", 5);
    },
    run: async ({ fixtures, assert, wait }) => {
      const actor = fixtures.TestPC;
      if (!actor) { assert(false, "TestPC fixture missing"); return; }

      await wait(300);

      const features = actor.getFlag(MODULE_ID, "features") ?? {};
      // druid_primalMystic: level 1, status:"system"
      assert(features.druid_primalMystic === true,
        `expected druid_primalMystic=true; features=${JSON.stringify(features)}`);

      // druid_tempestWithin: level 2, status:"module" — also present at L5
      assert(features.druid_tempestWithin === true,
        `expected druid_tempestWithin=true at L5; features=${JSON.stringify(features)}`);
    }
  },

  // ── Tier B Test 13 ────────────────────────────────────────────────────────
  {
    id: "revelator.layonhands-api-callable",
    name: "Revelator: layOnHands API callable + selfless flag set after class swap (L5)",
    tier: "b",
    usesFixtures: ["TestPC"],
    setup: async ({ fixtures }) => {
      const { Fixtures } = await import("../../fixtures.mjs");
      await Fixtures.swapClass("TestPC", "Revelator", 5);
    },
    run: async ({ fixtures, assert, wait }) => {
      const actor = fixtures.TestPC;
      if (!actor) { assert(false, "TestPC fixture missing"); return; }

      await wait(300);

      // Verify API existence (do NOT call — layOnHands opens a dialog)
      const api = game.vagabondCharacterEnhancer;
      assert(typeof api?.layOnHands === "function",
        "game.vagabondCharacterEnhancer.layOnHands should be a function");

      const features = actor.getFlag(MODULE_ID, "features") ?? {};
      // revelator_selfless: level 1, status:"module"
      assert(features.revelator_selfless === true,
        `expected revelator_selfless=true; features=${JSON.stringify(features)}`);

      // BEHAVIORAL: Revelator at L5 has Paragon's Aura which writes
      // `system.focus.maxBonus += 1`. Also Sacrosanct (L3+) writes save bonuses.
      const maxBonus = actor.system?.focus?.maxBonus;
      const bonusSum = Array.isArray(maxBonus)
        ? maxBonus.reduce((s, v) => s + Number(v || 0), 0)
        : Number(maxBonus || 0);
      assert(bonusSum >= 1,
        `Paragon's Aura should bump focus.maxBonus ≥1; got ${JSON.stringify(maxBonus)}`);
    }
  },

  // ── Tier B Test 14 ────────────────────────────────────────────────────────
  {
    id: "witch.betwixt-api-callable",
    name: "Witch: betwixt API callable + occultist flag set after class swap (L5)",
    tier: "b",
    usesFixtures: ["TestPC"],
    setup: async ({ fixtures }) => {
      const { Fixtures } = await import("../../fixtures.mjs");
      await Fixtures.swapClass("TestPC", "Witch", 5);
    },
    run: async ({ fixtures, assert, wait }) => {
      const actor = fixtures.TestPC;
      if (!actor) { assert(false, "TestPC fixture missing"); return; }

      await wait(300);

      // Verify API existence (do NOT call — betwixt activates Invisible + Focus)
      const api = game.vagabondCharacterEnhancer;
      assert(typeof api?.betwixt === "function",
        "game.vagabondCharacterEnhancer.betwixt should be a function");

      const features = actor.getFlag(MODULE_ID, "features") ?? {};
      // witch_occultist: level 1, status:"system"
      assert(features.witch_occultist === true,
        `expected witch_occultist=true; features=${JSON.stringify(features)}`);

      // witch_hex: level 1, status:"module" — also present at L5
      assert(features.witch_hex === true,
        `expected witch_hex=true at L5; features=${JSON.stringify(features)}`);
    }
  },

  // ── Tier B Test 15 ────────────────────────────────────────────────────────
  {
    id: "luminary.flag-set",
    name: "Luminary: radiantHealer flag set after class swap (L5)",
    tier: "b",
    usesFixtures: ["TestPC"],
    setup: async ({ fixtures }) => {
      const { Fixtures } = await import("../../fixtures.mjs");
      await Fixtures.swapClass("TestPC", "Luminary", 5);
    },
    run: async ({ fixtures, assert, wait }) => {
      const actor = fixtures.TestPC;
      if (!actor) { assert(false, "TestPC fixture missing"); return; }

      await wait(300);

      const features = actor.getFlag(MODULE_ID, "features") ?? {};
      // luminary_radiantHealer: level 1, status:"module"
      assert(features.luminary_radiantHealer === true,
        `expected luminary_radiantHealer=true; features=${JSON.stringify(features)}`);

      // luminary_overheal: level 2, status:"module" — also present at L5
      assert(features.luminary_overheal === true,
        `expected luminary_overheal=true at L5; features=${JSON.stringify(features)}`);
    }
  },
];
