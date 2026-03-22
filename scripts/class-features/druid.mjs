/**
 * Druid Class Features
 * Registry entries + runtime hooks for all Druid features.
 */

import { MODULE_ID } from "../vagabond-character-enhancer.mjs";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

export const DRUID_REGISTRY = {
  "primal mystic": {
    class: "druid",
    flag: "druid_primalMystic",
    description: "You can Cast Spells using Mysticism."
  },
  "feral shift": {
    class: "druid",
    flag: "druid_feralShift",
    description: "Gain the Shapechanger Perk. Can take a Beast action as part of the Cast Action to Polymorph."
  },
  "tempest within": {
    class: "druid",
    flag: "druid_tempestWithin",
    description: "Reduce Cold, Fire, and Shock damage by (half Druid Level) per damage die."
  },
  "innervate": {
    class: "druid",
    flag: "druid_innervate",
    description: "Use Action to give a Close Being some Mana, or end one Status (Charmed, Confused, Frightened, Sickened)."
  },
  "ancient growth": {
    class: "druid",
    flag: "druid_ancientGrowth",
    description: "While Focused on self-Polymorph, Focus one additional Spell. Beast attacks deal +1 damage per die."
  },
  "savagery": {
    class: "druid",
    flag: "druid_savagery",
    description: "While polymorphed into a Beast, you have a +1 bonus to Armor."
  },
  "force of nature": {
    class: "druid",
    flag: "druid_forceOfNature",
    description: "If reduced to 0 HP, roll d10. If equal to or lower than Awareness, you are at 1 HP instead."
  }
};

/* -------------------------------------------- */
/*  Druid Runtime Hooks                         */
/* -------------------------------------------- */

export const DruidFeatures = {
  registerHooks() {
    // TODO: Implement runtime hooks
    // - Tempest Within: Managed AE for Cold/Fire/Shock damage reduction (scales with level)
    // - Innervate: Action button for Mana transfer / status removal
    // - Ancient Growth: Hook Focus to allow extra spell + damage bonus in Beast form
    // - Savagery: Managed AE on armorBonus (conditional on polymorph)
    // - Force of Nature: Hook 0 HP to roll death-save die
  }
};
