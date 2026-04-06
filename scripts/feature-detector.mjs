/**
 * Feature Detector
 * Scans actor class/ancestry/perk items and sets flags + managed Active Effects.
 */

import { MODULE_ID, log } from "./utils.mjs";

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
 */
const CLASS_FEATURE_REGISTRY = {
  ...BARBARIAN_REGISTRY,
  ...ROGUE_REGISTRY,
  ...BARD_REGISTRY,
  ...DANCER_REGISTRY,
  ...ALCHEMIST_REGISTRY,
  ...FIGHTER_REGISTRY,
  ...VANGUARD_REGISTRY,
  ...PUGILIST_REGISTRY,
  ...HUNTER_REGISTRY,
  ...GUNSLINGER_REGISTRY,
  ...SORCERER_REGISTRY,
  ...WIZARD_REGISTRY,
  ...WITCH_REGISTRY,
  ...DRUID_REGISTRY,
  ...LUMINARY_REGISTRY,
  ...MAGUS_REGISTRY,
  ...REVELATOR_REGISTRY,
  ...MERCHANT_REGISTRY,
  ...MONK_REGISTRY,
  ...SUMMONER_REGISTRY
};

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
      if (["class", "ancestry", "perk"].includes(item.type) && item.actor) {
        this._debounceScan(item.actor);
      }
    });

    Hooks.on("deleteItem", (item) => {
      if (["class", "ancestry", "perk"].includes(item.type) && item.actor) {
        this._debounceScan(item.actor);
      }
    });

    // Rescan when items are updated (e.g., feature name changes)
    Hooks.on("updateItem", (item, changes) => {
      if (["class", "ancestry", "perk"].includes(item.type) && item.actor) {
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
        const registered = CLASS_FEATURE_REGISTRY[featureName];
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

    // --- Update flags (skip write if nothing changed) ---
    // IMPORTANT: unsetFlag + setFlag instead of just setFlag, because setFlag
    // deep-merges and would preserve stale flags (e.g. a level 8 feature flag
    // lingering after the actor drops back to level 3).
    const oldFeatures = actor.getFlag(MODULE_ID, "features") ?? {};
    const changed = JSON.stringify(oldFeatures) !== JSON.stringify(features);
    if (changed) {
      await actor.unsetFlag(MODULE_ID, "features");
      await actor.setFlag(MODULE_ID, "features", features);
      // --- Manage Active Effects (only when features changed) ---
      await this._syncManagedEffects(actor, features, oldFeatures);
    }

    // Always fire postScan so modules can sync item-level data (e.g., spell explosion)
    Hooks.callAll(`${MODULE_ID}.postScan`, actor, features);

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
