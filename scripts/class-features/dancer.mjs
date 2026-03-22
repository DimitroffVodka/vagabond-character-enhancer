/**
 * Dancer Class Features
 * Registry entries + runtime hooks for all Dancer features.
 */

import { MODULE_ID } from "../vagabond-character-enhancer.mjs";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

export const DANCER_REGISTRY = {
  // L1: Fleet of Foot
  // You gain the Treads Lightly Perk, and the roll for you to Crit on Reflex Saves
  // is reduced by an amount equal to (your Dancer Level divided by 4, round up).
  "fleet of foot": {
    class: "dancer",
    level: 1,
    flag: "dancer_fleetOfFoot",
    description: "Gain Treads Lightly Perk. Reflex Save crit reduced by (ceil Dancer Level / 4)."
  },

  // L1: Step Up
  // Once per Turn, you can use your Action to perform an enlivening dance. Doing so
  // allows you to roll a second d20 on Reflex Saves until the start of your next Turn
  // and use the higher result, and it gives one Ally of your choice that sees you a
  // second Action this Turn.
  "step up": {
    class: "dancer",
    level: 1,
    flag: "dancer_stepUp",
    description: "Action to dance: roll 2d20 on Reflex Saves (use higher) until next Turn, and give one Ally a second Action."
  },

  // L2: Evasive
  // While you aren't Incapacitated, you ignore Hinder on Reflex Saves and you ignore
  // two of a Dodged attack's damage dice on a passed Save, rather than one.
  "evasive": {
    class: "dancer",
    level: 2,
    flag: "dancer_evasive",
    description: "Ignore Hinder on Reflex Saves while not Incapacitated. Ignore two Dodged damage dice instead of one."
  },

  // L4: Don't Stop Me Now
  // Your Speed is not affected by Difficult Terrain and you have Favor on Saves
  // against being Paralyzed, Restrained, or moved.
  "don't stop me now": {
    class: "dancer",
    level: 4,
    flag: "dancer_dontStopMeNow",
    description: "Speed unaffected by Difficult Terrain. Favor on Saves vs Paralyzed, Restrained, or being moved."
  },

  // L6: Choreographer
  // When you use your Step Up Feature, the Ally gains Favor on the first Check they
  // make with the Action you give them, and you both gain a 10 foot bonus to Speed
  // for the Round.
  "choreographer": {
    class: "dancer",
    level: 6,
    flag: "dancer_choreographer",
    description: "Step Up Ally gets Favor on first Check with the granted Action. You both gain +10 Speed for the Round."
  },

  // L8: Flash of Beauty
  // When you Crit on a Save, you can take two Actions, rather than one.
  "flash of beauty": {
    class: "dancer",
    level: 8,
    flag: "dancer_flashOfBeauty",
    description: "When you Crit on a Save, take two Actions instead of one."
  },

  // L10: Double Time
  // You can Target two Allies with your Step Up Feature, rather than one.
  "double time": {
    class: "dancer",
    level: 10,
    flag: "dancer_doubleTime",
    description: "Step Up can Target two Allies instead of one."
  }
};

/* -------------------------------------------- */
/*  Dancer Runtime Hooks                        */
/* -------------------------------------------- */

export const DancerFeatures = {
  registerHooks() {
    // TODO: Implement runtime hooks
    // - Fleet of Foot: Managed AE on reflexCritBonus scaled by level
    // - Step Up: Action button -> grant ally bonus Action via flags + 2d20 Reflex
    // - Evasive: Hook Reflex saves to ignore Hinder
    // - Don't Stop Me Now: Hook saves to add Favor vs movement conditions
    // - Choreographer: Extend Step Up with Favor + speed
    // - Flash of Beauty: Hook crit saves for extra Action
    // - Double Time: Extend Step Up to 2 targets
  }
};
