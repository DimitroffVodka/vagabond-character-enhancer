/**
 * Luminary Class Features
 * Registry entries + runtime hooks for all Luminary features.
 */

import { MODULE_ID } from "../vagabond-character-enhancer.mjs";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

export const LUMINARY_REGISTRY = {
  "theurgy": {
    class: "luminary",
    flag: "luminary_theurgy",
    description: "You can Cast Spells using Mysticism."
  },
  "radiant healer": {
    class: "luminary",
    flag: "luminary_radiantHealer",
    description: "Gain the Assured Healer Perk. Healing rolls of your Spells can explode on their highest value."
  },
  "overheal": {
    class: "luminary",
    flag: "luminary_overheal",
    description: "If healing exceeds Max HP, give the excess to yourself or a Being you can see."
  },
  "ever-cure": {
    class: "luminary",
    flag: "luminary_everCure",
    description: "When you restore HP, end a Charmed, Confused, Dazed, Frightened, or Sickened Status on the Target."
  },
  "revivify": {
    class: "luminary",
    flag: "luminary_revivify",
    description: "Revive a Being dead for up to 1 hour with Life Spell. If you die, auto-revive once per Day."
  },
  "saving grace": {
    class: "luminary",
    flag: "luminary_savingGrace",
    description: "Your healing rolls can also explode on a 2."
  },
  "life-giver": {
    class: "luminary",
    flag: "luminary_lifeGiver",
    description: "Revived Beings start at 4 Fatigue (if higher) and don't gain Fatigue from Life Spell."
  }
};

/* -------------------------------------------- */
/*  Luminary Runtime Hooks                      */
/* -------------------------------------------- */

export const LuminaryFeatures = {
  registerHooks() {
    // TODO: Implement runtime hooks
    // - Radiant Healer: Hook healing rolls to add exploding
    // - Overheal: Hook healing to redistribute excess HP
    // - Ever-Cure: Hook healing to offer status removal
    // - Saving Grace: Extend explode to include 2
    // - Revivify: Hook death to offer auto-revive
  }
};
