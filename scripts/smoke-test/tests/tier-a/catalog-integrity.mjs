/**
 * Tier A — VCE Active Effects Catalog integrity.
 *
 * Behavioral assertions:
 *   1. All canonicalIds in CATALOG resolve to a real compendium UUID.
 *   2. `cloneFor` strips the null `_stats` / `start` / `folder` / `sort`
 *      fields that Foundry v14's data model silently rejects.
 *   3. A cloned AE can actually be embedded on an actor without
 *      returning [] (the silent-fail signature).
 *
 * Why these matter:
 *   The catalog is the source of truth for region buff auras (Bless,
 *   Ward, Exalt) and ~19 class/perk managed AEs. A missing entry or a
 *   silent-fail clone produces auras that look cast but apply nothing.
 *   v0.5.0 specifically fixed the `_stats` strip — this test is a
 *   regression guard.
 */
import { MODULE_ID } from "../../../utils.mjs";

export const tests = [

  // ── Test 1 ──────────────────────────────────────────────────────────────
  {
    id: "catalog.all-canonical-ids-resolve",
    name: "Catalog: every CATALOG entry resolves to a compendium UUID",
    tier: "a",
    usesFixtures: [],
    run: async ({ assert }) => {
      const { CATALOG, uuidFor } = await import("../../../active-effects-catalog.mjs");
      const missing = [];
      for (const def of CATALOG) {
        const uuid = await uuidFor(def.canonicalId);
        if (!uuid) missing.push(def.canonicalId);
      }
      assert(missing.length === 0,
        `${missing.length}/${CATALOG.length} catalog entries missing in the pack: ${missing.join(", ")}`);
      assert(CATALOG.length >= 22,
        `Catalog should have at least 22 entries (current: ${CATALOG.length})`);
    },
  },

  // ── Test 2 ──────────────────────────────────────────────────────────────
  {
    id: "catalog.clone-strips-null-stats",
    name: "Catalog: cloneFor() strips bookkeeping fields that v14 rejects",
    tier: "a",
    usesFixtures: [],
    run: async ({ assert }) => {
      const { cloneFor } = await import("../../../active-effects-catalog.mjs");
      const data = await cloneFor("bless-aura");
      assert(!!data, "cloneFor('bless-aura') should return data");
      if (!data) return;
      assert(!("_stats" in data), "_stats must be stripped (null fields fail v14 validation)");
      assert(!("start" in data),  "start must be stripped");
      assert(!("folder" in data), "folder must be stripped");
      assert(!("sort" in data),   "sort must be stripped");
      assert(!("_id" in data),    "_id must be stripped so embed creates a fresh doc");
      assert(typeof data.name === "string" && data.name.length > 0, "name should survive");
      assert(typeof data.img === "string"  && data.img.length > 0,  "img should survive");
    },
  },

  // ── Test 3 ──────────────────────────────────────────────────────────────
  {
    id: "catalog.clone-can-be-embedded",
    name: "Catalog: cloned AE actually embeds (createEmbeddedDocuments returns non-empty)",
    tier: "a",
    usesFixtures: ["TestPC"],
    run: async ({ fixtures, assert }) => {
      const actor = fixtures.TestPC;
      assert(!!actor, "TestPC fixture required");
      if (!actor) return;

      const { cloneFor } = await import("../../../active-effects-catalog.mjs");
      const data = await cloneFor("bless-aura");
      data.origin = "smoke-test-catalog";

      const created = await actor.createEmbeddedDocuments("ActiveEffect", [data]);
      assert(created.length === 1,
        `createEmbeddedDocuments returned ${created.length} (expected 1) — silent-fail trap`);

      // Cleanup will be handled by runner's _restoreFixtures (effects added
      // during the test are auto-deleted).
    },
  },
];
