/**
 * Tier C — perk flag-presence smoke tests.
 * Auto-generated from PERK_REGISTRY: one test per entry.
 * Each test adds the perk item to _smoke-TestPC, rescans, and asserts
 * the flag lands. Where entry.effects is declared, each named AE is also
 * asserted present.
 *
 * Cleanup is automatic via runner snapshot/restore — items and AEs
 * added during a test are removed before the next test begins.
 */
import { MODULE_ID } from "../../../utils.mjs";
import { PERK_REGISTRY } from "../../../perk-features.mjs";
import { TIER_C_SKIPS, TIER_C_OVERRIDES } from "../../tier-c-config.mjs";

// System perks live in vagabond.perks (104 entries).
// vagabond-character-enhancer.vce-perks is VCE homebrew only (Summoner etc.).
const PERK_PACK = "vagabond.perks";

function _slug(name) {
  return name.replace(/\s+/g, "-").toLowerCase();
}

function _makePerkTest(perkName, entry) {
  return {
    id: `perk.${_slug(perkName)}`,
    name: `Perk: ${perkName}`,
    tier: "c",
    usesFixtures: ["TestPC"],
    run: async ({ fixtures, assert, wait }) => {
      const a = fixtures.TestPC;
      const pack = game.packs.get(PERK_PACK);
      if (!pack) {
        assert(false, `Pack ${PERK_PACK} not found in world`);
        return;
      }
      const idx = await pack.getIndex();
      const found = idx.find(e => e.name.toLowerCase() === perkName.toLowerCase());
      if (!found) {
        assert(false, `Perk "${perkName}" not found in compendium ${PERK_PACK}`);
        return;
      }
      const doc = await pack.getDocument(found._id);
      const created = await a.createEmbeddedDocuments("Item", [doc.toObject()]);
      if (!created?.length) {
        assert(false, `Failed to create perk item "${perkName}" on TestPC`);
        return;
      }
      await game.vagabondCharacterEnhancer.rescan(a);
      await wait(150);
      const features = a.getFlag(MODULE_ID, "features") ?? {};
      assert(
        features[entry.flag] === true,
        `expected flags.features.${entry.flag} === true; got ${JSON.stringify(features[entry.flag])}`
      );
      if (Array.isArray(entry.effects)) {
        for (const eff of entry.effects) {
          const ae = a.effects.find(x => x.name === eff.label);
          assert(!!ae, `expected AE "${eff.label}" present; effects: ${a.effects.map(e => e.name).join(", ")}`);
          if (ae && Array.isArray(eff.changes)) {
            assert(
              ae.changes.length === eff.changes.length,
              `AE "${eff.label}" changes count mismatch: expected ${eff.changes.length}, got ${ae.changes.length}`
            );
          }
        }
      }
      // Cleanup is automatic via runner snapshot/restore — items added are wiped.
    }
  };
}

export const tests = (() => {
  const out = [];
  for (const [name, entry] of Object.entries(PERK_REGISTRY)) {
    const skipReason = TIER_C_SKIPS.perks?.[name];
    if (skipReason) {
      out.push({
        id: `perk.${_slug(name)}`,
        name: `Perk: ${name}`,
        tier: "c",
        usesFixtures: [],
        skip: () => true,
        skipReason,
        run: async () => {}
      });
      continue;
    }
    const overridePath = TIER_C_OVERRIDES.perks?.[name];
    if (overridePath) {
      out.push({
        id: `perk.${_slug(name)}`,
        name: `Perk: ${name} (override)`,
        tier: "c",
        usesFixtures: ["TestPC"],
        run: async (ctx) => {
          const mod = await import(overridePath);
          await mod.run({ ...ctx, perkName: name, entry });
        }
      });
      continue;
    }
    out.push(_makePerkTest(name, entry));
  }
  return out;
})();
