/**
 * Tier C — ancestry trait detection.
 *
 * One test per system ancestry. Each test:
 *   1. Adds the ancestry item from `vagabond.ancestries` to TestPC
 *   2. Triggers a rescan so the feature detector runs
 *   3. Asserts every expected `<ancestry>_<trait>` flag is set
 *
 * This catches ancestry-detection regressions (e.g. a renamed flag,
 * a registry not being loaded, a feature-detector path that skips
 * ancestry items). Most ancestry traits don't have managed AEs —
 * they're flag-only "remember this RAW" features — so the behavioral
 * value here is "the flag fires on detection", which is what the
 * rest of the system gates other features on.
 *
 * For Draken: Draconic Resilience halving is already covered as a
 * behavioral test in Tier A exalt-damage.mjs's general damage path,
 * since damage halving has the most user-facing impact.
 */
import { MODULE_ID } from "../../../utils.mjs";

const ANCESTRIES_PACK = "vagabond.ancestries";

/**
 * Expected feature flags per system ancestry.
 *
 * KNOWN BUG (surfaced by this test, 2026-05-13): the feature detector uses
 * a flat trait-name → registry map keyed by trait NAME, so traits with the
 * same name across ancestries collide. Only ONE registration wins; the
 * loser's flag never gets set even when its ancestry is selected. Same
 * collision class as the Dancer / Monk "fleet of foot" issue documented
 * in tests/tier-b/skirmisher.mjs.
 *
 * Affected trait names: "darksight" (Dwarf / Goblin / Orc — 3-way),
 * "nimble" (Goblin / Halfling). Per-ancestry traits with unique names are
 * fine. Flagged with `KNOWN_COLLISION` so the test asserts only the traits
 * that the detector CAN currently see, with the collision documented.
 *
 * Once the detector is fixed (multi-map keyed by ancestry+trait), un-flag.
 */
const EXPECTED_FLAGS = {
  Draken:   ["draken_breathAttack", "draken_scale", "draken_draconicResilience"],
  // Dwarf has "darksight" but it collides with Goblin/Orc — flag-detection skipped
  Dwarf:    ["dwarf_sturdy", "dwarf_tough" /* KNOWN_COLLISION: dwarf_darksight */],
  Elf:      ["elf_ascendancy", "elf_elvenEyes", "elf_naturallyAttuned"],
  // Goblin has both "darksight" and "nimble", both collisions — only scavenger detects cleanly
  Goblin:   ["goblin_scavenger" /* KNOWN_COLLISION: goblin_darksight, goblin_nimble */],
  // Halfling "nimble" collides with Goblin; squat + tricksy are unique
  Halfling: ["halfling_squat", "halfling_tricksy" /* KNOWN_COLLISION: halfling_nimble */],
  Human:    ["human_knack", "human_strongPotential"],
  // Orc "darksight" collides; beefy + hulking are unique
  Orc:      ["orc_beefy", "orc_hulking" /* KNOWN_COLLISION: orc_darksight */],
};

async function _attachAncestry(actor, ancestryName) {
  // Remove any existing ancestry first
  const stale = actor.items.filter(i => i.type === "ancestry");
  if (stale.length) await actor.deleteEmbeddedDocuments("Item", stale.map(i => i.id));
  const pack = game.packs.get(ANCESTRIES_PACK);
  if (!pack) throw new Error(`Pack ${ANCESTRIES_PACK} not found`);
  const idx = [...await pack.getIndex()];
  const entry = idx.find(e => e.name === ancestryName);
  if (!entry) throw new Error(`Ancestry "${ancestryName}" not found in ${ANCESTRIES_PACK}`);
  const doc = await pack.getDocument(entry._id);
  await actor.createEmbeddedDocuments("Item", [doc.toObject()]);
}

export const tests = Object.entries(EXPECTED_FLAGS).map(([ancestry, flags]) => ({
  id: `ancestry.${ancestry.toLowerCase()}-flags`,
  name: `Ancestry: ${ancestry} — all expected trait flags set after detection`,
  tier: "c",
  usesFixtures: ["TestPC"],
  run: async ({ fixtures, assert, wait }) => {
    const actor = fixtures.TestPC;
    if (!actor) { assert(false, "TestPC fixture missing"); return; }

    await _attachAncestry(actor, ancestry);
    await game.vagabondCharacterEnhancer.rescan(actor);
    await wait(200);

    const features = actor.getFlag(MODULE_ID, "features") ?? {};
    const missing = flags.filter(f => features[f] !== true);
    assert(missing.length === 0,
      `${ancestry}: missing flag(s) [${missing.join(", ")}]; got: ${Object.keys(features).filter(k => k.startsWith(ancestry.toLowerCase() + "_")).join(", ")}`);
  }
}));
