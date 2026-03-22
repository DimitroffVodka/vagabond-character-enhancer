/**
 * Hunter Class Features
 * Registry entries + runtime hooks for all Hunter features.
 */

import { MODULE_ID } from "../vagabond-character-enhancer.mjs";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

export const HUNTER_REGISTRY = {
  "hunter's mark": {
    class: "hunter",
    flag: "hunter_huntersMark",
    description: "Mark a Being when you attack it or skip Move. Roll an additional d20 on attacks against the marked Target."
  },
  "survivalist": {
    class: "hunter",
    flag: "hunter_survivalist",
    description: "Gain the Padfoot Perk. Favor on Checks to track and navigate. Can Forage while Traveling at a Fast Pace."
  },
  "rover": {
    class: "hunter",
    flag: "hunter_rover",
    description: "Difficult Terrain doesn't impede walking Speed. You have Climb and Swim."
  },
  "overwatch": {
    class: "hunter",
    flag: "hunter_overwatch",
    description: "Your additional d20 from Hunter's Mark also applies to Saves provoked by the marked Target."
  },
  "quarry": {
    class: "hunter",
    flag: "hunter_quarry",
    description: "Sense Beings within Far as Blindsight if they are missing HP or marked by Hunter's Mark."
  },
  "lethal precision": {
    class: "hunter",
    flag: "hunter_lethalPrecision",
    description: "Roll three d20s with Hunter's Mark and Overwatch and use the highest result."
  },
  "apex predator": {
    class: "hunter",
    flag: "hunter_apexPredator",
    description: "Damage to the Target of your Hunter's Mark ignores Immune and Armor."
  }
};

/* -------------------------------------------- */
/*  Hunter Runtime Hooks                        */
/* -------------------------------------------- */

export const HunterFeatures = {
  registerHooks() {
    // TODO: Implement runtime hooks
    // - Hunter's Mark: Track marked target via flags, add extra d20 on attacks
    // - Overwatch: Extend Mark d20 to Saves
    // - Lethal Precision: Upgrade to 3d20
    // - Apex Predator: Bypass Immune and Armor on marked target
  }
};
