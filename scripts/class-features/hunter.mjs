/**
 * Hunter Class Features
 * Registry entries + runtime hooks for all Hunter features.
 */

import { MODULE_ID } from "../vagabond-character-enhancer.mjs";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

export const HUNTER_REGISTRY = {
  // L1: Hunter's Mark
  // You can mark a Being either when you attack it, or by skipping your Move if you
  // can sense it. When you do, the following rules apply:
  // - You must Focus on the mark.
  // - When you make an attack against it, roll two d20s and use the highest for the Check.
  "hunter's mark": {
    class: "hunter",
    level: 1,
    flag: "hunter_huntersMark",
    description: "Mark a Being on attack or skip Move. Must Focus. Roll 2d20 (use highest) on attacks against marked Target."
  },

  // L1: Survivalist
  // You gain the Padfoot Perk, you have Favor on Checks to track and navigate, and
  // you can Forage while Traveling at a Normal Pace.
  "survivalist": {
    class: "hunter",
    level: 1,
    flag: "hunter_survivalist",
    description: "Gain Padfoot Perk. Favor on track/navigate Checks. Forage at Normal Travel Pace."
  },

  // L2: Rover
  // Difficult Terrain doesn't impede your walking Speed, and you have Climb and Swim.
  "rover": {
    class: "hunter",
    level: 2,
    flag: "hunter_rover",
    description: "Difficult Terrain doesn't impede walking Speed. You have Climb and Swim."
  },

  // L4: Overwatch
  // Your additional d20 for attacks with your Hunter's Mark also applies to your
  // Saves provoked by the marked Target.
  "overwatch": {
    class: "hunter",
    level: 4,
    flag: "hunter_overwatch",
    description: "Hunter's Mark extra d20 also applies to Saves provoked by the marked Target."
  },

  // L6: Quarry
  // You can sense Beings within Far as if by Blindsight if they are missing any HP
  // or that are marked by your Hunter's Mark.
  "quarry": {
    class: "hunter",
    level: 6,
    flag: "hunter_quarry",
    description: "Sense Beings within Far as Blindsight if they are missing HP or marked by Hunter's Mark."
  },

  // L8: Lethal Precision
  // You now roll three d20s with your Hunter's Mark and Overwatch Features and use
  // the highest result of the three for the result.
  "lethal precision": {
    class: "hunter",
    level: 8,
    flag: "hunter_lethalPrecision",
    description: "Hunter's Mark and Overwatch now roll 3d20 and use the highest."
  },

  // L10: Apex Predator
  // Damage you deal to the Target of your Hunter's Mark ignores Immune and Armor.
  "apex predator": {
    class: "hunter",
    level: 10,
    flag: "hunter_apexPredator",
    description: "Damage to Hunter's Mark Target ignores Immune and Armor."
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
