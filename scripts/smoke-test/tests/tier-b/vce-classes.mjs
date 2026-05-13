/**
 * Tier B — VCE custom class behavioral tests.
 *
 * VCE ships six custom classes in `vagabond-character-enhancer.vce-classes`:
 *   Monk, Psychic, Samurai, Dragoon, Jester, Summoner.
 *
 * These were unreachable before today's `Fixtures.swapClass` change because
 * the helper only resolved system-pack classes. Now it falls through to the
 * VCE pack on miss.
 *
 * Coverage focuses on AEs that materialize on the actor (behavioral) plus
 * a flag check for classes that don't have managed AEs at the test level.
 */
import { MODULE_ID } from "../../../utils.mjs";

export const tests = [

  // ── Monk: Empowered Strikes AE (L8) — finesseDamageDieSizeBonus +2 ──────
  {
    id: "monk.empowered-strikes-die-bonus",
    name: "Monk Empowered Strikes: finesseDamageDieSizeBonus increments at L8",
    tier: "b",
    usesFixtures: ["TestPC"],
    setup: async () => {
      const { Fixtures } = await import("../../fixtures.mjs");
      // Empowered Strikes is L8 — swap at exactly L8 to get it
      await Fixtures.swapClass("TestPC", "Monk", 8);
    },
    run: async ({ fixtures, assert, wait }) => {
      const actor = fixtures.TestPC;
      if (!actor) { assert(false, "TestPC fixture missing"); return; }
      await wait(300);

      const features = actor.getFlag(MODULE_ID, "features") ?? {};
      assert(features.monk_empoweredStrikes === true,
        `expected monk_empoweredStrikes=true at L8; features=${JSON.stringify(features)}`);

      // BEHAVIORAL: AE writes finesseDamageDieSizeBonus +2
      assert((actor.system?.finesseDamageDieSizeBonus ?? 0) >= 2,
        `Empowered Strikes should set finesseDamageDieSizeBonus ≥ 2; got ${actor.system?.finesseDamageDieSizeBonus}`);
    }
  },

  // ── Psychic: Mental Fortress AE (L6) — status immunities ───────────────
  {
    id: "psychic.mental-fortress-status-immunities",
    name: "Psychic Mental Fortress: status immunities granted at L6",
    tier: "b",
    usesFixtures: ["TestPC"],
    setup: async () => {
      const { Fixtures } = await import("../../fixtures.mjs");
      await Fixtures.swapClass("TestPC", "Psychic", 6);
    },
    run: async ({ fixtures, assert, wait }) => {
      const actor = fixtures.TestPC;
      if (!actor) { assert(false, "TestPC fixture missing"); return; }
      await wait(300);

      const features = actor.getFlag(MODULE_ID, "features") ?? {};
      assert(features.psychic_mentalFortress === true,
        `expected psychic_mentalFortress=true at L6; features=${JSON.stringify(features)}`);

      // BEHAVIORAL: AE adds status immunities for berserk, charmed, confused, frightened
      const immunities = actor.system?.statusImmunities ?? "";
      const list = Array.isArray(immunities) ? immunities : String(immunities).split(/[,\s]+/).filter(Boolean);
      for (const status of ["berserk", "charmed", "confused", "frightened"]) {
        assert(list.includes(status) || list.some(s => s.toLowerCase() === status),
          `Mental Fortress should add "${status}" immunity; got: ${JSON.stringify(immunities)}`);
      }
    }
  },

  // ── Psychic: L1 Awakening flag ──────────────────────────────────────────
  {
    id: "psychic.awakening-flag",
    name: "Psychic Awakening: feature flag set at L5",
    tier: "b",
    usesFixtures: ["TestPC"],
    setup: async () => {
      const { Fixtures } = await import("../../fixtures.mjs");
      await Fixtures.swapClass("TestPC", "Psychic", 5);
    },
    run: async ({ fixtures, assert, wait }) => {
      const actor = fixtures.TestPC;
      if (!actor) { assert(false, "TestPC fixture missing"); return; }
      await wait(300);

      const features = actor.getFlag(MODULE_ID, "features") ?? {};
      assert(features.psychic_awakening === true,
        `expected psychic_awakening=true; features=${JSON.stringify(features)}`);
    }
  },

  // ── Summoner: arcanum flag at L5 ────────────────────────────────────────
  {
    id: "summoner.arcanum-flag",
    name: "Summoner: arcanum feature flag set at L5 (custom class detected)",
    tier: "b",
    usesFixtures: ["TestPC"],
    setup: async () => {
      const { Fixtures } = await import("../../fixtures.mjs");
      await Fixtures.swapClass("TestPC", "Summoner", 5);
    },
    run: async ({ fixtures, assert, wait }) => {
      const actor = fixtures.TestPC;
      if (!actor) { assert(false, "TestPC fixture missing"); return; }
      await wait(300);

      const features = actor.getFlag(MODULE_ID, "features") ?? {};
      assert(features.summoner_arcanum === true,
        `expected summoner_arcanum=true; features=${JSON.stringify(features)}`);
    }
  },

  // ── Monk: Martial Arts flag at L1 (baseline detection) ───────────────────
  {
    id: "monk.martial-arts-flag",
    name: "Monk: martialArts flag set at L5 (baseline detection)",
    tier: "b",
    usesFixtures: ["TestPC"],
    setup: async () => {
      const { Fixtures } = await import("../../fixtures.mjs");
      await Fixtures.swapClass("TestPC", "Monk", 5);
    },
    run: async ({ fixtures, assert, wait }) => {
      const actor = fixtures.TestPC;
      if (!actor) { assert(false, "TestPC fixture missing"); return; }
      await wait(300);

      const features = actor.getFlag(MODULE_ID, "features") ?? {};
      assert(features.monk_martialArts === true,
        `expected monk_martialArts=true; features=${JSON.stringify(features)}`);
    }
  },
];
