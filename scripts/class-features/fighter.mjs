/**
 * Fighter Class Features
 * Registry entries + runtime hooks for all Fighter features.
 */

import { MODULE_ID } from "../vagabond-character-enhancer.mjs";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

export const FIGHTER_REGISTRY = {
  "fighting style": {
    class: "fighter",
    flag: "fighter_fightingStyle",
    description: "Gain the Situational Awareness Perk and another Perk with Melee or Ranged Training Prerequisite."
  },
  "valor": {
    class: "fighter",
    flag: "fighter_valor",
    description: "Crit on Attack Checks and Saves to Dodge/Block is reduced by 1 (increases at L4 and L8)."
  },
  "momentum": {
    class: "fighter",
    flag: "fighter_momentum",
    description: "If you pass a Save against an attack, your next attack before end of next Turn is Favored."
  },
  "muster for battle": {
    class: "fighter",
    flag: "fighter_musterForBattle",
    description: "You have two Actions on your first Turn of Combat."
  },
  "harrying": {
    class: "fighter",
    flag: "fighter_harrying",
    description: "You can attack twice with the Attack Action, rather than just once."
  }
};

/* -------------------------------------------- */
/*  Fighter Runtime Hooks                       */
/* -------------------------------------------- */

export const FighterFeatures = {
  registerHooks() {
    // TODO: Implement runtime hooks
    // - Valor: Managed AE on crit bonus fields (scales at L4, L8)
    // - Momentum: Hook save results to grant Favor on next attack
    // - Muster for Battle: Hook combat start to grant extra Action
    // - Harrying: Hook attack action to allow double attack
  }
};
