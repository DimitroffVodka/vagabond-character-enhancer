/**
 * Sorcerer Class Features
 * Registry entries + runtime hooks for all Sorcerer features.
 */

import { MODULE_ID, log } from "../utils.mjs";
import { SorcererTap } from "./sorcerer-tap.mjs";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

export const SORCERER_REGISTRY = {
  // L1: Glamour — Cast Spells using Influence
  // STATUS: system
  "glamour": {
    class: "sorcerer", level: 1, flag: "sorcerer_glamour", status: "system",
    description: "Cast Spells using Influence. Learn 4 Spells. Max Mana = 4 × Level."
  },

  // L1: Tap — Metamagic Perk + reduce Max HP to regain Mana
  // STATUS: module — sheet button + cast-dialog link, managed AE on system.health.bonus
  // See scripts/class-features/sorcerer-tap.mjs for the dialog + reduction logic.
  // The Metamagic Perk grant itself is handled by the perk-features registry —
  // Tap just sets `sorcerer_tap` and the player adds Metamagic to their perk list.
  "tap": {
    class: "sorcerer", level: 1, flag: "sorcerer_tap", status: "module",
    description: "Gain Metamagic Perk. Reduce Max HP to regain Mana (2× the reduction). Restores on Rest."
  },

  // L2: Spell-Slinger — Crit on 19-20, spell die d8
  // STATUS: module — Managed AE
  "spell-slinger": {
    class: "sorcerer", level: 2, flag: "sorcerer_spellSlinger", status: "module",
    description: "Crit on Cast Checks on 19-20. Spell damage die becomes d8.",
    effects: [{
      label: "Spell-Slinger",
      icon: "icons/magic/lightning/bolt-strike-blue.webp",
      changes: [
        { key: "system.castCritBonus", mode: 2, value: "-1" },
        { key: "system.spellDamageDieSize", mode: 5, value: "8" }
      ]
    }]
  },

  // L4: Quickening — Skip Move to Cast (no Mana)
  // STATUS: flavor — action economy choice
  "quickening": {
    class: "sorcerer", level: 4, flag: "sorcerer_quickening", status: "flavor",
    description: "Skip your Move to Cast a Spell (no Mana can be spent)."
  },

  // L6: Arcane Anomaly — half damage from magic sources
  // STATUS: flavor — needs incoming damage hook for magic detection
  "arcane anomaly": {
    class: "sorcerer", level: 6, flag: "sorcerer_arcaneAnomaly", status: "flavor",
    description: "Reduce damage from magic-based sources by half."
  },

  // L8: Spell Twinning — 2nd cast of same spell is Favored
  // STATUS: flavor — needs turn-based spell tracking
  "spell twinning": {
    class: "sorcerer", level: 8, flag: "sorcerer_spellTwinning", status: "flavor",
    description: "If you Cast the same Spell twice on a Turn, the second Cast Check is Favored."
  },

  // L10: Overpowered — Crit on 18-20 + Fatigue for Mana regen
  // STATUS: module (crit) + todo (fatigue/mana)
  "overpowered": {
    class: "sorcerer", level: 10, flag: "sorcerer_overpowered", status: "module",
    description: "Crit on Cast Checks on 18-20. Can gain 2 Fatigue to regain Cd6 Mana and remove Mana cap.",
    effects: [{
      label: "Overpowered",
      icon: "icons/magic/lightning/bolt-strike-purple.webp",
      changes: [
        // Additional -1 on top of Spell-Slinger's -1 = total -2 = crit on 18
        { key: "system.castCritBonus", mode: 2, value: "-1" }
      ]
    }]
  }
};

/* -------------------------------------------- */
/*  Sorcerer Runtime Hooks                      */
/* -------------------------------------------- */

export const SorcererFeatures = {

  registerHooks() {
    SorcererTap.registerHooks();
    log("Sorcerer","Hooks registered.");
  },

  /** Sub-feature accessor for API exposure in the main entry point. */
  tap: SorcererTap
};
