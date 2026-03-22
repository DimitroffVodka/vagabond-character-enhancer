/**
 * Bard Class Features
 * Registry entries + runtime hooks for all Bard features.
 */

import { MODULE_ID } from "../vagabond-character-enhancer.mjs";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

export const BARD_REGISTRY = {
  // L1: Virtuoso
  // You can use your Action or skip your Move to make a Performance Check. If you
  // pass, your Group gains one of the following benefits of your choice for that Round:
  // - Inspiration: d6 bonus to Healing rolls
  // - Resolve: Favor on Saves
  // - Valor: Favor on Attack and Cast Checks
  "virtuoso": {
    class: "bard",
    level: 1,
    flag: "bard_virtuoso",
    description: "Action or skip Move for Performance Check. Pass grants group buff for 1 Round: Inspiration (d6 healing), Resolve (Favor Saves), or Valor (Favor Attack/Cast)."
  },

  // L1: Well-Versed
  // You ignore Prerequisites for Perks, and gain a Perk of your choice.
  "well-versed": {
    class: "bard",
    level: 1,
    flag: "bard_wellVersed",
    description: "You ignore Prerequisites for Perks, and gain a Perk of your choice."
  },

  // L2: Song of Rest
  // During a Breather, you and your Allies gain a Studied die and regain additional
  // HP equal to (your Presence + your Bard Level).
  "song of rest": {
    class: "bard",
    level: 2,
    flag: "bard_songOfRest",
    description: "During a Breather, you and Allies gain a Studied die and regain additional HP equal to Presence + Bard Level."
  },

  // L4: Starstruck
  // When you perform Virtuoso, you can choose a Near Enemy who hears the performance
  // and make a Performance Check. If you pass, you can choose one of the following
  // Statuses that affects it for Cd4 Rounds: Berserk, Charmed, Confused, Frightened.
  "starstruck": {
    class: "bard",
    level: 4,
    flag: "bard_starstruck",
    description: "On Virtuoso, choose a Near Enemy and make Performance Check. Pass applies Berserk, Charmed, Confused, or Frightened for Cd4 Rounds."
  },

  // L6: Bravado
  // Your Will Saves can't be Hindered while you aren't Incapacitated, and you can
  // ignore effects that rely on you hearing them to be affected (such as a banshee's scream).
  "bravado": {
    class: "bard",
    level: 6,
    flag: "bard_bravado",
    description: "Will Saves can't be Hindered while not Incapacitated. Ignore effects that rely on hearing."
  },

  // L8: Climax
  // Favor and bonus dice you grant can Explode.
  "climax": {
    class: "bard",
    level: 8,
    flag: "bard_climax",
    description: "Favor and bonus dice you grant can Explode."
  },

  // L10: Encore
  // Your Starstruck Feature can now affect all Near Enemies.
  "encore": {
    class: "bard",
    level: 10,
    flag: "bard_encore",
    description: "Starstruck can now affect all Near Enemies."
  }
};

/* -------------------------------------------- */
/*  Bard Runtime Hooks                          */
/* -------------------------------------------- */

export const BardFeatures = {
  registerHooks() {
    // TODO: Implement runtime hooks
    // - Virtuoso: Standalone action button -> performance check -> create temp AEs on party
    // - Song of Rest: Hook rest dialog to add healing formula
    // - Starstruck: Apply status conditions after Virtuoso
    // - Bravado: Managed AE or hook to prevent Will Save Hinder
    // - Climax: Hook granted dice to add exploding
    // - Encore: Extend Starstruck to AoE
  }
};
