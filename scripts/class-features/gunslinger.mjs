/**
 * Gunslinger Class Features
 * Registry entries + runtime hooks for all Gunslinger features.
 */

import { MODULE_ID } from "../vagabond-character-enhancer.mjs";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

export const GUNSLINGER_REGISTRY = {
  "quick draw": {
    class: "gunslinger",
    flag: "gunslinger_quickDraw",
    description: "Gain the Marksmanship Perk. Make one Hindered Ranged attack before the first Turn of Combat."
  },
  "deadeye": {
    class: "gunslinger",
    flag: "gunslinger_deadeye",
    description: "After passing a Ranged Check, Crit on subsequent Ranged attacks on a d20 roll 1 lower (minimum 17). Resets on miss."
  },
  "skeet shooter": {
    class: "gunslinger",
    flag: "gunslinger_skeetShooter",
    description: "Once per Round, make a Ranged attack off-Turn to Target a projectile from an attack you can see."
  },
  "grit": {
    class: "gunslinger",
    flag: "gunslinger_grit",
    description: "When you Crit on a Ranged attack, the damage dice can explode."
  },
  "devastator": {
    class: "gunslinger",
    flag: "gunslinger_devastator",
    description: "When you reduce an Enemy to 0 HP, the Deadeye crit threshold immediately sets to 17."
  },
  "bad medicine": {
    class: "gunslinger",
    flag: "gunslinger_badMedicine",
    description: "You deal an extra die of damage when you Crit with a Ranged Check."
  },
  "high noon": {
    class: "gunslinger",
    flag: "gunslinger_highNoon",
    description: "Once per Turn, if you Crit on a Ranged Check, you can make one additional attack."
  }
};

/* -------------------------------------------- */
/*  Gunslinger Runtime Hooks                    */
/* -------------------------------------------- */

export const GunslingerFeatures = {
  registerHooks() {
    // TODO: Implement runtime hooks
    // - Deadeye: Track consecutive hits via flags, adjust crit threshold
    // - Grit: Add exploding to crit ranged damage
    // - Devastator: Reset Deadeye counter on kill
    // - Bad Medicine: Add extra damage die on ranged crit
    // - High Noon: Grant extra attack on crit
  }
};
