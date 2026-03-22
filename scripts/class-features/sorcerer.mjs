/**
 * Sorcerer Class Features
 * Registry entries + runtime hooks for all Sorcerer features.
 */

import { MODULE_ID } from "../vagabond-character-enhancer.mjs";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

export const SORCERER_REGISTRY = {
  "glamour": {
    class: "sorcerer",
    flag: "sorcerer_glamour",
    description: "You can Cast Spells using Influence."
  },
  "tap": {
    class: "sorcerer",
    flag: "sorcerer_tap",
    description: "Gain the Metamagic Perk. When you Cast, you can reduce Max HP to regain Mana equal to (2x the reduction)."
  },
  "spell-slinger": {
    class: "sorcerer",
    flag: "sorcerer_spellSlinger",
    description: "Crit on Cast Checks on 19-20. Your Spells use a d8 damage die rather than d6."
  },
  "quickening": {
    class: "sorcerer",
    flag: "sorcerer_quickening",
    description: "You can skip your Move to Cast a Spell. No Mana can be spent on this Casting."
  },
  "arcane anomaly": {
    class: "sorcerer",
    flag: "sorcerer_arcaneAnomaly",
    description: "You reduce Magic damage you take by half."
  },
  "spell twinning": {
    class: "sorcerer",
    flag: "sorcerer_spellTwinning",
    description: "If you Cast the same Spell twice on a Turn, the second Cast Check is Favored."
  },
  "overpowered": {
    class: "sorcerer",
    flag: "sorcerer_overpowered",
    description: "Crit on Cast Checks on 18-20. When you Cast, you can gain 2 Fatigue to regain Mana equal to your Presence."
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
    // - Quickening: Hook casting to allow Move-skip casting
    // - Arcane Anomaly: Hook damage to halve Magic damage
    // - Spell Twinning: Track same-spell casts per turn, grant Favor
    // - Overpowered: Extend crit range + Fatigue-for-Mana option
  }
};
