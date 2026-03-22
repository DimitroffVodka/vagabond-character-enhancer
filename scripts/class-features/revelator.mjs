/**
 * Revelator Class Features
 * Registry entries + runtime hooks for all Revelator features.
 */

import { MODULE_ID } from "../vagabond-character-enhancer.mjs";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

export const REVELATOR_REGISTRY = {
  "righteous": {
    class: "revelator",
    flag: "revelator_righteous",
    description: "Gain the Gish Perk. Cast Spells using Leadership."
  },
  "selfless": {
    class: "revelator",
    flag: "revelator_selfless",
    description: "Once per Turn, when an Ally you see takes damage, take the damage instead. Can't be reduced."
  },
  "lay on hands": {
    class: "revelator",
    flag: "revelator_layOnHands",
    description: "Touch a Being to restore (d6 + Level) HP using Action or skipping Move. Twice per Shift, regains one on Breather."
  },
  "paragon's aura": {
    class: "revelator",
    flag: "revelator_paragonsAura",
    description: "No Mana cost for 10' Aura Spells. Can Focus on Aura and Imbue simultaneously."
  },
  "divine resolve": {
    class: "revelator",
    flag: "revelator_divineResolve",
    description: "Can't be Blinded, Paralyzed, or Sickened. Lay on Hands also ends one of those Statuses.",
    effects: [
      {
        label: "Divine Resolve",
        icon: "icons/svg/holy-shield.svg",
        changes: [
          { key: "system.statusImmunities", mode: 2, value: "blinded" },
          { key: "system.statusImmunities", mode: 2, value: "paralyzed" },
          { key: "system.statusImmunities", mode: 2, value: "sickened" }
        ]
      }
    ]
  },
  "holy diver": {
    class: "revelator",
    flag: "revelator_holyDiver",
    description: "If you take damage for an Ally via Selfless, next attack has Favor and deals an extra die of damage."
  },
  "sacrosanct": {
    class: "revelator",
    flag: "revelator_sacrosanct",
    description: "You have a +2 bonus to all Saves."
  }
};

/* -------------------------------------------- */
/*  Revelator Runtime Hooks                     */
/* -------------------------------------------- */

export const RevelatorFeatures = {
  registerHooks() {
    // TODO: Implement runtime hooks
    // - Selfless: Hook damage on allies to offer damage redirect
    // - Lay on Hands: Action button for healing
    // - Paragon's Aura: Managed AE on delivery mana cost
    // - Holy Diver: Hook Selfless trigger to grant Favor + extra die
    // - Sacrosanct: Managed AE on universal save bonus
  }
};
