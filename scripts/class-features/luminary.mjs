/**
 * Luminary Class Features
 * Registry entries + runtime hooks for all Luminary features.
 */

import { MODULE_ID } from "../vagabond-character-enhancer.mjs";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

export const LUMINARY_REGISTRY = {
  // L1: Theurgy
  // You can Cast Spells using Mysticism.
  // Spells: You learn 4 Spells, two of which must always be Life and Light. You
  // learn 1 other Spell every 2 Luminary Levels hereafter.
  // Mana: Your Maximum Mana is equal to (4 x your Luminary Level), and the highest
  // amount of Mana you can spend to Cast a Spell is equal to (Awareness + half your
  // Luminary Level, round up). You regain spent Mana when you Rest.
  "theurgy": {
    class: "luminary",
    level: 1,
    flag: "luminary_theurgy",
    description: "Cast Spells using Mysticism. Learn 4 Spells (must include Life and Light). Max Mana = 4 x Level."
  },

  // L1: Radiant Healer
  // You get the Assured Healer Perk, and the healing rolls of your Spells can also
  // explode on their highest value.
  // Grants Perk: Assured Healer — Healing rolls of your Spells Explode on a 1.
  "radiant healer": {
    class: "luminary",
    level: 1,
    flag: "luminary_radiantHealer",
    description: "Gain Assured Healer Perk. Spell healing rolls can also explode on their highest value."
  },

  // L2: Overheal
  // If you restore HP that exceeds the Being's Max HP, you can give the excess to
  // yourself or a Being you can see.
  "overheal": {
    class: "luminary",
    level: 2,
    flag: "luminary_overheal",
    description: "Excess healing beyond Max HP can be given to yourself or a visible Being."
  },

  // L4: Ever-Cure
  // When you restore HP, you can end either a Charmed, Confused, Dazed, Frightened,
  // or Sickened Status affecting the Target.
  "ever-cure": {
    class: "luminary",
    level: 4,
    flag: "luminary_everCure",
    description: "When restoring HP, end one Status: Charmed, Confused, Dazed, Frightened, or Sickened."
  },

  // L6: Revivify
  // You can revive a Being with the Life Spell if it has been dead for as long as
  // 1 hour. If you die, you are revived automatically. Afterward, you can't be
  // revived by this Feature for 1 day.
  "revivify": {
    class: "luminary",
    level: 6,
    flag: "luminary_revivify",
    description: "Revive with Life Spell (dead up to 1 hour). Auto-revive on death (once per Day)."
  },

  // L8: Saving Grace
  // Your healing rolls can also explode on a 2.
  "saving grace": {
    class: "luminary",
    level: 8,
    flag: "luminary_savingGrace",
    description: "Healing rolls can also explode on a 2."
  },

  // L10: Life-Giver
  // Beings you revive are revived at 4 Fatigue if their Fatigue was previously
  // higher, and don't gain Fatigue from your Life Spell.
  "life-giver": {
    class: "luminary",
    level: 10,
    flag: "luminary_lifeGiver",
    description: "Revived Beings start at 4 Fatigue (if higher). No Fatigue from your Life Spell."
  }
};

/* -------------------------------------------- */
/*  Luminary Runtime Hooks                      */
/* -------------------------------------------- */

export const LuminaryFeatures = {
  registerHooks() {
    // TODO: Implement runtime hooks
    // - Radiant Healer: Hook healing rolls to add exploding on highest value
    // - Overheal: Hook healing to redistribute excess HP
    // - Ever-Cure: Hook healing to offer status removal
    // - Saving Grace: Extend explode to include 2
    // - Revivify: Hook death to offer auto-revive
  }
};
