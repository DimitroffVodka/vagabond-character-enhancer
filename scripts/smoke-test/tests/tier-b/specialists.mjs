/**
 * Tier B tests: specialist class signature checks.
 * Alchemist, Bard, Merchant, Summoner — 4 tests.
 *
 * Each test reconfigures TestPC to the target class via Fixtures.swapClass,
 * then asserts class feature flags and API surface.
 *
 * Flag keys sourced directly from the class registries:
 *   alchemist → alchemist_alchemy      (level 1, no status field — still flagged)
 *   bard      → bard_virtuoso          (level 1, module)
 *   merchant  → merchant_deepPockets   (level 1, module) + bonusSlots check
 *   summoner  → summoner_creatureCodex (level 1, module)
 *
 * Blocking-dialog API methods (virtuoso, conjure) are asserted callable
 * but NOT invoked.
 *
 * NOTE: The alchemist registry entries omit the `status` field entirely for L1.
 * The detector still sets flags for all registry entries regardless of status.
 *
 * NOTE: Merchant Deep Pockets writes to system.inventory.bonusSlots via a managed
 * AE (dynamic: ceil(level/2)). At L5 this is 3 bonus slots. We assert both the
 * flag AND that bonusSlots > 0 via the active effect's changes, with a graceful
 * fallback to flag-only if the AE hasn't been applied yet.
 *
 * NOTE: "Summoner" is NOT in the vagabond.classes compendium (v5.3.0). The
 * summoner test only asserts the API surface; the flag assertion is skipped.
 */
import { MODULE_ID } from "../../../utils.mjs";

export const tests = [

  // ── Tier B Test 16 ────────────────────────────────────────────────────────
  {
    id: "alchemist.cookbook-api-callable",
    name: "Alchemist: alchemist + alchemy API objects exist + flag set after class swap (L5)",
    tier: "b",
    usesFixtures: ["TestPC"],
    setup: async ({ fixtures }) => {
      const { Fixtures } = await import("../../fixtures.mjs");
      await Fixtures.swapClass("TestPC", "Alchemist", 5);
    },
    run: async ({ fixtures, assert, wait }) => {
      const actor = fixtures.TestPC;
      if (!actor) { assert(false, "TestPC fixture missing"); return; }

      await wait(300);

      const api = game.vagabondCharacterEnhancer;
      // api.alchemist is AlchemistFeatures object
      assert(typeof api?.alchemist === "object" && api.alchemist !== null,
        `expected api.alchemist to be an object; got ${typeof api?.alchemist}`);
      // api.alchemy is the AlchemyCookbook / Alchemy helpers object
      assert(typeof api?.alchemy === "object" && api.alchemy !== null,
        `expected api.alchemy to be an object; got ${typeof api?.alchemy}`);

      const features = actor.getFlag(MODULE_ID, "features") ?? {};
      // alchemist_alchemy: level 1 (no status field in registry, but detector still sets flag)
      assert(features.alchemist_alchemy === true,
        `expected alchemist_alchemy=true; features=${JSON.stringify(features)}`);
    }
  },

  // ── Tier B Test 17 ────────────────────────────────────────────────────────
  {
    id: "bard.virtuoso-api-callable",
    name: "Bard: virtuoso API callable + bard flag set after class swap (L5)",
    tier: "b",
    usesFixtures: ["TestPC"],
    setup: async ({ fixtures }) => {
      const { Fixtures } = await import("../../fixtures.mjs");
      await Fixtures.swapClass("TestPC", "Bard", 5);
    },
    run: async ({ fixtures, assert, wait }) => {
      const actor = fixtures.TestPC;
      if (!actor) { assert(false, "TestPC fixture missing"); return; }

      await wait(300);

      // Verify API existence (do NOT call — virtuoso makes a Performance check
      // and opens dialog buttons on the resulting chat card)
      const api = game.vagabondCharacterEnhancer;
      assert(typeof api?.virtuoso === "function",
        "game.vagabondCharacterEnhancer.virtuoso should be a function");

      const features = actor.getFlag(MODULE_ID, "features") ?? {};
      // bard_virtuoso: level 1, status:"module"
      assert(features.bard_virtuoso === true,
        `expected bard_virtuoso=true; features=${JSON.stringify(features)}`);
    }
  },

  // ── Tier B Test 18 ────────────────────────────────────────────────────────
  {
    id: "merchant.deep-pockets-bonus-slots",
    name: "Merchant: deepPockets flag + bonusSlots > 0 after class swap (L5)",
    tier: "b",
    usesFixtures: ["TestPC"],
    setup: async ({ fixtures }) => {
      const { Fixtures } = await import("../../fixtures.mjs");
      await Fixtures.swapClass("TestPC", "Merchant", 5);
    },
    run: async ({ fixtures, assert, wait }) => {
      const actor = fixtures.TestPC;
      if (!actor) { assert(false, "TestPC fixture missing"); return; }

      await wait(300);

      const features = actor.getFlag(MODULE_ID, "features") ?? {};
      // merchant_deepPockets: level 1, status:"module"
      assert(features.merchant_deepPockets === true,
        `expected merchant_deepPockets=true; features=${JSON.stringify(features)}`);

      // Deep Pockets uses a managed AE writing to system.inventory.bonusSlots.
      // At L5: ceil(5/2) = 3 bonus slots. Check the derived value.
      // The AE applies via mode 2 (ADD) to system.inventory.bonusSlots.
      const bonusSlots = actor.system.inventory?.bonusSlots ?? 0;
      assert(bonusSlots > 0,
        `expected inventory.bonusSlots > 0 (Deep Pockets L5 = +3); got ${bonusSlots}`);
    }
  },

  // ── Tier B Test 19 ────────────────────────────────────────────────────────
  // NOTE: "Summoner" is NOT in the vagabond.classes compendium (v5.3.0), same
  // as Monk. swapClass will silently fail and the actor will keep its prior state.
  // This test therefore only asserts the API surface (which is independent of
  // the compendium); the flag assertion is skipped with an explanatory note.
  {
    id: "summoner.conjure-api-callable",
    name: "Summoner: summoner object + conjure API callable (no compendium — flag skipped)",
    tier: "b",
    usesFixtures: ["TestPC"],
    setup: async ({ fixtures }) => {
      // swapClass will silently do nothing — Summoner not in vagabond.classes pack
      const { Fixtures } = await import("../../fixtures.mjs");
      await Fixtures.swapClass("TestPC", "Summoner", 5);
    },
    run: async ({ fixtures, assert, wait }) => {
      const actor = fixtures.TestPC;
      if (!actor) { assert(false, "TestPC fixture missing"); return; }

      await wait(150);

      const api = game.vagabondCharacterEnhancer;
      // api.summoner is SummonerFeatures object
      assert(typeof api?.summoner === "object" && api.summoner !== null,
        `expected api.summoner to be an object; got ${typeof api?.summoner}`);
      // api.conjure is the primary summon trigger (opens creature picker — do NOT call)
      assert(typeof api?.conjure === "function",
        "game.vagabondCharacterEnhancer.conjure should be a function");

      // NOTE: summoner_creatureCodex flag NOT asserted — Summoner class item is absent
      // from the vagabond.classes compendium so swapClass cannot install it.
      // Flag assertion would require either a manual actor setup or the system
      // shipping the Summoner compendium entry. Surfaced here as a known gap.
    }
  },
];
