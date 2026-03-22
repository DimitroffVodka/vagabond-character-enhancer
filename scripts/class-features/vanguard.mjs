/**
 * Vanguard Class Features
 * Registry entries + runtime hooks for all Vanguard features.
 */

import { MODULE_ID } from "../vagabond-character-enhancer.mjs";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

export const VANGUARD_REGISTRY = {
  "stalwart": {
    class: "vanguard",
    flag: "vanguard_stalwart",
    description: "Gain the Protector Perk. When you Hold, you can use the held Action or Move as late as the start of your next Turn."
  },
  "guard": {
    class: "vanguard",
    flag: "vanguard_guard",
    description: "Once per Round, Shove a Close Target (no Action) when they become Close or if you successfully Block their attack."
  },
  "rampant charge": {
    class: "vanguard",
    flag: "vanguard_rampantCharge",
    description: "Push Targets you Shove ahead of you while you Move, shoving Prone when you stop or push into a wall/Being."
  },
  "wall (large)": {
    class: "vanguard",
    flag: "vanguard_wallLarge",
    description: "You are considered Large for Shoves."
  },
  "unstoppable": {
    class: "vanguard",
    flag: "vanguard_unstoppable",
    description: "If Rampant Charge pushes a Being into another, you can Shove the additional Being too."
  },
  "wall (huge)": {
    class: "vanguard",
    flag: "vanguard_wallHuge",
    description: "You are considered Huge for Shoves."
  },
  "indestructible": {
    class: "vanguard",
    flag: "vanguard_indestructible",
    description: "While not Incapacitated and Armor Rating is 1+, you are Immune to Physical damage."
  }
};

/* -------------------------------------------- */
/*  Vanguard Runtime Hooks                      */
/* -------------------------------------------- */

export const VanguardFeatures = {
  registerHooks() {
    // TODO: Implement runtime hooks
    // - Wall (Large/Huge): Store size override flag for Shove checks
    // - Guard: Hook proximity/Block to trigger free Shove
    // - Rampant Charge: Hook Shove + Move to push target
    // - Indestructible: Managed AE for Physical immunity (conditional on armor)
  }
};
