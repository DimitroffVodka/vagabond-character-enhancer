/**
 * VCE Active Effects Catalog
 *
 * Canonical home for Active Effect templates that VCE applies to actors.
 * Source-of-truth definitions live below in `CATALOG` (diffable, reviewable
 * in code); runtime instances live as embedded effects on a single hidden
 * world actor named `_VCE Active Effects Catalog`. Stable UUIDs come out
 * the back: `Actor.<catalogId>.ActiveEffect.<aeId>`.
 *
 * Why a hidden actor rather than a real compendium pack:
 *   - Foundry reads `module.json` packs at process startup, so adding a
 *     pack would require every user to restart Foundry — not a smooth
 *     migration story.
 *   - Empty LevelDB pack directories aren't valid without authored
 *     content; offline authoring needs the Foundry CLI.
 *   - The hidden-actor approach bootstraps idempotently on `ready` and
 *     produces stable UUIDs that Foundry's `applyActiveEffect` Region
 *     behavior accepts identically.
 *   - Future migration to a real compendium pack is a backing-store swap;
 *     the lookup API (uuidFor / cloneFor / canonicalId) stays unchanged.
 *
 * Adding an entry: append to CATALOG with a unique canonicalId. Bootstrap
 * on next world load picks it up and writes the new AE to the hidden
 * actor. Idempotent — re-bootstrap skips existing entries.
 *
 * Lookup API:
 *   uuidFor("bless-aura")  →  "Actor.<id>.ActiveEffect.<id>"
 *   cloneFor("bless-aura") →  AE data object ready for createEmbeddedDocuments
 */

import { MODULE_ID, log } from "./utils.mjs";

const CATALOG_ACTOR_NAME = "_VCE Active Effects Catalog";
const CATALOG_ACTOR_FLAG = "activeEffectsCatalogActor";

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
    img: "icons/magic/nature/leaf-glow-yellow.webp",
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
    img: "icons/skills/melee/unarmed-punch-fist-yellow.webp",
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
/*  Backing Storage (Hidden Actor)               */
/* -------------------------------------------- */

const _uuidCache = new Map();
let _cachedActor = null;

/**
 * Find or create the hidden catalog actor that owns the template AEs.
 * GM-only bootstrap; players get a read-only reference once it exists.
 * @returns {Promise<Actor|null>}
 */
async function getCatalogActor() {
  if (_cachedActor && game.actors.get(_cachedActor.id)) return _cachedActor;
  let actor = game.actors.find(a => a.getFlag(MODULE_ID, CATALOG_ACTOR_FLAG));
  if (actor) {
    _cachedActor = actor;
    return actor;
  }
  if (!game.user.isGM) return null;
  actor = await Actor.create({
    name: CATALOG_ACTOR_NAME,
    type: "npc",
    img: "icons/svg/aura.svg",
    ownership: { default: 1 }, // OBSERVER — players read, can't edit
    flags: { [MODULE_ID]: { [CATALOG_ACTOR_FLAG]: true } },
  });
  _cachedActor = actor;
  return actor;
}

/* -------------------------------------------- */
/*  Lookup API                                   */
/* -------------------------------------------- */

/**
 * Return a stable UUID for the canonicalId, or null if the entry hasn't
 * been bootstrapped yet. Cached for the session.
 *
 * @param {string} canonicalId
 * @returns {Promise<string|null>}
 */
export async function uuidFor(canonicalId) {
  if (_uuidCache.has(canonicalId)) return _uuidCache.get(canonicalId);
  const actor = await getCatalogActor();
  if (!actor) return null;
  const ae = actor.effects.find(e => e.getFlag(MODULE_ID, "canonicalId") === canonicalId);
  if (!ae) {
    _uuidCache.set(canonicalId, null);
    return null;
  }
  const uuid = ae.uuid;
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
  delete obj._id;
  return obj;
}

/* -------------------------------------------- */
/*  Bootstrap                                    */
/* -------------------------------------------- */

/**
 * Ensure every CATALOG entry exists on the catalog actor. Idempotent —
 * only creates missing entries. GM-only (Actor.create + AE embedding
 * both require it). Safe to call multiple times.
 */
export async function bootstrapActiveEffectsCatalog() {
  if (!game.user.isGM) return;
  const actor = await getCatalogActor();
  if (!actor) {
    log("AECatalog", "Could not create or find the catalog actor — skipping bootstrap.");
    return;
  }

  const presentByCanonical = new Map();
  for (const ae of actor.effects) {
    const cid = ae.getFlag(MODULE_ID, "canonicalId");
    if (cid) presentByCanonical.set(cid, ae);
  }

  const toCreate = [];
  for (const def of CATALOG) {
    if (presentByCanonical.has(def.canonicalId)) continue;
    toCreate.push({
      name: def.name,
      img: def.img,
      description: def.description ?? "",
      statuses: def.statuses ?? [],
      changes: def.changes ?? [],
      disabled: def.disabled ?? false,
      flags: {
        [MODULE_ID]: {
          canonicalId: def.canonicalId,
          ...(def.moduleFlags ?? {}),
        },
      },
    });
  }

  if (toCreate.length > 0) {
    await actor.createEmbeddedDocuments("ActiveEffect", toCreate);
    log("AECatalog", `Bootstrapped ${toCreate.length} catalog entries: ${toCreate.map(d => d.flags[MODULE_ID].canonicalId).join(", ")}`);
    _uuidCache.clear();
  }

  // One-shot cleanup: an older path (v14-pre-catalog Exalt migration)
  // created a separate "_VCE Aura Templates" actor with `auraTemplateActor:
  // true`. The catalog supersedes it; the prior actor is now orphaned. Best
  // effort delete; ignore if absent or permission-denied.
  const legacy = game.actors.find(a => a.getFlag(MODULE_ID, "auraTemplateActor"));
  if (legacy && legacy.id !== actor.id) {
    try {
      await legacy.delete();
      log("AECatalog", `Deleted orphaned legacy template actor (${legacy.name})`);
    } catch (err) {
      log("AECatalog", `Could not delete legacy actor: ${err.message}`);
    }
  }
}
