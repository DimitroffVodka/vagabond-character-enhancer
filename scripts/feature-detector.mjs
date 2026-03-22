/**
 * Feature Detector
 * Scans actor class/ancestry/perk items and sets flags + managed Active Effects.
 */

import { MODULE_ID } from "./vagabond-character-enhancer.mjs";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

/**
 * Registry of known class features.
 * Keys are lowercase feature names, values describe the feature.
 * The `class` field groups features by class.
 * The `effects` field (optional) defines managed Active Effects to create.
 */
const CLASS_FEATURE_REGISTRY = {
  // --- Barbarian ---
  "rage": {
    class: "barbarian",
    flag: "barbarian_rage",
    description: "Die upsizing + exploding dice when Berserk with light/no armor"
  },
  "aggressor": {
    class: "barbarian",
    flag: "barbarian_aggressor",
    description: "+10 speed in first round of combat"
  },
  "fearmonger": {
    class: "barbarian",
    flag: "barbarian_fearmonger",
    description: "Frighten weaker nearby enemies on kill"
  },
  "mindless rancor": {
    class: "barbarian",
    flag: "barbarian_mindlessRancor",
    description: "Immunity to Charmed and Confused",
    effects: [
      {
        label: "Mindless Rancor",
        icon: "icons/svg/terror.svg",
        changes: [
          { key: "system.statusImmunities", mode: 2, value: "charmed" },
          { key: "system.statusImmunities", mode: 2, value: "confused" }
        ]
      }
    ]
  },
  "bloodthirsty": {
    class: "barbarian",
    flag: "barbarian_bloodthirsty",
    description: "Favor on attacks vs wounded targets"
  },
  "rip and tear": {
    class: "barbarian",
    flag: "barbarian_ripAndTear",
    description: "+2 per die damage reduction + damage bonus",
    effects: [
      {
        label: "Rip and Tear",
        icon: "icons/svg/sword.svg",
        changes: [
          { key: "system.incomingDamageReductionPerDie", mode: 2, value: "2" }
        ]
      }
    ]
  },

  // --- Rogue ---
  "sneak attack": {
    class: "rogue",
    flag: "rogue_sneakAttack",
    description: "Extra d4s on Favored attacks, scales with level"
  },
  "lethal weapon": {
    class: "rogue",
    flag: "rogue_lethalWeapon",
    description: "Sneak Attack on all Favored attacks"
  },
  "unflinching luck": {
    class: "rogue",
    flag: "rogue_unflinchingLuck",
    description: "Die face refund on failed block saves"
  },
  "evasive": {
    class: "rogue",
    flag: "rogue_evasive",
    description: "Ignore Hinder on Reflex Saves"
  },

  // --- Bard ---
  "virtuoso": {
    class: "bard",
    flag: "bard_virtuoso",
    description: "Performance check grants group buffs"
  },
  "song of rest": {
    class: "bard",
    flag: "bard_songOfRest",
    description: "HP recovery: Presence + Bard Level during breather"
  },
  "climax": {
    class: "bard",
    flag: "bard_climax",
    description: "Granted dice can explode on maximum roll"
  },
  "starstruck": {
    class: "bard",
    flag: "bard_starstruck",
    description: "Debuff enemies after successful Virtuoso"
  },
  "bravado": {
    class: "bard",
    flag: "bard_bravado",
    description: "Will Saves cannot be Hindered while not Incapacitated"
  },
  "awe-inspiring": {
    class: "bard",
    flag: "bard_aweInspiring",
    description: "Starstruck affects all nearby enemies"
  },

  // --- Dancer ---
  "step up": {
    class: "dancer",
    flag: "dancer_stepUp",
    description: "Grant ally bonus Action + 2d20 Reflex"
  },
  "double time": {
    class: "dancer",
    flag: "dancer_doubleTime",
    description: "Step Up targets 2 allies"
  },
  "choreographer": {
    class: "dancer",
    flag: "dancer_choreographer",
    description: "Step Up targets gain Favor + speed bonus"
  },
  "fleet of foot": {
    class: "dancer",
    flag: "dancer_fleetOfFoot",
    description: "Reflex crit bonus scaling with dancer level"
  },
  "don't stop me now": {
    class: "dancer",
    flag: "dancer_dontStopMeNow",
    description: "Convert Hinder to Favor on movement saves"
  },
  "flash of beauty": {
    class: "dancer",
    flag: "dancer_flashOfBeauty",
    description: "Critical Save grants two Actions"
  },

  // --- Alchemist ---
  "potency": {
    class: "alchemist",
    flag: "alchemist_potency",
    description: "Exploding dice on crafted alchemical weapons"
  },
  "big bang": {
    class: "alchemist",
    flag: "alchemist_bigBang",
    description: "Weapons explode on two highest values + 1d6 bonus"
  },
  "eureka": {
    class: "alchemist",
    flag: "alchemist_eureka",
    description: "Studied die on crit craft/alchemical attacks"
  }
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
