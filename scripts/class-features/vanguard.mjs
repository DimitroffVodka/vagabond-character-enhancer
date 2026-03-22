/**
 * Vanguard Class Features
 * Registry entries + runtime hooks for all Vanguard features.
 */

import { MODULE_ID } from "../vagabond-character-enhancer.mjs";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

export const VANGUARD_REGISTRY = {
  // L1: Stalwart
  // You gain the Protector Perk and, when you take the Hold Action, you can use the
  // held Action or Move as late as the end of your next Turn.
  "stalwart": {
    class: "vanguard",
    level: 1,
    flag: "vanguard_stalwart",
    description: "Gain Protector Perk. Hold Action can be used as late as end of next Turn."
  },

  // L1: Guard
  // Once per Round, you can try to Shove a Close Target (no Action) when they become
  // Close to you, or if you successfully Block their Attack.
  "guard": {
    class: "vanguard",
    level: 1,
    flag: "vanguard_guard",
    description: "Once per Round, free Shove on a Close Target when they enter Close range or you Block their Attack."
  },

  // L2: Rampant Charge
  // You can push Targets you Shove ahead of you while you Move during the same Turn,
  // shoving it Prone when you stop or push it into an occupied space. If you push it
  // into an occupied space, it deals your weapon's damage to the Target and whatever
  // occupied the space.
  "rampant charge": {
    class: "vanguard",
    level: 2,
    flag: "vanguard_rampantCharge",
    description: "Push Shoved Targets ahead while Moving. Prone on stop or collision. Collision deals weapon damage to both."
  },

  // L4: Wall
  // You are considered Large for Shoves.
  "wall": {
    class: "vanguard",
    level: 4,
    flag: "vanguard_wallLarge",
    description: "You are considered Large for Shoves."
  },

  // L6: Unstoppable
  // If you use Rampant Charge and push a Being into another Being, you can make
  // another shove attempt to push the additional Being ahead of you as well.
  "unstoppable": {
    class: "vanguard",
    level: 6,
    flag: "vanguard_unstoppable",
    description: "Rampant Charge collision: can Shove the additional Being ahead of you too."
  },

  // L8: Wall Enhancement
  // When you become an 8th Level Vanguard, you are considered Huge for Shoves.
  "wall (huge)": {
    class: "vanguard",
    level: 8,
    flag: "vanguard_wallHuge",
    description: "Wall upgrade: considered Huge for Shoves instead of Large."
  },

  // L10: Indestructible
  // While you aren't Incapacitated and have an Armor Rating of 1 or more, you are
  // Immune to attack damage.
  "indestructible": {
    class: "vanguard",
    level: 10,
    flag: "vanguard_indestructible",
    description: "While not Incapacitated and Armor Rating 1+, Immune to attack damage."
  }
};

/* -------------------------------------------- */
/*  Vanguard Runtime Hooks                      */
/* -------------------------------------------- */

export const VanguardFeatures = {
  registerHooks() {
    // TODO: Implement runtime hooks
    // - Wall: Store size override flag for Shove checks (Large at L4, Huge at L8)
    // - Guard: Hook proximity/Block to trigger free Shove
    // - Rampant Charge: Hook Shove + Move to push target
    // - Indestructible: Conditional immunity (requires armor + not Incapacitated)
  }
};
