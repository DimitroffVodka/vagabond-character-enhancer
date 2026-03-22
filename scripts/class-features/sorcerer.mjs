/**
 * Sorcerer Class Features
 * Registry entries + runtime hooks for all Sorcerer features.
 */

import { MODULE_ID } from "../vagabond-character-enhancer.mjs";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

export const SORCERER_REGISTRY = {
  // L1: Glamour
  // You can Cast Spells using Influence.
  // Spells: You learn 4 Spells. You learn 1 other Spell every 2 Sorcerer Levels hereafter.
  // Mana: Your Maximum Mana is equal to (4 x your Sorcerer Level), and the highest
  // amount of Mana you can spend is equal to (Presence + half your Sorcerer Level, round up).
  "glamour": {
    class: "sorcerer",
    level: 1,
    flag: "sorcerer_glamour",
    description: "Cast Spells using Influence. Learn 4 Spells. Max Mana = 4 x Level."
  },

  // L1: Tap
  // You gain the Metamagic Perk. Further, when you Cast, you can reduce your Max HP
  // to regain Mana equal to (2 x the reduction). This reduction ends when you Rest.
  // If you die from this reduction, the Cast resolves before your death, and your
  // body is vaporized.
  "tap": {
    class: "sorcerer",
    level: 1,
    flag: "sorcerer_tap",
    description: "Gain Metamagic Perk. When Casting, reduce Max HP to regain Mana (2x the reduction). Resets on Rest."
  },

  // L2: Spell-Slinger
  // You Crit on Cast Checks on a roll of 19 to 20, and your Spells use a d8 damage
  // die, rather than a d6.
  "spell-slinger": {
    class: "sorcerer",
    level: 2,
    flag: "sorcerer_spellSlinger",
    description: "Crit on Cast Checks on 19-20. Spells use d8 damage die instead of d6."
  },

  // L4: Quickening
  // You can skip your Move to Cast a Spell. No Mana can be spent on this Casting.
  "quickening": {
    class: "sorcerer",
    level: 4,
    flag: "sorcerer_quickening",
    description: "Skip Move to Cast a Spell. No Mana can be spent on this Casting."
  },

  // L6: Arcane Anomaly
  // You reduce damage you take from magic-based sources by half.
  "arcane anomaly": {
    class: "sorcerer",
    level: 6,
    flag: "sorcerer_arcaneAnomaly",
    description: "Reduce magic-based damage taken by half."
  },

  // L8: Spell Twinning
  // If you Cast the same Spell twice on a Turn, the second Cast Check is Favored.
  "spell twinning": {
    class: "sorcerer",
    level: 8,
    flag: "sorcerer_spellTwinning",
    description: "Casting the same Spell twice on a Turn: second Cast Check is Favored."
  },

  // L10: Overpowered
  // You Crit on Cast Checks on a roll of 18 to 20. Further, when you Cast, you can
  // choose to gain 2 Fatigue. If you do, you regain Cd6 Mana at the start of your
  // Turns, and you can spend as much Mana as you like to Cast.
  "overpowered": {
    class: "sorcerer",
    level: 10,
    flag: "sorcerer_overpowered",
    description: "Crit on Cast Checks 18-20. Gain 2 Fatigue to regain Cd6 Mana per Turn and remove Mana spending cap."
  }
};

/* -------------------------------------------- */
/*  Sorcerer Runtime Hooks                      */
/* -------------------------------------------- */

export const SorcererFeatures = {
  registerHooks() {
    // TODO: Implement runtime hooks
    // - Spell-Slinger: Managed AE on castCritBonus + spellDamageDieSize
    // - Tap: Hook casting to offer HP-for-Mana trade
    // - Quickening: Hook casting to allow Move-skip casting (no Mana)
    // - Arcane Anomaly: Hook damage to halve magic damage
    // - Spell Twinning: Track same-spell casts per turn, grant Favor
    // - Overpowered: Extend crit range + Fatigue-for-Mana option
  }
};
