/**
 * Wizard Class Features
 * Registry entries + runtime hooks for all Wizard features.
 */

import { MODULE_ID } from "../vagabond-character-enhancer.mjs";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

export const WIZARD_REGISTRY = {
  // L1: Spellcaster — Cast Spells using Arcana
  // STATUS: system
  "spellcaster": {
    class: "wizard", level: 1, flag: "wizard_spellcaster", status: "system",
    description: "Cast Spells using Arcana. Learn 4 Spells. Max Mana = 4 × Level. Regain on Rest or Study."
  },

  // L1: Page Master — Bookworm Perk + add Studied die to damage/healing
  // STATUS: todo — Studied dice interaction needs hook on damage/healing rolls
  "page master": {
    class: "wizard", level: 1, flag: "wizard_pageMaster", status: "todo",
    description: "Gain Bookworm Perk. When you successfully Cast, spend a Studied die to add to damage/healing."
  },

  // L2: Sculpt Spell — Pay 1 less Mana for delivery
  // STATUS: module — Managed AE
  "sculpt spell": {
    class: "wizard", level: 2, flag: "wizard_sculptSpell", status: "module",
    description: "Pay 1 less Mana for Spell delivery.",
    effects: [{
      label: "Sculpt Spell",
      icon: "icons/magic/control/debuff-chains-ropes-purple.webp",
      changes: [
        { key: "system.bonuses.deliveryManaCostReduction", mode: 2, value: "1" }
      ]
    }]
  },

  // L4: Manifold Mind — Focus on 2 spells
  // STATUS: module — Managed AE on focus.maxBonus
  "manifold mind": {
    class: "wizard", level: 4, flag: "wizard_manifoldMind", status: "module",
    description: "Focus on up to 2 Spells at the same time.",
    effects: [{
      label: "Manifold Mind",
      icon: "icons/magic/perception/eye-ringed-glow-angry-small-teal.webp",
      changes: [
        { key: "system.focus.maxBonus", mode: 2, value: "1" }
      ]
    }]
  },

  // L6: Extracurricular — Spend Studied die to cast unknown spell
  // STATUS: todo — needs custom casting flow
  "extracurricular": {
    class: "wizard", level: 6, flag: "wizard_extracurricular", status: "todo",
    description: "Spend a Studied die to cast any Spell, even one you don't know."
  },

  // L8: Manifold Mind (3) — Focus on 3 spells
  // STATUS: module — Additional +1 focus via managed AE
  "manifold mind (3)": {
    class: "wizard", level: 8, flag: "wizard_manifoldMind3", status: "module",
    description: "Focus on up to 3 Spells at the same time.",
    effects: [{
      label: "Manifold Mind (3)",
      icon: "icons/magic/perception/eye-ringed-glow-angry-small-teal.webp",
      changes: [
        // Stacks with L4's +1 for total +2 (base 1 + 2 = 3 focus slots)
        { key: "system.focus.maxBonus", mode: 2, value: "1" }
      ]
    }]
  },

  // L10: Archwizard — Pay 2 less Mana for delivery
  // STATUS: module — Additional delivery reduction
  "archwizard": {
    class: "wizard", level: 10, flag: "wizard_archwizard", status: "module",
    description: "Pay 2 less Mana for Spell delivery.",
    effects: [{
      label: "Archwizard",
      icon: "icons/magic/symbols/star-inverted-yellow.webp",
      changes: [
        // Additional +1 on top of Sculpt Spell's +1 = total 2 delivery reduction
        { key: "system.bonuses.deliveryManaCostReduction", mode: 2, value: "1" }
      ]
    }]
  }
};

/* -------------------------------------------- */
/*  Wizard Runtime Hooks                        */
/* -------------------------------------------- */

export const WizardFeatures = {
  _log(...args) {
    if (game.settings.get(MODULE_ID, "debugMode")) {
      console.log(`${MODULE_ID} | WizardFeatures |`, ...args);
    }
  },

  registerHooks() {
    this._log("Hooks registered.");
  }
};
