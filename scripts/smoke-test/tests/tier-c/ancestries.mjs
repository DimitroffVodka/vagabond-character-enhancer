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
 * History note: an earlier version of this test (commit 997bc6f, 2026-05-13)
 * documented a name-collision bug in the feature detector. The detector used
 * a flat trait-name → registry map keyed by trait NAME, so traits with the
 * same name across ancestries collided and only one registration won. Same
 * collision class as the Dancer / Monk "fleet of foot" issue documented in
 * tests/tier-b/skirmisher.mjs.
 *
 * Fixed by applying the class-feature multi-map pattern to ancestries:
 *   _ANCESTRY_TRAIT_MULTI[traitName] = [entry, entry, ...]
 * The scan loop now walks all entries and filters by ancestry name.
 *
 * Affected trait names (now passing):
 *   - "darksight" — Dwarf, Goblin, Orc (3-way)
 *   - "nimble"    — Goblin, Halfling   (2-way)
 */
const EXPECTED_FLAGS = {
  Draken:   ["draken_breathAttack", "draken_scale", "draken_draconicResilience"],
  Dwarf:    ["dwarf_sturdy", "dwarf_tough", "dwarf_darksight"],
  Elf:      ["elf_ascendancy", "elf_elvenEyes", "elf_naturallyAttuned"],
  Goblin:   ["goblin_scavenger", "goblin_darksight", "goblin_nimble"],
  Halfling: ["halfling_squat", "halfling_tricksy", "halfling_nimble"],
  Human:    ["human_knack", "human_strongPotential"],
  Orc:      ["orc_beefy", "orc_hulking", "orc_darksight"],
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
