/**
 * Alchemist Class Features
 * Registry entries + runtime hooks for all Alchemist features.
 */

import { MODULE_ID } from "../vagabond-character-enhancer.mjs";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

export const ALCHEMIST_REGISTRY = {
  "alchemy": {
    class: "alchemist",
    flag: "alchemist_alchemy",
    description: "Choose 4 Alchemical Items. You only need 5s of Materials and Alchemy Tools to Craft them."
  },
  "catalyze": {
    class: "alchemist",
    flag: "alchemist_catalyze",
    description: "Gain the Deft Hands Perk, and you can Craft alchemical items with the Use Action."
  },
  "eureka": {
    class: "alchemist",
    flag: "alchemist_eureka",
    description: "Gain a Studied die when you Crit on a Craft Check."
  },
  "potency": {
    class: "alchemist",
    flag: "alchemist_potency",
    description: "The damage and healing dice of your alchemical items can explode."
  },
  "mix": {
    class: "alchemist",
    flag: "alchemist_mix",
    description: "Combine two alchemical items together, causing both effects when Used."
  },
  "big bang": {
    class: "alchemist",
    flag: "alchemist_bigBang",
    description: "Gain a d6 bonus to alchemical damage/healing, and they can explode on their two highest values."
  },
  "prima materia": {
    class: "alchemist",
    flag: "alchemist_primaMateria",
    description: "Once per Day, Craft an alchemical item with value up to 10g without materials."
  }
};

/* -------------------------------------------- */
/*  Alchemist Runtime Hooks                     */
/* -------------------------------------------- */

export const AlchemistFeatures = {
  registerHooks() {
    // TODO: Implement runtime hooks
    // - Eureka: Hook crit results on Craft checks to award Studied die
    // - Potency: Hook into explode values for alchemical weapons
    // - Big Bang: Expand explode values + add d6 bonus damage
    // - Mix: UI for combining two alchemical items
  }
};
