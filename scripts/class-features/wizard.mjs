/**
 * Wizard Class Features
 * Registry entries + runtime hooks for all Wizard features.
 */

import { MODULE_ID } from "../vagabond-character-enhancer.mjs";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

export const WIZARD_REGISTRY = {
  // L1: Spellcaster
  // You can Cast Spells using Arcana.
  // Spells: You learn 4 Spells. You learn 1 other Spell every 2 Wizard Levels hereafter.
  // Mana: Your Maximum Mana is equal to (4 x your Wizard Level), and the highest
  // amount of Mana you can spend is equal to (Reason + half your Wizard Level, round up).
  // You regain spent Mana when you Rest or Study.
  "spellcaster": {
    class: "wizard",
    level: 1,
    flag: "wizard_spellcaster",
    description: "Cast Spells using Arcana. Learn 4 Spells. Max Mana = 4 x Level. Regain Mana on Rest or Study."
  },

  // L1: Page Master
  // You gain the Bookworm Perk. Additionally, when you successfully Cast a Spell,
  // you can spend one of your Studied dice and add it to the damage or healing roll.
  // Grants Perk: Bookworm — Gain an extra Studied die when you Study. Can take multiple times.
  "page master": {
    class: "wizard",
    level: 1,
    flag: "wizard_pageMaster",
    description: "Gain Bookworm Perk. On successful Cast, spend a Studied die to add it to damage or healing."
  },

  // L2: Sculpt Spell
  // You pay 1 less Mana for Spell delivery.
  "sculpt spell": {
    class: "wizard",
    level: 2,
    flag: "wizard_sculptSpell",
    description: "Pay 1 less Mana for Spell delivery."
  },

  // L4: Manifold Mind
  // You can Focus on up to two Spells at the same time.
  "manifold mind": {
    class: "wizard",
    level: 4,
    flag: "wizard_manifoldMind",
    description: "Focus on up to two Spells at the same time."
  },

  // L6: Extracurricular
  // When you Cast, you can spend a Studied die to cast any one Spell with that
  // Casting, even if it isn't a Spell you know.
  "extracurricular": {
    class: "wizard",
    level: 6,
    flag: "wizard_extracurricular",
    description: "Spend a Studied die to Cast any Spell, even if not known."
  },

  // L8: Manifold Mind Enhancement
  // When you become an 8th Level Wizard, you can Focus on up to three Spells at
  // the same time.
  "manifold mind ii": {
    class: "wizard",
    level: 8,
    flag: "wizard_manifoldMind2",
    description: "Manifold Mind upgrade: Focus on up to three Spells."
  },

  // L10: Archwizard
  // You pay 2 less Mana for Spell delivery.
  "archwizard": {
    class: "wizard",
    level: 10,
    flag: "wizard_archwizard",
    description: "Pay 2 less Mana for Spell delivery."
  }
};

/* -------------------------------------------- */
/*  Wizard Runtime Hooks                        */
/* -------------------------------------------- */

export const WizardFeatures = {
  registerHooks() {
    // TODO: Implement runtime hooks
    // - Sculpt Spell: Managed AE on deliveryManaCostReduction
    // - Manifold Mind: Increase Focus max (scales at L8)
    // - Page Master: Hook successful casts to offer Studied die spend
    // - Extracurricular: Hook casting UI to allow unknown spell selection
    // - Archwizard: Managed AE on deliveryManaCostReduction (stacks with Sculpt)
  }
};
