/**
 * Fighter Class Features
 * Registry entries + runtime hooks for all Fighter features.
 */

import { MODULE_ID } from "../vagabond-character-enhancer.mjs";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

/**
 * All Fighter class features.
 * Keys are lowercase feature names matching the class compendium's levelFeatures.
 *
 * Status key:
 *   "system"  — Fully handled by mordachai's base system. Module does nothing.
 *   "module"  — Fully handled by this module (managed AE and/or runtime hook).
 *   "partial" — System handles part, module handles the rest. See notes.
 *   "flavor"  — Roleplay/narrative only. Nothing to automate.
 *   "todo"    — Needs implementation. Not yet working.
 */
export const FIGHTER_REGISTRY = {
  // ──────────────────────────────────────────────
  // L1: Fighting Style
  // ──────────────────────────────────────────────
  // RULES: You gain the Situational Awareness Perk and another Perk with the
  // Melee or Ranged Training Prerequisite, ignoring prerequisites for this Perk.
  //
  // STATUS: flavor — Perk grants are manual character creation choices.
  "fighting style": {
    class: "fighter",
    level: 1,
    flag: "fighter_fightingStyle",
    status: "flavor",
    description: "Gain Situational Awareness Perk + another Perk with Melee or Ranged Training Prerequisite (ignoring prereqs)."
  },

  // ──────────────────────────────────────────────
  // L1: Valor
  // ──────────────────────────────────────────────
  // RULES: The roll required for you to Crit on Attack Checks, and Saves to
  // Dodge or Block Attacks is reduced by 1, and is reduced by 1 more when you
  // reach 4th and 8th Levels in this Class.
  //
  // STATUS: module
  //
  // MODULE HANDLES:
  //   - Managed AE: Reduces crit threshold on attack checks and defensive saves.
  //     Uses attackCritBonus (covers all attack types) and reflexCritBonus +
  //     endureCritBonus (for Dodge/Block saves).
  //     Scaling: L1=-1, L4=-2, L8=-3. Since AEs can't scale with level, we
  //     create the AE with the current bonus and re-sync when level changes.
  //
  // NOTE: The feature detector rescans on level change, so the AE will be
  // recreated with the correct value when the character levels up.
  "valor": {
    class: "fighter",
    level: 1,
    flag: "fighter_valor",
    status: "module",
    description: "Crit on Attack Checks and Dodge/Block Saves reduced by 1. Increases to -2 at L4, -3 at L8.",
    effects: [
      {
        label: "Valor",
        icon: "icons/skills/melee/strike-sword-slashing-red.webp",
        changes: []  // Populated dynamically in _getValorChanges()
      }
    ]
  },

  // ──────────────────────────────────────────────
  // L2: Momentum
  // ──────────────────────────────────────────────
  // RULES: If you pass a Save against an attack, the next attack you make
  // before the end of your next Turn is Favored.
  //
  // STATUS: todo — Needs hook on save result to grant favor on next attack.
  // Complex: requires tracking "passed save against attack" and applying
  // favor to the next attack roll within a time window.
  "momentum": {
    class: "fighter",
    level: 2,
    flag: "fighter_momentum",
    status: "todo",
    description: "Pass a Save against an attack → next attack before end of next Turn is Favored."
  },

  // ──────────────────────────────────────────────
  // L6: Muster for Battle
  // ──────────────────────────────────────────────
  // RULES: You have two Actions on your first Turn.
  //
  // STATUS: todo — Needs combat start hook to grant extra action on first turn.
  // The system doesn't have an "actions per turn" field, so this may need
  // a chat reminder rather than mechanical enforcement.
  "muster for battle": {
    class: "fighter",
    level: 6,
    flag: "fighter_musterForBattle",
    status: "todo",
    description: "You have two Actions on your first Turn of Combat."
  },

  // ──────────────────────────────────────────────
  // L10: Harrying
  // ──────────────────────────────────────────────
  // RULES: You can attack twice with the Attack Action, rather than just once.
  //
  // STATUS: todo — Similar to Muster, the system doesn't enforce "attacks per
  // action." This may need a chat reminder or UI indicator.
  "harrying": {
    class: "fighter",
    level: 10,
    flag: "fighter_harrying",
    status: "todo",
    description: "Attack twice with the Attack Action instead of once."
  }
};

/* -------------------------------------------- */
/*  Fighter Runtime Hooks                       */
/* -------------------------------------------- */

export const FighterFeatures = {
  _log(...args) {
    if (game.settings.get(MODULE_ID, "debugMode")) {
      console.log(`${MODULE_ID} | FighterFeatures |`, ...args);
    }
  },

  _hasFeature(actor, flag) {
    return actor.getFlag(MODULE_ID, `features.${flag}`);
  },

  registerHooks() {
    // Valor: Dynamic AE changes based on level
    // The feature detector creates the AE, but we need to update its changes
    // when the actor is scanned (level-dependent values).
    Hooks.on("updateActor", (actor, changes) => {
      if (actor.type !== "character") return;
      if (!changes.system?.attributes?.level) return;
      // Level changed — rescan will handle re-creating the AE with correct values
      // via the feature detector's _syncManagedEffects
    });

    // Override the Valor AE changes at scan time
    Hooks.on(`${MODULE_ID}.preSyncEffects`, (actor, desiredEffects) => {
      this._applyValorScaling(actor, desiredEffects);
    });

    this._log("Hooks registered.");
  },

  /**
   * Calculate Valor crit bonus based on fighter level.
   * L1: -1, L4: -2, L8: -3
   */
  _getValorBonus(level) {
    if (level >= 8) return -3;
    if (level >= 4) return -2;
    return -1;
  },

  /**
   * Update the Valor AE's changes array with level-appropriate values.
   * Called during effect sync to inject the correct crit bonuses.
   */
  _applyValorScaling(actor, desiredEffects) {
    const valorKey = "fighter_valor_Valor";
    const effectDef = desiredEffects.get(valorKey);
    if (!effectDef) return;

    const level = actor.system.attributes?.level?.value ?? 1;
    const bonus = this._getValorBonus(level);

    effectDef.changes = [
      // Attack crit bonus (covers melee, ranged, brawl, finesse attacks)
      { key: "system.attackCritBonus", mode: 2, value: `${bonus}` },
      // Dodge saves (Reflex)
      { key: "system.reflexCritBonus", mode: 2, value: `${bonus}` },
      // Block saves (Endure)
      { key: "system.endureCritBonus", mode: 2, value: `${bonus}` }
    ];

    this._log(`Valor scaling: Level ${level} → crit bonus ${bonus}`);
  }
};
