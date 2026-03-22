/**
 * Feature Detector
 * Scans actor class/ancestry/perk items and sets flags + managed Active Effects.
 */

import { MODULE_ID } from "./vagabond-character-enhancer.mjs";

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
  ...MERCHANT_REGISTRY
};

/**
 * Registry of known perk features.
 */
const PERK_FEATURE_REGISTRY = {
  "bully": {
    flag: "perk_bully",
    description: "Auto-create Grappled Creature weapon on grapple"
  },
  "fisticuffs": {
    flag: "perk_fisticuffs",
    description: "Post-hit Grapple/Shove on Favored brawl attacks"
  }
};

/**
 * Registry of known ancestry traits.
 */
const ANCESTRY_TRAIT_REGISTRY = {
  "beefy": {
    flag: "ancestry_beefy",
    ancestry: "orc",
    description: "Favor on Grapple/Shove checks"
  }
};

/* -------------------------------------------- */
/*  Feature Detector Singleton                  */
/* -------------------------------------------- */

export const FeatureDetector = {
  _debounceTimers: new Map(),

  /**
   * Log a debug message if debug mode is enabled.
   */
  _log(...args) {
    if (game.settings.get(MODULE_ID, "debugMode")) {
      console.log(`${MODULE_ID} | FeatureDetector |`, ...args);
    }
  },

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

    this._log("Hooks registered.");
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
    this._log(`Scanning ${characters.length} characters...`);
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
    for (const item of actor.items.filter(i => i.type === "class")) {
      const className = item.name.toLowerCase().trim();
      features._className = item.name;
      features._classLevel = level;

      // Scan levelFeatures
      const levelFeatures = item.system.levelFeatures ?? [];
      for (const feature of levelFeatures) {
        if (feature.level > level) continue;
        const featureName = feature.name.toLowerCase().trim();
        const registered = CLASS_FEATURE_REGISTRY[featureName];
        if (registered) {
          features[registered.flag] = true;
          this._log(`Detected: ${feature.name} (${registered.class}) on ${actor.name}`);
        }
      }
    }

    // --- Scan ancestry items ---
    for (const item of actor.items.filter(i => i.type === "ancestry")) {
      const desc = item.system.description?.toLowerCase() ?? "";
      const ancestryName = item.name.toLowerCase().trim();

      for (const [traitName, traitDef] of Object.entries(ANCESTRY_TRAIT_REGISTRY)) {
        // Check if the ancestry name or description mentions the trait
        if (desc.includes(traitName) || ancestryName.includes(traitDef.ancestry)) {
          // Only set if trait is actually in the ancestry's traits
          // For now, check description text
          if (desc.includes(traitName)) {
            features[traitDef.flag] = true;
            this._log(`Detected trait: ${traitName} on ${actor.name}`);
          }
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
          this._log(`Detected perk: ${item.name} on ${actor.name}`);
        }
      }
    }

    // --- Update flags ---
    const oldFeatures = actor.getFlag(MODULE_ID, "features") ?? {};
    await actor.setFlag(MODULE_ID, "features", features);

    // --- Manage Active Effects ---
    await this._syncManagedEffects(actor, features, oldFeatures);

    this._log(`Scan complete for ${actor.name}:`, features);
  },

  /**
   * Create/remove managed Active Effects based on detected features.
   */
  async _syncManagedEffects(actor, features, oldFeatures) {
    const existingManaged = actor.effects.filter(e => e.getFlag(MODULE_ID, "managed"));

    // Build set of effects that SHOULD exist
    const desiredEffects = new Map();

    for (const [featureName, featureDef] of Object.entries(CLASS_FEATURE_REGISTRY)) {
      if (!features[featureDef.flag]) continue;
      if (!featureDef.effects) continue;

      for (const effectDef of featureDef.effects) {
        const key = `${featureDef.flag}_${effectDef.label}`;
        desiredEffects.set(key, {
          ...effectDef,
          origin: `${MODULE_ID}.${featureDef.flag}`,
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

    // Remove effects that should no longer exist
    const toDelete = existingManaged.filter(e => {
      const key = e.getFlag(MODULE_ID, "effectKey");
      return !desiredEffects.has(key);
    });

    if (toDelete.length > 0) {
      this._log(`Removing ${toDelete.length} managed effects from ${actor.name}`);
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
        disabled: false,
        transfer: true
      });
    }

    if (toCreate.length > 0) {
      this._log(`Creating ${toCreate.length} managed effects on ${actor.name}:`, toCreate.map(e => e.name));
      await actor.createEmbeddedDocuments("ActiveEffect", toCreate);
    }
  }
};
