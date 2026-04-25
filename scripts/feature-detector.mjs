/**
 * Feature Detector
 * Scans actor class/ancestry/perk items and sets flags + managed Active Effects.
 */

import { MODULE_ID, log } from "./utils.mjs";
import { TalentPickDialog } from "./talent/talent-pick-dialog.mjs";

// Import class registries — each class file owns all its feature definitions
import { BARBARIAN_REGISTRY } from "./class-features/barbarian.mjs";
import { ROGUE_REGISTRY } from "./class-features/rogue.mjs";
import { BARD_REGISTRY } from "./class-features/bard.mjs";
import { DANCER_REGISTRY } from "./class-features/dancer.mjs";
import { ALCHEMIST_REGISTRY } from "./class-features/alchemist.mjs";
import { FIGHTER_REGISTRY } from "./class-features/fighter.mjs";
import { VANGUARD_REGISTRY } from "./class-features/vanguard.mjs";
import { PUGILIST_REGISTRY } from "./class-features/pugilist.mjs";
import { HUNTER_REGISTRY } from "./class-features/hunter.mjs";
import { GUNSLINGER_REGISTRY } from "./class-features/gunslinger.mjs";
import { SORCERER_REGISTRY } from "./class-features/sorcerer.mjs";
import { WIZARD_REGISTRY } from "./class-features/wizard.mjs";
import { WITCH_REGISTRY } from "./class-features/witch.mjs";
import { DRUID_REGISTRY } from "./class-features/druid.mjs";
import { LUMINARY_REGISTRY } from "./class-features/luminary.mjs";
import { MAGUS_REGISTRY } from "./class-features/magus.mjs";
import { REVELATOR_REGISTRY } from "./class-features/revelator.mjs";
import { MERCHANT_REGISTRY } from "./class-features/merchant.mjs";
import { MONK_REGISTRY } from "./class-features/monk.mjs";
import { SUMMONER_REGISTRY } from "./class-features/summoner.mjs";

// Import ancestry registries — each ancestry file owns all its trait definitions
import { HUMAN_TRAITS } from "./ancestry-features/human.mjs";
import { DWARF_TRAITS } from "./ancestry-features/dwarf.mjs";
import { ELF_TRAITS } from "./ancestry-features/elf.mjs";
import { HALFLING_TRAITS } from "./ancestry-features/halfling.mjs";
import { DRAKEN_TRAITS } from "./ancestry-features/draken.mjs";
import { GOBLIN_TRAITS } from "./ancestry-features/goblin.mjs";
import { ORC_TRAITS } from "./ancestry-features/orc.mjs";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

/**
 * Combined registry of all class features.
 * Each class file exports its own registry, merged here via spread.
 * Keys are lowercase feature names matching the class compendium's levelFeatures.
 * The `effects` field (optional) defines managed Active Effects to create.
 *
 * NOTE: Some feature names collide across classes (e.g. "evasive" exists in
 * both Dancer and Rogue). The flat spread below means the last entry wins.
 * To handle collisions, _CLASS_FEATURE_MULTI maps each name to an array of
 * all entries, and _lookupFeature picks the one matching the actor's class.
 */
const _CLASS_REGISTRIES = [
  BARBARIAN_REGISTRY, ROGUE_REGISTRY, BARD_REGISTRY, DANCER_REGISTRY,
  ALCHEMIST_REGISTRY, FIGHTER_REGISTRY, VANGUARD_REGISTRY, PUGILIST_REGISTRY,
  HUNTER_REGISTRY, GUNSLINGER_REGISTRY, SORCERER_REGISTRY, WIZARD_REGISTRY,
  WITCH_REGISTRY, DRUID_REGISTRY, LUMINARY_REGISTRY, MAGUS_REGISTRY,
  REVELATOR_REGISTRY, MERCHANT_REGISTRY, MONK_REGISTRY, SUMMONER_REGISTRY
];

// Flat registry (last-wins) — still used for managed AE sync and legacy lookups
const CLASS_FEATURE_REGISTRY = Object.assign({}, ..._CLASS_REGISTRIES);

// Multi-map: featureName → [entry, entry, ...] — handles name collisions
const _CLASS_FEATURE_MULTI = {};
for (const registry of _CLASS_REGISTRIES) {
  for (const [name, entry] of Object.entries(registry)) {
    if (!_CLASS_FEATURE_MULTI[name]) _CLASS_FEATURE_MULTI[name] = [];
    _CLASS_FEATURE_MULTI[name].push(entry);
  }
}

/**
 * Look up a feature by name, preferring the entry whose `class` matches className.
 * Falls back to the first entry if no class match (shouldn't happen normally).
 */
function _lookupFeature(featureName, className) {
  const entries = _CLASS_FEATURE_MULTI[featureName];
  if (!entries || entries.length === 0) return null;
  if (entries.length === 1) return entries[0];
  // Multiple entries — pick the one matching the actor's class
  const classMatch = entries.find(e => e.class === className);
  return classMatch || entries[0];
}

// Import perk registry
import { PERK_REGISTRY } from "./perk-features.mjs";

/**
 * Combined registry of all ancestry traits.
 * Each ancestry file exports its own registry, merged here via spread.
 */
const ANCESTRY_TRAIT_REGISTRY = {
  ...HUMAN_TRAITS,
  ...DWARF_TRAITS,
  ...ELF_TRAITS,
  ...HALFLING_TRAITS,
  ...DRAKEN_TRAITS,
  ...GOBLIN_TRAITS,
  ...ORC_TRAITS
};

/**
 * Combined registry of all perk features.
 */
const PERK_FEATURE_REGISTRY = PERK_REGISTRY;

/* -------------------------------------------- */
/*  Psychic Talent pick-on-detect               */
/* -------------------------------------------- */

/**
 * Per-actor async lock so re-entrant scans (e.g., re-render mid-pick) don't
 * open a second picker while the first is still awaiting a player decision.
 */
const _psychicPickLocks = new Map(); // actorId → true while picker is running

/**
 * Tier table: level → how many Talent picks the actor earns at that tier.
 */
const PSYCHIC_PICK_TIERS = [
  { tier: 1, count: 3 },
  { tier: 3, count: 1 },
  { tier: 5, count: 1 },
  { tier: 7, count: 1 },
  { tier: 9, count: 1 },
];

/**
 * Defensive backfill: copies causedStatuses / critCausedStatuses /
 * damageDieSize from each Talent's source spell onto the embedded talent
 * item, so the system's status-application path can read them.
 *
 * Why this exists: Talent items can end up with empty status data in two
 * cases:
 *   1. They were created on the actor BEFORE the schema extension landed
 *      (schema gained the fields later — old embedded items don't have
 *      them populated).
 *   2. The compendium migration ran before Foundry F5'd, so writes were
 *      against an old schema and got silently stripped.
 *
 * Idempotent: only updates talents where aliasOf is set AND causedStatuses
 * is currently empty.
 *
 * @param {Actor} actor
 */
async function _backfillTalentStatusData(actor) {
  const TALENT_TYPE = `${MODULE_ID}.talent`;
  const stale = actor.items.filter(i =>
    i.type === TALENT_TYPE
    && (i.system.aliasOf ?? "").trim() !== ""
    && !(i.system.causedStatuses?.length > 0)
  );
  if (stale.length === 0) return;

  const spellPack = game.packs.get("vagabond.spells");
  if (!spellPack) return;
  const sourceSpells = await spellPack.getDocuments();

  for (const t of stale) {
    const aliasName = t.system.aliasOf.trim().toLowerCase();
    const src = sourceSpells.find(s => s.name.toLowerCase() === aliasName);
    if (!src) continue;
    const cs  = foundry.utils.deepClone(src.system.causedStatuses ?? []);
    const ccs = foundry.utils.deepClone(src.system.critCausedStatuses ?? []);
    // Only write if the source actually has data — avoids no-op writes
    // for talents whose source spell carries no statuses (e.g., Levitate).
    if (cs.length === 0 && ccs.length === 0 && src.system.damageDieSize == null) continue;
    await t.update({
      "system.causedStatuses":     cs,
      "system.critCausedStatuses": ccs,
      "system.damageDieSize":      src.system.damageDieSize ?? null,
    });
    log("TalentBackfill", `Backfilled status data for ${t.name} on ${actor.name} from ${src.name}`);
  }
}

/**
 * Check whether the given actor needs to pick Talents for any outstanding
 * Psychic level tier, and if so open the pick dialog sequentially.
 *
 * Called from FeatureDetector.scan() after the class-scan block.
 *
 * @param {Actor} actor
 */
async function _checkPsychicTalentPicks(actor) {
  // Guard: only the GM fires the dialog (clients don't have pack write access).
  if (!game.user.isGM) return;

  // Guard: actor must have a Psychic class item.
  const psychic = actor.items.find(i => i.type === "class" && i.name === "Psychic");
  if (!psychic) return;

  // Defensive backfill before any pick dialog or cast UX runs.
  await _backfillTalentStatusData(actor);

  // Per-actor re-entrancy lock.
  if (_psychicPickLocks.has(actor.id)) return;
  _psychicPickLocks.set(actor.id, true);

  try {
    // Use the class item's own level field (same field the system exposes per item).
    const level = psychic.system.level ?? 1;

    // Already-completed tiers are stored as an array of tier numbers.
    let picked = actor.getFlag(MODULE_ID, "psychicTalentsPicked") ?? [];

    for (const { tier, count } of PSYCHIC_PICK_TIERS) {
      if (level < tier) break;        // tiers are sorted ascending; nothing else applies
      if (picked.includes(tier)) continue; // already done this tier

      log("FeatureDetector", `Psychic tier ${tier} pending for ${actor.name} — opening picker (${count} picks)`);

      const result = await TalentPickDialog.show(actor, count);

      if (!result?.length) {
        // Player cancelled or closed the dialog — do NOT mark the tier complete.
        // The picker will re-fire on the next scan so the player can't skip it forever.
        log("FeatureDetector", `Psychic tier ${tier} pick cancelled for ${actor.name}`);
        return; // stop processing further tiers this scan
      }

      // Create the chosen Talent items on the actor.
      const pack = game.packs.get(`${MODULE_ID}.vce-talents`);
      if (!pack) {
        ui.notifications.error(`VCE: Talent compendium (${MODULE_ID}.vce-talents) not found — cannot grant Talents.`);
        return;
      }

      const docs = await Promise.all(result.map(r => pack.getDocument(r.id)));
      const itemData = docs.filter(Boolean).map(d => d.toObject());
      await actor.createEmbeddedDocuments("Item", itemData);

      // Mark this tier complete so the picker doesn't re-fire.
      const newPicked = [...picked, tier];
      await actor.setFlag(MODULE_ID, "psychicTalentsPicked", newPicked);
      // Update local copy so the next loop iteration sees the updated state.
      picked = newPicked;

      log("FeatureDetector", `Psychic tier ${tier} complete for ${actor.name}: ${result.map(r => r.name).join(", ")}`);
    }
  } finally {
    _psychicPickLocks.delete(actor.id);
  }
}

/* -------------------------------------------- */
/*  Feature Detector Singleton                  */
/* -------------------------------------------- */

export const FeatureDetector = {
  _debounceTimers: new Map(),


  /**
   * Register all hooks for automatic feature detection.
   */
  registerHooks() {
    // Rescan when items are added/removed
    Hooks.on("createItem", (item) => {
      if (["class", "ancestry", "perk", "spell"].includes(item.type) && item.actor) {
        this._debounceScan(item.actor);
      }
    });

    Hooks.on("deleteItem", (item) => {
      if (["class", "ancestry", "perk", "spell"].includes(item.type) && item.actor) {
        this._debounceScan(item.actor);
      }
    });

    // Rescan when items are updated (e.g., feature name changes)
    Hooks.on("updateItem", (item, changes) => {
      if (["class", "ancestry", "perk", "spell"].includes(item.type) && item.actor) {
        this._debounceScan(item.actor);
      }
    });

    // Rescan when actor level changes
    Hooks.on("updateActor", (actor, changes) => {
      if (actor.type === "character" && changes.system?.attributes?.level) {
        this._debounceScan(actor);
      }
    });

    log("FeatureDetector","Hooks registered.");
  },

  /**
   * Debounce scan to avoid multiple rapid rescans.
   */
  _debounceScan(actor) {
    if (this._debounceTimers.has(actor.id)) {
      clearTimeout(this._debounceTimers.get(actor.id));
    }
    this._debounceTimers.set(actor.id, setTimeout(() => {
      this._debounceTimers.delete(actor.id);
      this.scan(actor);
    }, 100));
  },

  /**
   * Scan all character actors in the world.
   */
  async scanAll() {
    if (!game.user.isGM) return;
    const characters = game.actors.filter(a => a.type === "character");
    log("FeatureDetector",`Scanning ${characters.length} characters...`);
    for (const actor of characters) {
      await this.scan(actor);
    }
  },

  /**
   * Scan a single actor and update flags + managed effects.
   */
  async scan(actor) {
    if (!actor || actor.type !== "character") return;
    if (!game.user.isGM) return;

    if (!game.settings.get(MODULE_ID, "enableClassFeatures")) return;

    const features = {};
    const level = actor.system.attributes?.level?.value ?? 1;

    // --- Scan class items ---
    // Also store UUID so managed AEs can reference the class item as their origin/source
    for (const item of actor.items.filter(i => i.type === "class")) {
      const className = item.name.toLowerCase().trim();
      features._className = item.name;
      features._classLevel = level;
      features._classUuid = item.uuid;

      // Scan levelFeatures
      const levelFeatures = item.system.levelFeatures ?? [];
      for (const feature of levelFeatures) {
        if (feature.level > level) continue;
        const featureName = feature.name.toLowerCase().trim();
        const registered = _lookupFeature(featureName, className);
        if (registered) {
          features[registered.flag] = true;
          log("FeatureDetector",`Detected: ${feature.name} (${registered.class}) on ${actor.name}`);
        }
      }
    }

    // --- Scan ancestry items ---
    for (const item of actor.items.filter(i => i.type === "ancestry")) {
      const ancestryName = item.name.toLowerCase().trim();
      features._ancestryName = item.name;

      // Match traits by ancestry name — each trait's `ancestry` field
      // tells us which ancestry it belongs to
      for (const [traitName, traitDef] of Object.entries(ANCESTRY_TRAIT_REGISTRY)) {
        if (traitDef.ancestry === ancestryName) {
          features[traitDef.flag] = true;
          log("FeatureDetector",`Detected trait: ${traitName} (${traitDef.ancestry}) on ${actor.name}`);
        }
      }
    }

    // --- Scan perk items ---
    if (game.settings.get(MODULE_ID, "enablePerkFeatures")) {
      for (const item of actor.items.filter(i => i.type === "perk")) {
        const perkName = item.name.toLowerCase().trim();
        const registered = PERK_FEATURE_REGISTRY[perkName];
        if (registered) {
          features[registered.flag] = true;
          log("FeatureDetector",`Detected perk: ${item.name} on ${actor.name}`);
        }
      }
    }

    // --- Scan spell items for automation-relevant spells ---
    for (const item of actor.items.filter(i => i.type === "spell")) {
      if (item.name.toLowerCase().trim() === "polymorph") {
        features.has_polymorph = true;
        log("FeatureDetector", `Detected Polymorph spell on ${actor.name}`);
        break;
      }
    }

    // --- Update flags (skip write if nothing changed) ---
    // IMPORTANT: unsetFlag + setFlag instead of just setFlag, because setFlag
    // deep-merges and would preserve stale flags (e.g. a level 8 feature flag
    // lingering after the actor drops back to level 3).
    const oldFeatures = actor.getFlag(MODULE_ID, "features") ?? {};
    const changed = JSON.stringify(oldFeatures) !== JSON.stringify(features);
    if (changed) {
      await actor.unsetFlag(MODULE_ID, "features");
      await actor.setFlag(MODULE_ID, "features", features);
    }

    // --- Always sync managed Active Effects ---
    // Run even when features haven't changed, because new AE definitions
    // (e.g., perk effects added in a module update) need to be created for
    // actors whose feature flags were already set in a previous scan.
    await this._syncManagedEffects(actor, features, oldFeatures);

    // Always fire postScan so modules can sync item-level data (e.g., spell explosion)
    Hooks.callAll(`${MODULE_ID}.postScan`, actor, features);

    // --- Psychic: auto-fire Talent pick dialog for any outstanding tier ---
    // Runs after flags/effects are committed so the Psychic class is fully detected.
    await _checkPsychicTalentPicks(actor);

    log("FeatureDetector",`Scan complete for ${actor.name}:`, features);
  },

  /**
   * Create/remove managed Active Effects based on detected features.
   */
  async _syncManagedEffects(actor, features, oldFeatures) {
    const existingManaged = actor.effects.filter(e => e.getFlag(MODULE_ID, "managed"));

    // Build set of effects that SHOULD exist
    const desiredEffects = new Map();

    // Use the class item's UUID as origin so the effects panel shows the class name as "Source"
    const classUuid = features._classUuid || null;

    // Check class feature registry
    for (const [featureName, featureDef] of Object.entries(CLASS_FEATURE_REGISTRY)) {
      if (!features[featureDef.flag]) continue;
      if (!featureDef.effects) continue;

      for (const effectDef of featureDef.effects) {
        const key = `${featureDef.flag}_${effectDef.label}`;
        desiredEffects.set(key, {
          ...effectDef,
          origin: classUuid || `${MODULE_ID}.${featureDef.flag}`,
          flags: {
            [MODULE_ID]: {
              managed: true,
              featureFlag: featureDef.flag,
              effectKey: key
            }
          }
        });
      }
    }

    // Check perk feature registry
    for (const [perkName, perkDef] of Object.entries(PERK_FEATURE_REGISTRY)) {
      if (!features[perkDef.flag]) continue;
      if (!perkDef.effects) continue;

      for (const effectDef of perkDef.effects) {
        const key = `${perkDef.flag}_${effectDef.label}`;
        desiredEffects.set(key, {
          ...effectDef,
          origin: `${MODULE_ID}.${perkDef.flag}`,
          flags: {
            [MODULE_ID]: {
              managed: true,
              featureFlag: perkDef.flag,
              effectKey: key
            }
          }
        });
      }
    }

    // Allow class feature modules to dynamically modify effect definitions
    // (e.g., Valor scaling crit bonus with level, Deep Pockets scaling slots)
    Hooks.callAll(`${MODULE_ID}.preSyncEffects`, actor, desiredEffects);

    // Remove effects that should no longer exist
    const toDelete = existingManaged.filter(e => {
      const key = e.getFlag(MODULE_ID, "effectKey");
      return !desiredEffects.has(key);
    });

    if (toDelete.length > 0) {
      log("FeatureDetector",`Removing ${toDelete.length} managed effects from ${actor.name}`);
      await actor.deleteEmbeddedDocuments("ActiveEffect", toDelete.map(e => e.id));
    }

    // Create effects that don't exist yet
    const existingKeys = new Set(existingManaged.map(e => e.getFlag(MODULE_ID, "effectKey")));
    const toCreate = [];

    for (const [key, effectDef] of desiredEffects) {
      if (existingKeys.has(key)) continue;
      toCreate.push({
        name: effectDef.label,
        icon: effectDef.icon,
        origin: effectDef.origin,
        flags: effectDef.flags,
        changes: effectDef.changes,
        disabled: effectDef.disabled ?? false,
        transfer: true
      });
    }

    if (toCreate.length > 0) {
      log("FeatureDetector",`Creating ${toCreate.length} managed effects on ${actor.name}:`, toCreate.map(e => e.name));
      await actor.createEmbeddedDocuments("ActiveEffect", toCreate);
    }
  }
};
