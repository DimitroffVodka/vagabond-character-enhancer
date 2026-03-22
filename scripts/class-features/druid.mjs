/**
 * Druid Class Features
 * Registry entries + runtime hooks for all Druid features.
 */

import { MODULE_ID } from "../vagabond-character-enhancer.mjs";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

export const DRUID_REGISTRY = {
  // L1: Primal Mystic
  // You can Cast Spells using Mysticism.
  // Spells: You learn 4 Spells, one of which must always be Polymorph. You learn
  // 1 other Spell every 2 Levels in this Class hereafter.
  // Mana: Your Maximum Mana is equal to (4 x your Druid Level), and the highest
  // amount of Mana you can spend is equal to (Awareness + half your Druid Level, round up).
  "primal mystic": {
    class: "druid",
    level: 1,
    flag: "druid_primalMystic",
    description: "Cast Spells using Mysticism. Learn 4 Spells (must include Polymorph). Max Mana = 4 x Level."
  },

  // L1: Feral Shift
  // You get the Shapechanger Perk and you can take an Action granted by the Beast
  // you turn into as a part of the Cast Action.
  "feral shift": {
    class: "druid",
    level: 1,
    flag: "druid_feralShift",
    description: "Gain Shapechanger Perk. Take a Beast Action as part of the Polymorph Cast Action."
  },

  // L2: Tempest Within
  // You reduce Cold, Fire, and Shock damage you take by (half your Druid Level) per
  // damage die.
  "tempest within": {
    class: "druid",
    level: 2,
    flag: "druid_tempestWithin",
    description: "Reduce Cold, Fire, and Shock damage by (half Druid Level) per damage die."
  },

  // L4: Innervate
  // You can use your Action to give a Close Being some of your Mana, or to end one
  // Status affecting it from either Charmed, Confused, Frightened, or Sickened.
  // This can be yourself.
  "innervate": {
    class: "druid",
    level: 4,
    flag: "druid_innervate",
    description: "Action to transfer Mana to a Close Being, or end Charmed/Confused/Frightened/Sickened. Can target self."
  },

  // L6: Ancient Growth
  // While you Focus on a Casting of Polymorph that only Targets yourself, you can
  // Focus one additional Spell. Further, your attacks with Beasts you Polymorph into
  // count as (+1) Relics. This bonus increases every 6 Druid Levels hereafter.
  "ancient growth": {
    class: "druid",
    level: 6,
    flag: "druid_ancientGrowth",
    description: "Self-Polymorph Focus allows one additional Focus Spell. Beast attacks count as (+1) Relics (increases every 6 levels)."
  },

  // L8: Savagery
  // While you are polymorphed into a Beast, you have a +1 bonus to Armor.
  "savagery": {
    class: "druid",
    level: 8,
    flag: "druid_savagery",
    description: "While polymorphed into a Beast, +1 bonus to Armor."
  },

  // L10: Force of Nature
  // If you are reduced to 0 HP, roll a d10. If the result is equal to or lower than
  // your Awareness, you are instead at 1 HP.
  "force of nature": {
    class: "druid",
    level: 10,
    flag: "druid_forceOfNature",
    description: "At 0 HP, roll d10. If equal to or lower than Awareness, you are at 1 HP instead."
  }
};

/* -------------------------------------------- */
/*  Druid Runtime Hooks                         */
/* -------------------------------------------- */

export const DruidFeatures = {
  registerHooks() {
    // TODO: Implement runtime hooks
    // - Tempest Within: Hook damage to reduce Cold/Fire/Shock (scales with level)
    // - Innervate: Action button for Mana transfer / status removal
    // - Ancient Growth: Hook Focus to allow extra spell + damage bonus in Beast form
    // - Savagery: Conditional AE on armorBonus (only while polymorphed)
    // - Force of Nature: Hook 0 HP to roll Awareness save
  }
};
