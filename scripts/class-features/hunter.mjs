/**
 * Hunter Class Features
 * Registry entries + runtime hooks for all Hunter features.
 */

import { MODULE_ID } from "../vagabond-character-enhancer.mjs";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

export const HUNTER_REGISTRY = {
  // L1: Hunter's Mark — Mark a target, roll 2d20 keep highest on attacks
  // STATUS: todo — needs mark tracking (focus-based) + roll modification
  // Complex: requires "extra d20 keep highest" which may need rollAttack wrapper
  "hunter's mark": {
    class: "hunter", level: 1, flag: "hunter_huntersMark", status: "todo",
    description: "Mark a Being (requires Focus). Attack rolls against it use 2d20 keep highest."
  },

  // L1: Survivalist — Padfoot Perk + Favor on tracking/navigation
  // STATUS: flavor — Perk grant + narrative bonuses
  "survivalist": {
    class: "hunter", level: 1, flag: "hunter_survivalist", status: "flavor",
    description: "Gain Padfoot Perk. Favor on tracking/navigation Checks. Forage while Traveling at Normal Pace."
  },

  // L2: Rover — Ignore difficult terrain, gain Climb + Swim
  // STATUS: module — Managed AE for movement types
  "rover": {
    class: "hunter", level: 2, flag: "hunter_rover", status: "module",
    description: "Difficult Terrain doesn't impede walking Speed. Gain Climb and Swim.",
    effects: [{
      label: "Rover",
      icon: "icons/environment/wilderness/terrain-mountains-background.webp",
      changes: [
        // The system tracks climb/swim as speed values
        // Setting these to match base speed
        // NOTE: May need to verify exact field paths
      ]
    }]
  },

  // L4: Overwatch — Hunter's Mark 2d20 also applies to saves from marked target
  // STATUS: todo — depends on Hunter's Mark implementation
  "overwatch": {
    class: "hunter", level: 4, flag: "hunter_overwatch", status: "todo",
    description: "Hunter's Mark bonus d20 also applies to Saves from the marked Target."
  },

  // L6: Quarry — Blindsight on damaged/marked beings within Far
  // STATUS: flavor — narrative sense, no mechanical automation
  "quarry": {
    class: "hunter", level: 6, flag: "hunter_quarry", status: "flavor",
    description: "Sense Beings within Far by Blindsight if they're missing HP or marked."
  },

  // L8: Lethal Precision — Roll 3d20 keep highest with Hunter's Mark
  // STATUS: todo — depends on Hunter's Mark implementation
  "lethal precision": {
    class: "hunter", level: 8, flag: "hunter_lethalPrecision", status: "todo",
    description: "Roll 3d20 keep highest with Hunter's Mark and Overwatch."
  },

  // L10: Apex Predator — Damage ignores Immune and Armor vs marked target
  // STATUS: todo — needs hook on damage to bypass immune/armor against mark
  "apex predator": {
    class: "hunter", level: 10, flag: "hunter_apexPredator", status: "todo",
    description: "Damage to Hunter's Mark Target ignores Immune and Armor."
  }
};

/* -------------------------------------------- */
/*  Hunter Runtime Hooks                        */
/* -------------------------------------------- */

export const HunterFeatures = {
  _log(...args) {
    if (game.settings.get(MODULE_ID, "debugMode")) {
      console.log(`${MODULE_ID} | HunterFeatures |`, ...args);
    }
  },

  registerHooks() {
    // Hunter features center on the Hunter's Mark mechanic:
    //   - Mark tracking via focus system
    //   - Extra d20 on attack rolls vs marked target
    //   - Extra d20 on saves from marked target (Overwatch)
    //   - 3d20 at L8 (Lethal Precision)
    //   - Ignore immune/armor at L10 (Apex Predator)
    // All depend on the Mark being tracked and the target being identified.

    this._log("Hooks registered.");
  }
};
