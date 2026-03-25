/**
 * Gunslinger Class Features
 * Registry entries + runtime hooks for all Gunslinger features.
 */

import { MODULE_ID } from "../vagabond-character-enhancer.mjs";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

export const GUNSLINGER_REGISTRY = {
  // L1: Quick Draw — Marksmanship Perk + free ranged attack before combat
  // STATUS: todo — Pre-combat attack needs combat start hook
  "quick draw": {
    class: "gunslinger", level: 1, flag: "gunslinger_quickDraw", status: "todo",
    description: "Gain Marksmanship Perk. Make one Ranged attack before first Turn (Hindered if 2H)."
  },

  // L1: Deadeye — Cascading crit threshold on consecutive hits
  // STATUS: todo — Needs turn-based crit tracker that resets end of turn
  // Complex: after passing Ranged Check, lower crit by 1 (min 17). Resets if
  // no Ranged Check passed since last Turn.
  "deadeye": {
    class: "gunslinger", level: 1, flag: "gunslinger_deadeye", status: "todo",
    description: "Each passed Ranged Check lowers crit by 1 (min 17). Resets end of Turn if no hit."
  },

  // L2: Skeet Shooter — Off-Turn ranged attack to reduce projectile damage
  // STATUS: flavor — Reaction attack, no mechanical automation needed
  "skeet shooter": {
    class: "gunslinger", level: 2, flag: "gunslinger_skeetShooter", status: "flavor",
    description: "Once per Round, make Off-Turn Ranged attack to reduce incoming projectile damage."
  },

  // L4: Grit — Exploding damage dice on Ranged crits
  // STATUS: todo — needs hook on ranged crit to enable exploding
  "grit": {
    class: "gunslinger", level: 4, flag: "gunslinger_grit", status: "todo",
    description: "When you Crit on Ranged attack, damage dice can explode."
  },

  // L6: Devastator — Kill enemy → set Deadeye crit to 17
  // STATUS: todo — depends on Deadeye implementation
  "devastator": {
    class: "gunslinger", level: 6, flag: "gunslinger_devastator", status: "todo",
    description: "Reduce an Enemy to 0 HP → Deadeye crit immediately set to 17."
  },

  // L8: Bad Medicine — Extra damage die on Ranged crits
  // STATUS: todo — needs hook on ranged crit to add extra die
  // NOTE: Could be a managed AE if the system has a field for "extra crit dice"
  "bad medicine": {
    class: "gunslinger", level: 8, flag: "gunslinger_badMedicine", status: "todo",
    description: "Extra die of damage when you Crit with a Ranged Check."
  },

  // L10: High Noon — Crit on Ranged → extra attack
  // STATUS: todo — needs hook on ranged crit to grant extra attack
  "high noon": {
    class: "gunslinger", level: 10, flag: "gunslinger_highNoon", status: "todo",
    description: "Once per Turn, Crit on Ranged → make one additional attack."
  }
};

/* -------------------------------------------- */
/*  Gunslinger Runtime Hooks                    */
/* -------------------------------------------- */

export const GunslingerFeatures = {
  _log(...args) {
    if (game.settings.get(MODULE_ID, "debugMode")) {
      console.log(`${MODULE_ID} | GunslingerFeatures |`, ...args);
    }
  },

  registerHooks() {
    // Gunslinger features are heavily roll-result dependent.
    // Most need hooks on:
    //   - Ranged attack results (Deadeye crit tracker)
    //   - Ranged crits (Grit exploding, Bad Medicine extra die, High Noon extra attack)
    //   - Enemy death (Devastator → set Deadeye to 17)
    //   - Combat start (Quick Draw pre-Turn attack)

    this._log("Hooks registered.");
  }
};
