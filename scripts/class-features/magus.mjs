/**
 * Magus Class Features
 * Registry entries + runtime hooks for all Magus features.
 */

import { MODULE_ID } from "../vagabond-character-enhancer.mjs";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

export const MAGUS_REGISTRY = {
  "spellstriker": {
    class: "magus",
    flag: "magus_spellstriker",
    description: "Gain the Gish Perk. Cast Spells using Arcana. Learn Ward + 1 other Spell."
  },
  "esoteric eye": {
    class: "magus",
    flag: "magus_esotericEye",
    description: "Use Action or skip Move to learn if magic is affecting a Target you can see. Once per Shift."
  },
  "spell parry": {
    class: "magus",
    flag: "magus_spellParry",
    description: "Block Casts that include you if they call for Reflex Save or have Touch/Remote delivery. Crit Block negates the Cast."
  },
  "arcane recall": {
    class: "magus",
    flag: "magus_arcaneRecall",
    description: "Use Action to change one known Spell (not Ward). Can't do again until next Shift."
  },
  "spell surge": {
    class: "magus",
    flag: "magus_spellSurge",
    description: "If you pass a Block against a Cast by 10+, reflect the Cast back at the Caster."
  },
  "aegis obscura": {
    class: "magus",
    flag: "magus_aegisObscura",
    description: "You and your Ward Target have Allsight and take half damage from magic-based sources."
  },
  "spell surge (8+)": {
    class: "magus",
    flag: "magus_spellSurge8",
    description: "Spell Surge now triggers if you pass by 8 or more, rather than 10."
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
