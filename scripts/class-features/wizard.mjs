/**
 * Wizard Class Features
 * Registry entries + runtime hooks for all Wizard features.
 */

import { MODULE_ID } from "../vagabond-character-enhancer.mjs";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

export const WIZARD_REGISTRY = {
  "spellcaster": {
    class: "wizard",
    flag: "wizard_spellcaster",
    description: "You can Cast Spells using Arcana."
  },
  "page master": {
    class: "wizard",
    flag: "wizard_pageMaster",
    description: "Gain the Bookworm Perk. When you successfully Cast, spend a Studied die to add its result as bonus damage or healing."
  },
  "sculpt spell": {
    class: "wizard",
    flag: "wizard_sculptSpell",
    description: "You pay 1 less Mana for Spell delivery."
  },
  "manifold mind": {
    class: "wizard",
    flag: "wizard_manifoldMind",
    description: "You can Focus on up to two Spells at the same time."
  },
  "extracurricular": {
    class: "wizard",
    flag: "wizard_extracurricular",
    description: "When you Cast, spend a Studied die to cast any one Spell, even if you don't know it."
  },
  "manifold mind ii": {
    class: "wizard",
    flag: "wizard_manifoldMind2",
    description: "You can Focus on up to three Spells at the same time."
  },
  "archwizard": {
    class: "wizard",
    flag: "wizard_archwizard",
    description: "You pay 2 less Mana for Spell delivery."
  }
};

/* -------------------------------------------- */
/*  Wizard Runtime Hooks                        */
/* -------------------------------------------- */

export const WizardFeatures = {
  registerHooks() {
    // TODO: Implement runtime hooks
    // - Sculpt Spell: Managed AE on deliveryManaCostReduction
    // - Manifold Mind: Increase Focus max via managed AE or flag
    // - Page Master: Hook successful casts to offer Studied die spend
    // - Extracurricular: Hook casting UI to allow unknown spell selection
    // - Archwizard: Managed AE on deliveryManaCostReduction (stacks with Sculpt)
  }
};
