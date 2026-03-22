/**
 * Revelator Class Features
 * Registry entries + runtime hooks for all Revelator features.
 */

import { MODULE_ID } from "../vagabond-character-enhancer.mjs";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

export const REVELATOR_REGISTRY = {
  // L1: Righteous
  // You gain the Gish Perk and can Cast Spells using Leadership.
  // Spells: You learn 2 Spells, one of which must always be Exalt. You learn 1 other
  // Spell every 3 Revelator Levels hereafter.
  // Mana: Your Maximum Mana is equal to (2 x your Revelator Level), and the highest
  // amount of Mana you can spend is equal to (Presence + half your Revelator Level, round up).
  // Grants Perk: Gish — Use Weapons as Trinkets to Cast. Imbue + attack with same Action.
  "righteous": {
    class: "revelator",
    level: 1,
    flag: "revelator_righteous",
    description: "Gain Gish Perk. Cast Spells using Leadership. Learn 2 Spells (must include Exalt). Max Mana = 2 x Level."
  },

  // L1: Selfless
  // Once per Turn, when an Ally you can see takes damage, you can choose to take
  // the damage instead. This can't be reduced in any way.
  "selfless": {
    class: "revelator",
    level: 1,
    flag: "revelator_selfless",
    description: "Once per Turn, take damage for a visible Ally. Cannot be reduced in any way."
  },

  // L2: Lay on Hands
  // You can Touch a Being to restore (d6 + your Level) HP by using your Action or
  // skipping your Move. You can do so twice, and regain spent uses after you Rest.
  "lay on hands": {
    class: "revelator",
    level: 2,
    flag: "revelator_layOnHands",
    description: "Touch to restore (d6 + Level) HP. Action or skip Move. Two uses per Rest."
  },

  // L4: Paragon's Aura
  // It doesn't cost you Mana to Cast a Spell as a 10' Aura, and you can Focus on a
  // Spell as an Aura and one as Imbue at the same time.
  "paragon's aura": {
    class: "revelator",
    level: 4,
    flag: "revelator_paragonsAura",
    description: "No Mana cost for 10' Aura Spells. Can Focus on Aura and Imbue simultaneously."
  },

  // L6: Divine Resolve
  // You can't be Blinded, Paralyzed, or Sickened. Further, when you restore a
  // Being's HP with your Lay on Hands Feature, they are cured of these Statuses.
  "divine resolve": {
    class: "revelator",
    level: 6,
    flag: "revelator_divineResolve",
    description: "Immune to Blinded, Paralyzed, Sickened. Lay on Hands also cures these Statuses.",
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

  // L8: Holy Diver
  // If you take damage for an Ally with your Selfless Feature, your next attack
  // before the end of your next Turn has Favor and adds your Presence to the damage.
  "holy diver": {
    class: "revelator",
    level: 8,
    flag: "revelator_holyDiver",
    description: "After Selfless damage redirect, next attack has Favor and adds Presence to damage."
  },

  // L10: Sacrosanct
  // You have a +2 bonus to Saves.
  "sacrosanct": {
    class: "revelator",
    level: 10,
    flag: "revelator_sacrosanct",
    description: "+2 bonus to all Saves."
  }
};

/* -------------------------------------------- */
/*  Revelator Runtime Hooks                     */
/* -------------------------------------------- */

export const RevelatorFeatures = {
  registerHooks() {
    // TODO: Implement runtime hooks
    // - Selfless: Hook damage on allies to offer damage redirect
    // - Lay on Hands: Action button for healing (2 uses per Rest)
    // - Paragon's Aura: Managed AE on delivery mana cost
    // - Holy Diver: Hook Selfless trigger to grant Favor + Presence damage
    // - Sacrosanct: Managed AE on universal save bonus
  }
};
