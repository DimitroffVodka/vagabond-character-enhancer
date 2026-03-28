/**
 * Rogue Class Features
 * Registry entries + runtime hooks for all Rogue features.
 */

import { MODULE_ID, log } from "../utils.mjs";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

export const ROGUE_REGISTRY = {
  // L1: Sneak Attack — Extra d4 damage on favored attacks + armor penetration
  // STATUS: todo — needs hook on favored attack to add Xd4 damage and set armor pen
  // Scaling: L1=1d4, L4=2d4, L7=3d4, L10=4d4
  "sneak attack": {
    class: "rogue", level: 1, flag: "rogue_sneakAttack", status: "todo",
    description: "First Favored attack on a Turn deals extra d4 damage and ignores Armor equal to dice count. +1d4 every 3 levels."
  },

  // L1: Infiltrator — Resourceful Perk + Favor on ambush/trap checks
  // STATUS: flavor — Perk grant + narrative bonuses
  "infiltrator": {
    class: "rogue", level: 1, flag: "rogue_infiltrator", status: "flavor",
    description: "Gain Resourceful Perk. Favor on Checks and Saves to ambush and against known traps."
  },

  // L2: Unflinching Luck — Roll d12 when spending Luck, refund if < remaining
  // STATUS: todo — needs hook on Luck spending
  "unflinching luck": {
    class: "rogue", level: 2, flag: "rogue_unflinchingLuck", status: "todo",
    description: "When spending Luck for Favor, roll d12. If lower than remaining Luck, the Luck is not spent."
  },

  // L4: Evasive — Ignore Hinder on Reflex, ignore 2 Dodge dice
  // STATUS: todo — needs hooks on Reflex saves and Dodge damage
  "evasive": {
    class: "rogue", level: 4, flag: "rogue_evasive", status: "todo",
    description: "Ignore Hinder on Reflex Saves while not Incapacitated. Ignore two Dodged damage dice instead of one."
  },

  // L6: Lethal Weapon — Sneak Attack on ALL favored attacks, not just first
  // STATUS: todo — depends on Sneak Attack implementation
  "lethal weapon": {
    class: "rogue", level: 6, flag: "rogue_lethalWeapon", status: "todo",
    description: "Sneak Attack applies to any Favored attacks on a Turn, not just the first."
  },

  // L8: Unflinching Luck (d10) — upgrade refund die
  // STATUS: todo — depends on Unflinching Luck implementation
  "unflinching luck (d10)": {
    class: "rogue", level: 8, flag: "rogue_unflinchingLuckD10", status: "todo",
    description: "Unflinching Luck upgrade: roll d10 instead of d12."
  },

  // L10: Waylay — Kill enemy → immediate extra Action
  // STATUS: todo — needs hook on enemy death
  "waylay": {
    class: "rogue", level: 10, flag: "rogue_waylay", status: "todo",
    description: "Once per Round, killing an Enemy grants you an immediate Action."
  }
};

/* -------------------------------------------- */
/*  Rogue Runtime Hooks                         */
/* -------------------------------------------- */

export const RogueFeatures = {

  registerHooks() {
    // Rogue features need:
    //   - Sneak Attack: hook on favored attack damage to add Xd4 + armor pen
    //   - Unflinching Luck: hook on Luck spending to roll refund die
    //   - Evasive: hook on Reflex saves (ignore hinder) and Dodge (extra die removal)
    //   - Waylay: hook on NPC death for extra action

    log("Rogue","Hooks registered.");
  }
};
