/**
 * Rogue Class Features
 * Registry entries + runtime hooks for all Rogue features.
 */

import { MODULE_ID } from "../vagabond-character-enhancer.mjs";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

export const ROGUE_REGISTRY = {
  "sneak attack": {
    class: "rogue",
    flag: "rogue_sneakAttack",
    description: "If your first Favored attack on a Turn deals extra d4 damage and ignores Armor equal to the number of Sneak Attack dice. Scales every 3 levels."
  },
  "infiltrator": {
    class: "rogue",
    flag: "rogue_infiltrator",
    description: "Gain the Resourceful Perk. Favor on Checks and Saves to ambush and against traps you are aware of."
  },
  "unflinching luck (d12)": {
    class: "rogue",
    flag: "rogue_unflinchingLuck",
    description: "When you spend Luck for Favor, roll a d12. If lower than remaining Luck, the Luck is not spent."
  },
  "evasive": {
    class: "rogue",
    flag: "rogue_evasive",
    description: "Reflex Saves can't be Hindered while not Incapacitated. Ignore two Dodged attack damage dice on a Crit."
  },
  "lethal weapon": {
    class: "rogue",
    flag: "rogue_lethalWeapon",
    description: "Sneak Attack applies to any Favored attacks on a Turn, not just the first."
  },
  "unflinching luck (d10)": {
    class: "rogue",
    flag: "rogue_unflinchingLuckD10",
    description: "Modifies Unflinching Luck. Roll a d10 instead of a d12."
  },
  "waylay": {
    class: "rogue",
    flag: "rogue_waylay",
    description: "Once per Round, if you kill an Enemy during a Turn, you can immediately take one Action."
  }
};

/* -------------------------------------------- */
/*  Rogue Runtime Hooks                         */
/* -------------------------------------------- */

export const RogueFeatures = {
  registerHooks() {
    // TODO: Implement runtime hooks
    // - Sneak Attack: libWrapper on damage — append Xd4 on Favored attacks, set armor penetration
    // - Unflinching Luck: Hook Luck spending to roll refund die
    // - Evasive: Hook Reflex saves to ignore Hinder
    // - Lethal Weapon: Expand Sneak Attack to all Favored attacks on a Turn
    // - Waylay: Hook NPC death to grant extra Action
  }
};
