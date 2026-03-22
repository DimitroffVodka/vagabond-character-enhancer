/**
 * Magus Class Features
 * Registry entries + runtime hooks for all Magus features.
 */

import { MODULE_ID } from "../vagabond-character-enhancer.mjs";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

export const MAGUS_REGISTRY = {
  // L1: Spellstriker
  // You gain the Gish Perk and you can Cast Spells using Arcana.
  // Spells: You learn 2 Spells, one of which must always be Ward. You learn 1 other
  // Spell every 3 Magus Levels hereafter.
  // Mana: Your Maximum Mana is equal to (2 x your Magus Level), and the highest
  // amount of Mana you can spend is equal to (Reason + half your Magus Level, round up).
  "spellstriker": {
    class: "magus",
    level: 1,
    flag: "magus_spellstriker",
    description: "Gain Gish Perk. Cast Spells using Arcana. Learn 2 Spells (must include Ward). Max Mana = 2 x Level."
  },

  // L1: Esoteric Eye
  // If you can see a Target, you can use your Action or skip your Move to learn if
  // any magic is currently affecting it. You can do so once per Shift, but you can
  // spend 1 Mana to do so again.
  "esoteric eye": {
    class: "magus",
    level: 1,
    flag: "magus_esotericEye",
    description: "Action or skip Move to detect magic on a visible Target. Once per Shift (1 Mana for extra use)."
  },

  // L2: Spell Parry
  // You can Block Casts that include you as a Target if it either calls for a Reflex
  // Save or has a delivery of Touch or Remote. If you Crit to Block a Cast, you can
  // dispel the effect.
  "spell parry": {
    class: "magus",
    level: 2,
    flag: "magus_spellParry",
    description: "Block Casts targeting you (Reflex Save or Touch/Remote delivery). Crit Block dispels the effect."
  },

  // L4: Arcane Recall
  // You can use your Action to open your esoteric eye of recall, allowing you to
  // change one of your Spells Known that isn't Ward. You can't do so again until
  // you Rest or take 1 Fatigue to do so.
  "arcane recall": {
    class: "magus",
    level: 4,
    flag: "magus_arcaneRecall",
    description: "Action to change one known Spell (not Ward). Once per Rest (or 1 Fatigue for extra use)."
  },

  // L6: Spell Surge
  // If you pass a Check to Block a Cast by 10 or more, you can reflect the Cast
  // back at the Caster.
  "spell surge": {
    class: "magus",
    level: 6,
    flag: "magus_spellSurge",
    description: "Block a Cast by 10+: reflect it back at the Caster."
  },

  // L8: Aegis Obscura
  // You and the Target of your Ward Spell have Allsight and take half damage from
  // magic-based sources.
  "aegis obscura": {
    class: "magus",
    level: 8,
    flag: "magus_aegisObscura",
    description: "You and your Ward Target have Allsight and take half damage from magic-based sources."
  },

  // L10: Spell Surge Enhancement
  // When you become a 10th Level Magus, it triggers if you pass by 8 or more.
  "spell surge (8+)": {
    class: "magus",
    level: 10,
    flag: "magus_spellSurge8",
    description: "Spell Surge now triggers on Block by 8+ instead of 10+."
  }
};

/* -------------------------------------------- */
/*  Magus Runtime Hooks                         */
/* -------------------------------------------- */

export const MagusFeatures = {
  registerHooks() {
    // TODO: Implement runtime hooks
    // - Spell Parry: Hook Block saves against Casts
    // - Spell Surge: Hook Block results to reflect Casts
    // - Aegis Obscura: Managed AE for Allsight + magic damage reduction
    // - Arcane Recall: Action button to swap known Spell
  }
};
