/**
 * Witch Class Features
 * Registry entries + runtime hooks for all Witch features.
 */

import { MODULE_ID } from "../vagabond-character-enhancer.mjs";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

export const WITCH_REGISTRY = {
  // L1: Occultist
  // You gain a Perk with the Trained: Mysticism Prerequisite, and you can Cast
  // Spells using Mysticism.
  // Spells: You learn 4 Spells. You learn 1 other Spell every 2 Witch Levels hereafter.
  // Mana: Your Maximum Mana is equal to (4 x your Witch Level), and the highest
  // amount of Mana you can spend is equal to (Awareness + half your Witch Level, round up).
  "occultist": {
    class: "witch",
    level: 1,
    flag: "witch_occultist",
    description: "Gain a Perk with Mysticism prereq. Cast Spells using Mysticism. Learn 4 Spells. Max Mana = 4 x Level."
  },

  // L1: Hex
  // You can choose for the effects of a Spell you Cast (not the damage) to become
  // continual for one of the Targets until you use this Feature on a different Target.
  // This does not require your Focus. The number of Spells you can have as continual
  // this way at the same time is equal to (half your Witch Level, round up).
  "hex": {
    class: "witch",
    level: 1,
    flag: "witch_hex",
    description: "Make Spell effects continual on one Target (no Focus). Max simultaneous = (ceil Witch Level / 2)."
  },

  // L2: Ritualism
  // Once per Shift, you can conduct a 10-minute Ritual as an Action.
  "ritualism": {
    class: "witch",
    level: 2,
    flag: "witch_ritualism",
    description: "Once per Shift, conduct a 10-minute Ritual as an Action."
  },

  // L4: Things Betwixt
  // Once per Scene, you can use your Action or skip your Move to become invisible
  // until your next Turn. This requires your Focus.
  "things betwixt": {
    class: "witch",
    level: 4,
    flag: "witch_thingsBetwixt",
    description: "Once per Scene, Action or skip Move to become invisible until next Turn (requires Focus)."
  },

  // L6: Coventry
  // You can Cast Spells that Near Allies can Cast.
  "coventry": {
    class: "witch",
    level: 6,
    flag: "witch_coventry",
    description: "You can Cast Spells that Near Allies can Cast."
  },

  // L8: Widdershins
  // The Target of your Hex is Weak to damage you deal. This does not ignore Immunity.
  // Further, your Spells ignore Status Immunities of the Target of your Hex.
  "widdershins": {
    class: "witch",
    level: 8,
    flag: "witch_widdershins",
    description: "Hex Target is Weak to your damage (doesn't bypass Immunity). Your Spells ignore Hex Target's Status Immunities."
  },

  // L10: Ritualism Enhancement
  // When you become a 10th Level Witch, you can do so twice per Shift.
  "ritualism (2 uses)": {
    class: "witch",
    level: 10,
    flag: "witch_ritualism2",
    description: "Ritualism upgrade: twice per Shift instead of once."
  }
};

/* -------------------------------------------- */
/*  Witch Runtime Hooks                         */
/* -------------------------------------------- */

export const WitchFeatures = {
  registerHooks() {
    // TODO: Implement runtime hooks
    // - Hex: Hook casting to offer continual option, track hex target
    // - Things Betwixt: Action button for invisibility (once per Scene)
    // - Coventry: Extend spell list with allies' known spells
    // - Widdershins: Hook damage to apply Weakness to Hex target + ignore Status Immunities
  }
};
