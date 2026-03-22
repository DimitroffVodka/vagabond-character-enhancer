/**
 * Fighter Class Features
 * Registry entries + runtime hooks for all Fighter features.
 */

import { MODULE_ID } from "../vagabond-character-enhancer.mjs";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

export const FIGHTER_REGISTRY = {
  // L1: Fighting Style
  // You gain the Situational Awareness Perk and another Perk with the Melee or
  // Ranged Training Prerequisite, ignoring prerequisites for this Perk.
  "fighting style": {
    class: "fighter",
    level: 1,
    flag: "fighter_fightingStyle",
    description: "Gain Situational Awareness Perk + another Perk with Melee or Ranged Training Prerequisite (ignoring prereqs)."
  },

  // L1: Valor
  // The roll required for you to Crit on Attack Checks, and Saves to Dodge or Block
  // Attacks is reduced by 1, and is reduced by 1 more when you reach 4th and 8th
  // Levels in this Class.
  // L4: Valor — reduced by 2 total
  // L8: Valor — reduced by 3 total
  "valor": {
    class: "fighter",
    level: 1,
    flag: "fighter_valor",
    description: "Crit on Attack Checks and Dodge/Block Saves reduced by 1. Increases to -2 at L4, -3 at L8."
  },

  // L2: Momentum
  // If you pass a Save against an attack, the next attack you make before the end
  // of your next Turn is Favored.
  "momentum": {
    class: "fighter",
    level: 2,
    flag: "fighter_momentum",
    description: "Pass a Save against an attack → next attack before end of next Turn is Favored."
  },

  // L6: Muster for Battle
  // You have two Actions on your first Turn.
  "muster for battle": {
    class: "fighter",
    level: 6,
    flag: "fighter_musterForBattle",
    description: "You have two Actions on your first Turn of Combat."
  },

  // L10: Harrying
  // You can attack twice with the Attack Action, rather than just once.
  "harrying": {
    class: "fighter",
    level: 10,
    flag: "fighter_harrying",
    description: "Attack twice with the Attack Action instead of once."
  }
};

/* -------------------------------------------- */
/*  Fighter Runtime Hooks                       */
/* -------------------------------------------- */

export const FighterFeatures = {
  registerHooks() {
    // TODO: Implement runtime hooks
    // - Valor: Managed AE on crit bonus fields (scales at L4, L8 — need level check)
    // - Momentum: Hook save results to grant Favor on next attack
    // - Muster for Battle: Hook combat start to grant extra Action on first Turn
    // - Harrying: Hook attack action to allow double attack
  }
};
