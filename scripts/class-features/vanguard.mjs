/**
 * Vanguard Class Features
 * Registry entries + runtime hooks for all Vanguard features.
 */

import { MODULE_ID, log } from "../utils.mjs";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

export const VANGUARD_REGISTRY = {
  // L1: Stalwart — Protector Perk + extended Hold duration
  // STATUS: flavor — Perk grant + action economy extension
  "stalwart": {
    class: "vanguard", level: 1, flag: "vanguard_stalwart", status: "flavor",
    description: "Gain Protector Perk. Hold Action can be used as late as end of next Turn."
  },

  // L1: Guard — Free Shove when enemy becomes Close or on Block
  // STATUS: flavor — reaction-based, no mechanical enforcement
  "guard": {
    class: "vanguard", level: 1, flag: "vanguard_guard", status: "flavor",
    description: "Once per Round, free Shove attempt when a Target becomes Close or you Block their Attack."
  },

  // L2: Rampant Charge — Push shoved targets during Move
  // STATUS: flavor — movement-based combo, no automation needed
  "rampant charge": {
    class: "vanguard", level: 2, flag: "vanguard_rampantCharge", status: "flavor",
    description: "Push Shoved Targets ahead of you while Moving. Prone on stop or collision (deals weapon damage)."
  },

  // L4: Wall — Considered Large for Shoves
  // STATUS: module — Managed AE
  // NOTE: The system may track "effective size for shoves" differently.
  // If no specific field exists, this is informational only.
  "wall": {
    class: "vanguard", level: 4, flag: "vanguard_wall", status: "module",
    description: "Considered Large for Shoves.",
    effects: [{
      label: "Wall (Large)",
      icon: "icons/environment/settlement/wall-shield.webp",
      changes: []  // Shove size override handled by brawl-intent.mjs via feature flag
    }]
  },

  // L6: Unstoppable — Chain shoves during Rampant Charge
  // STATUS: flavor — extends Rampant Charge, no automation
  "unstoppable": {
    class: "vanguard", level: 6, flag: "vanguard_unstoppable", status: "flavor",
    description: "Rampant Charge can chain: push additional Beings you collide with."
  },

  // L8: Wall (Huge) — Considered Huge for Shoves
  // STATUS: partial — same as Wall
  "wall (huge)": {
    class: "vanguard", level: 8, flag: "vanguard_wallHuge", status: "module",
    description: "Considered Huge for Shoves.",
    effects: [{
      label: "Wall (Huge)",
      icon: "icons/environment/settlement/wall-shield.webp",
      changes: []  // Shove size override handled by brawl-intent.mjs via feature flag
    }]
  },

  // L10: Indestructible — Immune to attack damage with Armor ≥ 1
  // STATUS: todo — needs hook on incoming attack damage to check armor and negate
  // This is extremely powerful and needs careful implementation.
  "indestructible": {
    class: "vanguard", level: 10, flag: "vanguard_indestructible", status: "todo",
    description: "While not Incapacitated and Armor ≥ 1, Immune to attack damage."
  }
};

/* -------------------------------------------- */
/*  Vanguard Runtime Hooks                      */
/* -------------------------------------------- */

export const VanguardFeatures = {

  registerHooks() {
    log("Vanguard","Hooks registered.");
  }
};
