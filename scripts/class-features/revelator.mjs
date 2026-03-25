/**
 * Revelator Class Features
 * Registry entries + runtime hooks for all Revelator features.
 */

import { MODULE_ID } from "../vagabond-character-enhancer.mjs";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

export const REVELATOR_REGISTRY = {
  // L1: Righteous — Gish Perk + Cast using Leadership
  // STATUS: system (casting) + flavor (perk grant)
  "righteous": {
    class: "revelator", level: 1, flag: "revelator_righteous", status: "system",
    description: "Gain Gish Perk. Cast Spells using Leadership. Learn 2 Spells (must include Exalt). Max Mana = 2 × Level."
  },

  // L1: Selfless — Take damage for ally
  // STATUS: todo — needs hook on ally damage to offer redirect
  "selfless": {
    class: "revelator", level: 1, flag: "revelator_selfless", status: "todo",
    description: "Once per Turn, when an Ally you can see takes damage, take the damage instead (can't be reduced)."
  },

  // L2: Lay on Hands — Touch to heal d6+Level, 2 uses/Rest
  // STATUS: todo — needs custom button/macro for healing with use tracking
  "lay on hands": {
    class: "revelator", level: 2, flag: "revelator_layOnHands", status: "todo",
    description: "Touch a Being to restore (d6 + Level) HP. 2 uses per Rest."
  },

  // L4: Paragon's Aura — Free Aura casting + dual focus (Aura + Imbue)
  // STATUS: module — Managed AE for focus bonus
  "paragon's aura": {
    class: "revelator", level: 4, flag: "revelator_paragonsAura", status: "module",
    description: "Free Aura spell delivery (no Mana). Focus on Aura + Imbue simultaneously.",
    effects: [{
      label: "Paragon's Aura",
      icon: "icons/magic/holy/prayer-hands-glowing-yellow.webp",
      changes: [
        { key: "system.focus.maxBonus", mode: 2, value: "1" }
      ]
    }]
  },

  // L6: Divine Resolve — Immune to Blinded, Paralyzed, Sickened
  // STATUS: module — Managed AE for status immunities
  "divine resolve": {
    class: "revelator", level: 6, flag: "revelator_divineResolve", status: "module",
    description: "Can't be Blinded, Paralyzed, or Sickened. Lay on Hands cures these on targets.",
    effects: [{
      label: "Divine Resolve",
      icon: "icons/magic/holy/barrier-shield-winged-cross.webp",
      changes: [
        { key: "system.statusImmunities", mode: 2, value: "blinded,paralyzed,sickened" }
      ]
    }]
  },

  // L8: Holy Diver — After Selfless, next attack has Favor + Presence damage
  // STATUS: todo — depends on Selfless implementation
  "holy diver": {
    class: "revelator", level: 8, flag: "revelator_holyDiver", status: "todo",
    description: "After taking damage for ally via Selfless, next attack has Favor and adds Presence to damage."
  },

  // L10: Sacrosanct — +2 to Saves
  // STATUS: module — Managed AE
  "sacrosanct": {
    class: "revelator", level: 10, flag: "revelator_sacrosanct", status: "module",
    description: "+2 bonus to all Saves.",
    effects: [{
      label: "Sacrosanct",
      icon: "icons/magic/holy/saint-glass-portrait-halo-yellow.webp",
      changes: [
        { key: "system.saves.reflex.bonus", mode: 2, value: "2" },
        { key: "system.saves.endure.bonus", mode: 2, value: "2" },
        { key: "system.saves.will.bonus", mode: 2, value: "2" }
      ]
    }]
  }
};

/* -------------------------------------------- */
/*  Revelator Runtime Hooks                     */
/* -------------------------------------------- */

export const RevelatorFeatures = {
  _log(...args) {
    if (game.settings.get(MODULE_ID, "debugMode")) {
      console.log(`${MODULE_ID} | RevelatorFeatures |`, ...args);
    }
  },

  registerHooks() {
    this._log("Hooks registered.");
  }
};
