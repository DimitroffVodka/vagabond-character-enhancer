/**
 * Luminary Class Features
 * Registry entries + runtime hooks for all Luminary features.
 */

import { MODULE_ID } from "../vagabond-character-enhancer.mjs";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

export const LUMINARY_REGISTRY = {
  // L1: Theurgy — Cast Spells using Mysticism
  // STATUS: system
  "theurgy": {
    class: "luminary", level: 1, flag: "luminary_theurgy", status: "system",
    description: "Cast Spells using Mysticism. Learn 4 Spells (must include Life and Light). Max Mana = 4 × Level."
  },

  // L1: Radiant Healer — Assured Healer Perk + healing dice explode
  // STATUS: todo — Perk is manual. Exploding healing dice needs hook on healing rolls.
  // The system may already support exploding via bonuses.globalExplode, but only
  // for damage. Healing roll explosion likely needs custom implementation.
  "radiant healer": {
    class: "luminary", level: 1, flag: "luminary_radiantHealer", status: "todo",
    description: "Gain Assured Healer Perk. Healing rolls from Spells can explode on their highest value."
  },

  // L2: Overheal — Excess healing goes to another being
  // STATUS: todo — needs hook on healing to detect excess and prompt for redirect
  "overheal": {
    class: "luminary", level: 2, flag: "luminary_overheal", status: "todo",
    description: "Excess HP from healing can be given to yourself or another Being you can see."
  },

  // L4: Ever-Cure — Healing removes a status
  // STATUS: todo — needs hook on healing to offer status removal
  "ever-cure": {
    class: "luminary", level: 4, flag: "luminary_everCure", status: "todo",
    description: "When you restore HP, end Charmed, Confused, Dazed, Frightened, or Sickened on Target."
  },

  // L6: Revivify — Revive dead + auto-revive self
  // STATUS: flavor — narrative mechanic, Life spell interaction
  "revivify": {
    class: "luminary", level: 6, flag: "luminary_revivify", status: "flavor",
    description: "Revive dead Beings (up to 1 hour) with Life Spell. Auto-revive self (1/day)."
  },

  // L8: Saving Grace — Healing dice also explode on 2
  // STATUS: todo — depends on Radiant Healer explosion implementation
  "saving grace": {
    class: "luminary", level: 8, flag: "luminary_savingGrace", status: "todo",
    description: "Healing rolls also explode on a roll of 2."
  },

  // L10: Life-Giver — Revived beings at 4 Fatigue max, no Life Fatigue
  // STATUS: flavor — modifies Revivify narrative
  "life-giver": {
    class: "luminary", level: 10, flag: "luminary_lifeGiver", status: "flavor",
    description: "Revived Beings start at 4 Fatigue max. They don't gain Fatigue from your Life Spell."
  }
};

/* -------------------------------------------- */
/*  Luminary Runtime Hooks                      */
/* -------------------------------------------- */

export const LuminaryFeatures = {
  _log(...args) {
    if (game.settings.get(MODULE_ID, "debugMode")) {
      console.log(`${MODULE_ID} | LuminaryFeatures |`, ...args);
    }
  },

  registerHooks() {
    // Luminary features center on healing mechanics:
    //   - Exploding healing dice (Radiant Healer, Saving Grace)
    //   - Excess healing redirect (Overheal)
    //   - Status removal on heal (Ever-Cure)
    // These need hooks on the system's healing flow.

    this._log("Hooks registered.");
  }
};
