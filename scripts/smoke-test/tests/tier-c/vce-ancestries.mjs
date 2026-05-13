/**
 * Tier C — VCE custom ancestry presence + identity smoke tests.
 *
 * VCE ships 20 custom ancestries in `vagabond-character-enhancer.vce-ancestries`
 * (Centaur, Pixie, Kindled variants, Fiend, Golem, etc.). Unlike the 7 system
 * ancestries, these have EMPTY `levelFeatures` arrays — they are intentionally
 * flavor/RAW-only items with no automated traits. There is no class-feature
 * registry entry for them and no detector code path that sets specific flags.
 *
 * What we test here, then, isn't trait detection — it's that the *plumbing*
 * around custom ancestries doesn't regress:
 *
 *   1. The pack still exists and is discoverable by name.
 *   2. The item is the expected `ancestry` document type after embed.
 *   3. The detector's `_ancestryName` flag is set correctly post-rescan.
 *   4. No stale system-ancestry flags linger after switching to a custom
 *      ancestry (cross-contamination regression — e.g. Dwarf flags hanging
 *      around after we swap to Centaur).
 *   5. No console errors during attach + rescan (catches detector crashes
 *      on empty levelFeatures or a future field rename).
 *
 * One parameterized test per ancestry — 20 in total. Cleanup is automatic
 * via runner snapshot/restore.
 *
 * If/when a VCE custom ancestry gains automation, lift its entry into a
 * dedicated test alongside the system-ancestry tests in `ancestries.mjs`
 * and remove it from VCE_ANCESTRIES below.
 */
import { MODULE_ID } from "../../../utils.mjs";

const VCE_ANCESTRIES_PACK = "vagabond-character-enhancer.vce-ancestries";

/**
 * The 20 known custom ancestries as of v0.5.0. If the pack grows, the test
 * will surface "not found" assertions, prompting a list update.
 */
const VCE_ANCESTRIES = [
  "Acid Kindled", "Air Kindled", "Centaur", "Changeling", "Fiend",
  "Flame Kindled", "Frost Kindled", "Golem", "Grimalkin", "Harpy",
  "Kobold", "Lepus", "Mimic", "Pixie", "Pollywog",
  "Rook", "Satyr", "Spark Kindled", "Varmi", "Water Kindled",
];

/**
 * Lowercase trait-flag prefixes that should NEVER appear on an actor whose
 * ancestry is a VCE custom one. These are the 7 system ancestries' flag
 * namespaces. If one of these is present, it means either:
 *   (a) the runner's snapshot/restore failed to wipe state between tests, or
 *   (b) a real cross-contamination bug in the detector.
 */
const SYSTEM_ANCESTRY_FLAG_PREFIXES = [
  "draken_", "dwarf_", "elf_", "goblin_", "halfling_", "human_", "orc_",
];

async function _attachAncestry(actor, ancestryName) {
  // Wipe any existing ancestry so we have a clean slate
  const stale = actor.items.filter(i => i.type === "ancestry");
  if (stale.length) await actor.deleteEmbeddedDocuments("Item", stale.map(i => i.id));
  const pack = game.packs.get(VCE_ANCESTRIES_PACK);
  if (!pack) throw new Error(`Pack ${VCE_ANCESTRIES_PACK} not found`);
  const idx = [...await pack.getIndex()];
  const entry = idx.find(e => e.name === ancestryName);
  if (!entry) throw new Error(`Ancestry "${ancestryName}" not found in ${VCE_ANCESTRIES_PACK}`);
  const doc = await pack.getDocument(entry._id);
  const [created] = await actor.createEmbeddedDocuments("Item", [doc.toObject()]);
  return created;
}

export const tests = VCE_ANCESTRIES.map(ancestryName => ({
  id: `vce-ancestry.${ancestryName.toLowerCase().replace(/\s+/g, "-")}`,
  name: `VCE Ancestry: ${ancestryName} — embeds cleanly + detector identifies it`,
  tier: "c",
  usesFixtures: ["TestPC"],
  // Watch console — a detector crash on empty levelFeatures is the main regression
  // we want to catch, and that shows up as a JS error, not as a missing flag.
  failOnConsoleError: true,
  run: async ({ fixtures, assert, wait }) => {
    const actor = fixtures.TestPC;
    if (!actor) { assert(false, "TestPC fixture missing"); return; }

    const item = await _attachAncestry(actor, ancestryName);
    assert(!!item, `expected createEmbeddedDocuments to return the new ancestry item`);
    assert(item?.type === "ancestry",
      `expected embedded item.type === "ancestry"; got ${item?.type}`);
    assert(item?.name === ancestryName,
      `expected embedded item.name === "${ancestryName}"; got "${item?.name}"`);

    await game.vagabondCharacterEnhancer.rescan(actor);
    await wait(200);

    const features = actor.getFlag(MODULE_ID, "features") ?? {};

    // The detector unconditionally writes `_ancestryName` from item.name
    assert(features._ancestryName === ancestryName,
      `expected features._ancestryName === "${ancestryName}"; got "${features._ancestryName}"`);

    // Cross-contamination check — no system-ancestry flags should leak through
    const leakedFlags = Object.keys(features).filter(k =>
      SYSTEM_ANCESTRY_FLAG_PREFIXES.some(prefix => k.startsWith(prefix))
    );
    assert(leakedFlags.length === 0,
      `${ancestryName}: stale system-ancestry flags leaked: [${leakedFlags.join(", ")}]`);

    // Cleanup is automatic via snapshot/restore.
  }
}));
