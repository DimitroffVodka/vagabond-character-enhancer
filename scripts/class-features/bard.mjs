/**
 * Bard Class Features
 * Registry entries + runtime hooks for all Bard features.
 */

import { MODULE_ID } from "../vagabond-character-enhancer.mjs";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

export const BARD_REGISTRY = {
  "virtuoso": {
    class: "bard",
    flag: "bard_virtuoso",
    description: "Use Action or skip Move to make a Performance Check. If you pass, your Group gains a chosen benefit for 1 Round."
  },
  "well-versed": {
    class: "bard",
    flag: "bard_wellVersed",
    description: "You ignore Prerequisites for Perks."
  },
  "song of rest": {
    class: "bard",
    flag: "bard_songOfRest",
    description: "During a Breather, you and Allies gain a Studied die and regain additional HP equal to your Presence + Bard Level."
  },
  "starstruck": {
    class: "bard",
    flag: "bard_starstruck",
    description: "When you perform Virtuoso, choose a Near Enemy and make a Performance Check to apply a status condition."
  },
  "bravado": {
    class: "bard",
    flag: "bard_bravado",
    description: "Your Will Saves can't be Hindered while you aren't Incapacitated."
  },
  "awe-inspiring": {
    class: "bard",
    flag: "bard_aweInspiring",
    description: "Your Virtuoso now grants two Favor."
  },
  "encore": {
    class: "bard",
    flag: "bard_encore",
    description: "Your Starstruck Feature can now affect all Near Enemies."
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
    // - Encore: Extend Starstruck to AoE
  }
};
