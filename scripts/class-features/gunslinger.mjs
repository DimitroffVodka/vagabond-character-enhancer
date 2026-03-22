/**
 * Gunslinger Class Features
 * Registry entries + runtime hooks for all Gunslinger features.
 */

import { MODULE_ID } from "../vagabond-character-enhancer.mjs";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

export const GUNSLINGER_REGISTRY = {
  // L1: Quick Draw
  // You gain the Marksmanship Perk. Further, when combat occurs, you can make one
  // Ranged attack before the first Turn, which is Hindered if it is made with a 2H Weapon.
  "quick draw": {
    class: "gunslinger",
    level: 1,
    flag: "gunslinger_quickDraw",
    description: "Gain Marksmanship Perk. Make one Ranged attack before first Turn of Combat (Hindered if 2H)."
  },

  // L1: Deadeye
  // After you pass a Ranged Check, you Crit on subsequent Ranged attacks on a d20
  // roll 1 lower, but no lower than 17. This resets to 0 at the end of your Turn
  // if you didn't pass a Ranged Check since your last Turn.
  "deadeye": {
    class: "gunslinger",
    level: 1,
    flag: "gunslinger_deadeye",
    description: "After passing a Ranged Check, crit threshold lowers by 1 on subsequent Ranged attacks (min 17). Resets on miss."
  },

  // L2: Skeet Shooter
  // Once per Round, you can make a Ranged attack on an Off-Turn to Target a
  // projectile from an attack you can see. If you pass, reduce the damage of the
  // triggering attack by the damage you would deal with your attack.
  "skeet shooter": {
    class: "gunslinger",
    level: 2,
    flag: "gunslinger_skeetShooter",
    description: "Once per Round, Ranged attack Off-Turn to shoot down a projectile. Pass reduces triggering attack's damage."
  },

  // L4: Grit
  // When you Crit on a Ranged attack, the damage dice can explode.
  "grit": {
    class: "gunslinger",
    level: 4,
    flag: "gunslinger_grit",
    description: "Ranged Crit damage dice can explode."
  },

  // L6: Devastator
  // When you reduce an Enemy to 0 HP, the roll on the d20 to Crit as per your
  // Deadeye Feature is immediately set to 17.
  "devastator": {
    class: "gunslinger",
    level: 6,
    flag: "gunslinger_devastator",
    description: "Killing an Enemy instantly sets Deadeye crit threshold to 17."
  },

  // L8: Bad Medicine
  // You deal an extra die of damage when you Crit with a Ranged Check.
  "bad medicine": {
    class: "gunslinger",
    level: 8,
    flag: "gunslinger_badMedicine",
    description: "Extra damage die on Ranged Crit."
  },

  // L10: High Noon
  // Once per Turn, if you Crit on a Ranged Check, you can make one additional attack.
  "high noon": {
    class: "gunslinger",
    level: 10,
    flag: "gunslinger_highNoon",
    description: "Once per Turn, Ranged Crit grants one additional attack."
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
