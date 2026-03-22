/**
 * Rogue Class Features
 * Registry entries + runtime hooks for all Rogue features.
 */

import { MODULE_ID } from "../vagabond-character-enhancer.mjs";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

export const ROGUE_REGISTRY = {
  // L1: Sneak Attack
  // If your first attack on a Turn is Favored, it deals an extra d4 damage and
  // ignores an amount of Armor equal to this number of extra dice.
  // The number of extra d4s increases by 1 every 3 Rogue Levels hereafter.
  "sneak attack": {
    class: "rogue",
    level: 1,
    flag: "rogue_sneakAttack",
    description: "First Favored attack on a Turn deals extra d4 damage and ignores Armor equal to dice count. +1d4 every 3 levels."
  },

  // L1: Infiltrator
  // You gain the Resourceful Perk, and you have Favor on Checks and Saves made to
  // ambush and against traps that you are aware of.
  "infiltrator": {
    class: "rogue",
    level: 1,
    flag: "rogue_infiltrator",
    description: "Gain Resourceful Perk. Favor on Checks and Saves to ambush and against known traps."
  },

  // L2: Unflinching Luck
  // When you spend Luck to gain Favor on a Check, roll a d12. If the result is
  // lower than your remaining Luck, the Luck is not spent.
  "unflinching luck": {
    class: "rogue",
    level: 2,
    flag: "rogue_unflinchingLuck",
    description: "When spending Luck for Favor, roll d12. If lower than remaining Luck, the Luck is not spent."
  },

  // L4: Evasive
  // While you aren't Incapacitated, you ignore Hinder on Reflex Saves and you
  // ignore two of a Dodged attack's damage dice on a passed Save, rather than one.
  "evasive": {
    class: "rogue",
    level: 4,
    flag: "rogue_evasive",
    description: "Ignore Hinder on Reflex Saves while not Incapacitated. Ignore two Dodged damage dice instead of one."
  },

  // L6: Lethal Weapon
  // Your Sneak Attack applies to any Favored attacks you make on a Turn, not just the first.
  "lethal weapon": {
    class: "rogue",
    level: 6,
    flag: "rogue_lethalWeapon",
    description: "Sneak Attack applies to any Favored attacks on a Turn, not just the first."
  },

  // L8: Unflinching Luck Enhancement
  // When you become an 8th Level Rogue, the d12 is a d10.
  "unflinching luck (d10)": {
    class: "rogue",
    level: 8,
    flag: "rogue_unflinchingLuckD10",
    description: "Unflinching Luck upgrade: roll d10 instead of d12."
  },

  // L10: Waylay
  // Once per Round, if you kill an Enemy during a Turn, you can immediately take one Action.
  "waylay": {
    class: "rogue",
    level: 10,
    flag: "rogue_waylay",
    description: "Once per Round, killing an Enemy grants you an immediate Action."
  }
};

/* -------------------------------------------- */
/*  Rogue Runtime Hooks                         */
/* -------------------------------------------- */

export const RogueFeatures = {
  registerHooks() {
    // TODO: Implement runtime hooks
    // - Sneak Attack: libWrapper on damage — append Xd4 on Favored attacks, set armor penetration
    // - Unflinching Luck: Hook Luck spending to roll refund die (d12, d10 at L8)
    // - Evasive: Hook Reflex saves to ignore Hinder + extra Dodge die
    // - Lethal Weapon: Expand Sneak Attack to all Favored attacks on a Turn
    // - Waylay: Hook NPC death to grant extra Action
  }
};
