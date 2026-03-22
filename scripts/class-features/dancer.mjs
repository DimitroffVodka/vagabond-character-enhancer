/**
 * Dancer Class Features
 * Registry entries + runtime hooks for all Dancer features.
 */

import { MODULE_ID } from "../vagabond-character-enhancer.mjs";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

export const DANCER_REGISTRY = {
  "fleet of foot": {
    class: "dancer",
    flag: "dancer_fleetOfFoot",
    description: "Gain the Treads Lightly Perk. Crit on Reflex Saves is reduced by (ceil Dancer Level / 4)."
  },
  "step up": {
    class: "dancer",
    flag: "dancer_stepUp",
    description: "Use Action to perform a dance. An Ally can roll a second d20 on Reflex Saves and gains a bonus Action until your next Turn."
  },
  "evasive": {
    class: "dancer",
    flag: "dancer_evasive",
    description: "Ignore Hinder on Reflex Saves and ignore two Dodged attack damage dice on a Crit."
  },
  "don't stop me now": {
    class: "dancer",
    flag: "dancer_dontStopMeNow",
    description: "Speed is not affected by Difficult Terrain. Favor on Saves against Paralyzed, Restrained, or being moved."
  },
  "choreographer": {
    class: "dancer",
    flag: "dancer_choreographer",
    description: "Step Up Ally gains Favor on their first Check, and you and all buffed Allies get +10ft Speed."
  },
  "flash of beauty": {
    class: "dancer",
    flag: "dancer_flashOfBeauty",
    description: "When you Crit on a Save, you can take two Actions rather than one."
  },
  "double time": {
    class: "dancer",
    flag: "dancer_doubleTime",
    description: "You can Target two Allies with Step Up, rather than one."
  }
};

/* -------------------------------------------- */
/*  Dancer Runtime Hooks                        */
/* -------------------------------------------- */

export const DancerFeatures = {
  registerHooks() {
    // TODO: Implement runtime hooks
    // - Fleet of Foot: Managed AE on system.reflexCritBonus scaled by level
    // - Step Up: Action button -> grant ally bonus Action via flags
    // - Evasive: Hook Reflex saves to ignore Hinder
    // - Don't Stop Me Now: Hook saves to convert Hinder to Favor
    // - Choreographer: Extend Step Up with Favor + speed
    // - Flash of Beauty: Hook crit saves for extra Action
    // - Double Time: Extend Step Up to 2 targets
  }
};
