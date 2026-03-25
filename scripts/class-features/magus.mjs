/**
 * Magus Class Features
 * Registry entries + runtime hooks for all Magus features.
 */

import { MODULE_ID } from "../vagabond-character-enhancer.mjs";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

export const MAGUS_REGISTRY = {
  // L1: Spellstriker — Gish Perk + Cast using Arcana
  // STATUS: system (casting) + flavor (perk grant)
  "spellstriker": {
    class: "magus", level: 1, flag: "magus_spellstriker", status: "system",
    description: "Gain Gish Perk. Cast Spells using Arcana. Learn 2 Spells (must include Ward). Max Mana = 2 × Level."
  },

  // L1: Esoteric Eye — Detect magic on target
  // STATUS: flavor — narrative action, no automation needed
  "esoteric eye": {
    class: "magus", level: 1, flag: "magus_esotericEye", status: "flavor",
    description: "Use Action or skip Move to learn if magic affects a Target you can see. Once per Shift (or 1 Mana)."
  },

  // L2: Spell Parry — Block Casts with Reflex/Touch/Remote delivery
  // STATUS: flavor — defensive choice, no mechanical enforcement needed
  "spell parry": {
    class: "magus", level: 2, flag: "magus_spellParry", status: "flavor",
    description: "Block Casts targeting you if Reflex Save, Touch, or Remote delivery. Crit Block dispels."
  },

  // L4: Arcane Recall — Swap a spell known
  // STATUS: flavor — downtime/rest action
  "arcane recall": {
    class: "magus", level: 4, flag: "magus_arcaneRecall", status: "flavor",
    description: "Use Action to swap one Spell Known (not Ward). Once per Rest, or 1 Fatigue for extra use."
  },

  // L6: Spell Surge — Reflect spells on high Block margin
  // STATUS: todo — needs hook on Block save margin to trigger reflect
  "spell surge": {
    class: "magus", level: 6, flag: "magus_spellSurge", status: "todo",
    description: "Block a Cast by 10+ → reflect it back at the Caster. At L10: triggers at 8+."
  },

  // L8: Aegis Obscura — Allsight + half magic damage with Ward
  // STATUS: todo — needs Ward focus detection + damage reduction hook
  "aegis obscura": {
    class: "magus", level: 8, flag: "magus_aegisObscura", status: "todo",
    description: "You and Ward Target have Allsight and half damage from magic sources."
  },

  // L10: Spell Surge Enhancement — triggers at 8+ instead of 10+
  // STATUS: todo — depends on Spell Surge implementation
  "spell surge enhancement": {
    class: "magus", level: 10, flag: "magus_spellSurgeEnhancement", status: "todo",
    description: "Spell Surge triggers when passing Block by 8+ instead of 10+."
  }
};

/* -------------------------------------------- */
/*  Magus Runtime Hooks                         */
/* -------------------------------------------- */

export const MagusFeatures = {
  _log(...args) {
    if (game.settings.get(MODULE_ID, "debugMode")) {
      console.log(`${MODULE_ID} | MagusFeatures |`, ...args);
    }
  },

  registerHooks() {
    this._log("Hooks registered.");
  }
};
