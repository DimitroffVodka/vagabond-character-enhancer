/**
 * VCE Active Effects Catalog
 *
 * Canonical home for Active Effect templates that VCE applies to actors.
 * Source-of-truth definitions live below in `CATALOG` (diffable, reviewable
 * in code) and are shipped as a Foundry v14 native ActiveEffect compendium
 * pack at `Compendium.vagabond-character-enhancer.vce-active-effects`. Stable
 * UUIDs are derived deterministically from each canonicalId so re-packs
 * produce identical IDs.
 *
 * Adding an entry: append to CATALOG with a unique canonicalId, then re-run
 *   node build-ae-pack.mjs
 *   npx fvtt package pack -n vce-active-effects --in packs/_source/vce-active-effects --out packs --id vagabond-character-enhancer --type Module
 * to regenerate the LevelDB pack. The deterministic ID derivation means
 * existing entries keep their UUIDs; only new entries get new IDs.
 *
 * Bootstrap on `ready` is now a one-shot legacy cleanup: deletes the old
 * hidden `_VCE Active Effects Catalog` world actor + the even older
 * `_VCE Aura Templates` actor that pre-catalog versions used. After both
 * are gone, bootstrap is effectively a no-op.
 *
 * Lookup API:
 *   uuidFor("bless-aura")  →  "Compendium.vagabond-character-enhancer.vce-active-effects.ActiveEffect.<id>"
 *   cloneFor("bless-aura") →  AE data object ready for createEmbeddedDocuments
 */

import { MODULE_ID, log } from "./utils.mjs";

const PACK_ID = "vagabond-character-enhancer.vce-active-effects";
const LEGACY_CATALOG_ACTOR_FLAG = "activeEffectsCatalogActor";

/* -------------------------------------------- */
/*  Catalog Definitions                          */
/* -------------------------------------------- */

/**
 * Each entry produces one ActiveEffect template document on the catalog
 * actor. Required:
 *   canonicalId — stable slug for lookup. Never change once shipped.
 *   name        — display name (visible on actors that receive a clone)
 *   img         — icon path
 *
 * Optional:
 *   description — shown in AE tooltip / config
 *   statuses    — array of status ids; gives the AE a token icon
 *   changes     — AE value modifications
 *   moduleFlags — { ... } merged into flags[MODULE_ID]
 */
export const CATALOG = [
  {
    canonicalId: "bless-aura",
    name: "Bless (Aura)",
    img: "icons/magic/holy/prayer-hands-glowing-yellow.webp",
    description: "+d4 bonus to Saves while inside the Bless aura.",
    statuses: ["blessed"],
    changes: [],
    moduleFlags: { auraTemplate: true, blessAE: true },
  },
  {
    canonicalId: "ward-aura",
    name: "Ward (Aura)",
    img: "icons/magic/defensive/shield-barrier-blue.webp",
    description: "Reactive damage reduction via the Ward caster's Cast Check while inside the aura.",
    statuses: ["warded"],
    changes: [],
    // `wardCasterId` is set per-clone at apply time — can't live on the
    // template because each caster has their own.
    moduleFlags: { auraTemplate: true, wardAE: true },
  },
  {
    canonicalId: "exalt-aura",
    name: "Exalt (Aura)",
    img: "icons/magic/holy/prayer-hands-glowing-yellow.webp",
    description: "+1 per damage die (+2 vs Undead/Hellspawn), +1 Will Saves vs Frightened.",
    statuses: ["exalted"],
    changes: [
      { key: "system.saves.will.bonus", mode: 2, value: "1" },
    ],
    moduleFlags: { auraTemplate: true },
  },

  /* ---- Class feature AEs (migrated from inline registry entries) ---- */

  {
    canonicalId: "barbarian-rage",
    name: "Rage",
    img: "icons/skills/melee/hand-grip-sword-red.webp",
    changes: [
      // DR 1 per die — always on; system gates behind berserk + light armor.
      // Die upsizing / exploding / damage bonus are on the dynamic "Rage (Active)"
      // companion AE created when Berserk toggles (see barbarian._registerRageHooks).
      { key: "system.incomingDamageReductionPerDie", mode: 2, value: "1" },
    ],
  },
  {
    canonicalId: "barbarian-mindless-rancor",
    name: "Mindless Rancor",
    img: "icons/magic/defensive/shield-barrier-deflect-gold.webp",
    changes: [
      { key: "system.statusImmunities", mode: 2, value: "charmed" },
      { key: "system.statusImmunities", mode: 2, value: "confused" },
    ],
  },
  {
    canonicalId: "barbarian-rip-and-tear",
    name: "Rip and Tear",
    img: "icons/skills/melee/strike-axe-blood-red.webp",
    changes: [
      // +1 more DR per die (stacks with Rage's 1 for total 2)
      { key: "system.incomingDamageReductionPerDie", mode: 2, value: "1" },
    ],
  },
  {
    canonicalId: "dancer-fleet-of-foot",
    name: "Fleet of Foot (Reflex Crit)",
    img: "icons/skills/movement/feet-winged-sandals-tan.webp",
    changes: [
      { key: "system.reflexCritBonus", mode: 2, value: "-1" },
    ],
  },
  {
    canonicalId: "druid-ancient-growth",
    name: "Ancient Growth (+1 Focus)",
    img: "icons/magic/nature/leaf-glow-triple-orange.webp",
    disabled: true,
    changes: [
      { key: "system.focus.maxBonus", mode: 2, value: "1" },
    ],
  },
  {
    canonicalId: "druid-savagery",
    name: "Savagery (+1 Armor)",
    img: "icons/creatures/abilities/bear-roar-bite-brown-green.webp",
    disabled: true,
    changes: [
      { key: "system.armorBonus", mode: 2, value: "1" },
    ],
  },
  {
    canonicalId: "monk-empowered-strikes",
    name: "Empowered Strikes",
    img: "icons/skills/melee/unarmed-punch-fist-yellow-red.webp",
    changes: [
      { key: "system.finesseDamageDieSizeBonus", mode: 2, value: "2" },
    ],
  },
  {
    canonicalId: "psychic-mental-fortress",
    name: "Mental Fortress",
    img: "icons/magic/control/control-influence-puppet.webp",
    // ADD mode (4) appends each name. Per system's Divine Resolve fix in CHANGELOG
    // v0.3.0+, each immunity is a SEPARATE change entry — the system splits on
    // commas internally but ADD mode of an array field needs distinct values.
    changes: [
      { key: "system.statusImmunities", mode: 4, value: "berserk",    priority: null },
      { key: "system.statusImmunities", mode: 4, value: "charmed",    priority: null },
      { key: "system.statusImmunities", mode: 4, value: "confused",   priority: null },
      { key: "system.statusImmunities", mode: 4, value: "frightened", priority: null },
    ],
  },
  {
    canonicalId: "pugilist-impact",
    name: "Impact",
    img: "icons/skills/melee/unarmed-punch-fist.webp",
    changes: [
      { key: "system.brawlDamageDieSizeBonus", mode: 2, value: "2" },
    ],
  },
  {
    canonicalId: "revelator-paragons-aura",
    name: "Paragon's Aura",
    img: "icons/magic/holy/prayer-hands-glowing-yellow.webp",
    changes: [
      { key: "system.focus.maxBonus", mode: 2, value: "1" },
    ],
  },
  {
    canonicalId: "revelator-divine-resolve",
    name: "Divine Resolve",
    img: "icons/magic/holy/barrier-shield-winged-cross.webp",
    changes: [
      { key: "system.statusImmunities", mode: 2, value: "blinded" },
      { key: "system.statusImmunities", mode: 2, value: "paralyzed" },
      { key: "system.statusImmunities", mode: 2, value: "sickened" },
    ],
  },
  {
    canonicalId: "revelator-sacrosanct",
    name: "Sacrosanct",
    img: "icons/magic/holy/chalice-glowing-gold.webp",
    changes: [
      { key: "system.saves.reflex.bonus", mode: 2, value: "2" },
      { key: "system.saves.endure.bonus", mode: 2, value: "2" },
      { key: "system.saves.will.bonus", mode: 2, value: "2" },
    ],
  },
  {
    canonicalId: "sorcerer-spell-slinger",
    name: "Spell-Slinger",
    img: "icons/magic/lightning/bolt-strike-blue.webp",
    changes: [
      { key: "system.castCritBonus", mode: 2, value: "-1" },
      { key: "system.spellDamageDieSize", mode: 5, value: "8" },
    ],
  },
  {
    canonicalId: "sorcerer-overpowered",
    name: "Overpowered",
    img: "icons/magic/lightning/bolt-strike-purple.webp",
    changes: [
      // Additional -1 on top of Spell-Slinger's -1 = total -2 = crit on 18
      { key: "system.castCritBonus", mode: 2, value: "-1" },
    ],
  },
  {
    canonicalId: "vanguard-wall-large",
    name: "Wall (Large)",
    img: "icons/equipment/shield/heater-crystal-blue.webp",
    // Shove size override handled by brawl-intent.mjs via feature flag.
    changes: [],
  },
  {
    canonicalId: "vanguard-wall-huge",
    name: "Wall (Huge)",
    img: "icons/equipment/shield/heater-crystal-blue.webp",
    changes: [],
  },
  {
    canonicalId: "wizard-manifold-mind",
    name: "Manifold Mind",
    img: "icons/magic/perception/eye-ringed-glow-angry-small-teal.webp",
    changes: [
      { key: "system.focus.maxBonus", mode: 2, value: "1" },
    ],
  },
  {
    canonicalId: "wizard-manifold-mind-3",
    name: "Manifold Mind (3)",
    img: "icons/magic/perception/eye-ringed-glow-angry-small-teal.webp",
    changes: [
      { key: "system.focus.maxBonus", mode: 2, value: "1" },
    ],
  },
  {
    canonicalId: "perk-spin-to-win",
    name: "Spin-to-Win",
    img: "icons/skills/melee/strike-sword-slashing-red.webp",
    changes: [
      { key: "system.cleaveTargets", mode: 2, value: "98" },
    ],
  },
];

/* -------------------------------------------- */
/*  Lookup API                                   */
/* -------------------------------------------- */

const _uuidCache = new Map();
let _packIndexPromise = null;

/**
 * Get the AE compendium pack. Returns null if missing (e.g., user hasn't
 * restarted Foundry server since the pack was added to module.json).
 * @returns {CompendiumCollection|null}
 */
function getCatalogPack() {
  return game.packs?.get(PACK_ID) ?? null;
}

/**
 * Build a canonicalId → UUID map by indexing the pack. Cached after the
 * first call. The pack index includes all flags so we can resolve without
 * loading each document.
 * @returns {Promise<Map<string, string>>}
 */
async function getCanonicalIndex() {
  if (_packIndexPromise) return _packIndexPromise;
  _packIndexPromise = (async () => {
    const pack = getCatalogPack();
    const map = new Map();
    if (!pack) return map;
    const index = await pack.getIndex({ fields: [`flags.${MODULE_ID}.canonicalId`] });
    for (const entry of index) {
      const cid = entry.flags?.[MODULE_ID]?.canonicalId;
      if (cid) map.set(cid, entry.uuid);
    }
    return map;
  })();
  return _packIndexPromise;
}

/**
 * Return a stable UUID for the canonicalId, or null if not in the pack.
 * Cached for the session.
 *
 * @param {string} canonicalId
 * @returns {Promise<string|null>}
 */
export async function uuidFor(canonicalId) {
  if (_uuidCache.has(canonicalId)) return _uuidCache.get(canonicalId);
  const index = await getCanonicalIndex();
  const uuid = index.get(canonicalId) ?? null;
  _uuidCache.set(canonicalId, uuid);
  return uuid;
}

/**
 * Resolve the AE template for the given canonicalId and return a plain
 * data object ready for `createEmbeddedDocuments("ActiveEffect")`. The
 * `_id` field is stripped so embedding produces a fresh document.
 *
 * @param {string} canonicalId
 * @returns {Promise<object|null>}
 */
export async function cloneFor(canonicalId) {
  const uuid = await uuidFor(canonicalId);
  if (!uuid) return null;
  const doc = await fromUuid(uuid);
  if (!doc) return null;
  const obj = doc.toObject();
  // Strip bookkeeping fields that the v14 data model rejects when null/source-less.
  // Notably `_stats` carries createdTime/modifiedTime nulls which fail schema
  // validation on createEmbeddedDocuments and cause it to silently return [].
  delete obj._id;
  delete obj._stats;
  delete obj.start;
  delete obj.folder;
  delete obj.sort;
  return obj;
}

/* -------------------------------------------- */
/*  Bootstrap (legacy cleanup only)             */
/* -------------------------------------------- */

/**
 * Verify the compendium pack is registered, then clean up legacy backing
 * stores from earlier catalog architectures. Safe to call multiple times;
 * the cleanups are best-effort and silent when there's nothing to do.
 *
 * Legacy actors to remove:
 *   - `_VCE Active Effects Catalog` (hidden world actor, v0.4.16 catalog)
 *   - `_VCE Aura Templates` (older pre-catalog Exalt migration)
 */
export async function bootstrapActiveEffectsCatalog() {
  const pack = getCatalogPack();
  if (!pack) {
    log("AECatalog", `Pack '${PACK_ID}' not registered. Did you restart the Foundry server after updating module.json?`);
    return;
  }

  // Validate the pack actually contains entries (smoke-check after install).
  const index = await getCanonicalIndex();
  const missing = CATALOG.filter(d => !index.has(d.canonicalId));
  if (missing.length > 0) {
    log("AECatalog", `Pack is missing ${missing.length} catalog entries: ${missing.map(d => d.canonicalId).join(", ")}. Re-run \`node build-ae-pack.mjs\` + \`fvtt package pack\`.`);
  } else {
    log("AECatalog", `Pack '${PACK_ID}' indexed: ${index.size} effects available.`);
  }

  // One-shot cleanup of older backing stores (GM only).
  if (!game.user.isGM) return;
  const legacyHiddenActor = game.actors.find(a => a.getFlag(MODULE_ID, LEGACY_CATALOG_ACTOR_FLAG));
  if (legacyHiddenActor) {
    try {
      await legacyHiddenActor.delete();
      log("AECatalog", `Deleted legacy hidden catalog actor (${legacyHiddenActor.name})`);
    } catch (err) {
      log("AECatalog", `Could not delete legacy hidden actor: ${err.message}`);
    }
  }
  const legacyTemplateActor = game.actors.find(a => a.getFlag(MODULE_ID, "auraTemplateActor"));
  if (legacyTemplateActor) {
    try {
      await legacyTemplateActor.delete();
      log("AECatalog", `Deleted legacy aura template actor (${legacyTemplateActor.name})`);
    } catch (err) {
      log("AECatalog", `Could not delete legacy template actor: ${err.message}`);
    }
  }
}
