/**
 * Merchant Class Features
 * Registry entries + runtime hooks for all Merchant features.
 */

import { MODULE_ID, log, hasFeature } from "../utils.mjs";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

export const MERCHANT_REGISTRY = {
  // L1: Gold Sink — Shop tab on character sheet
  // STATUS: module — Gold Sink tab with buy/sell from compendium items
  "gold sink": {
    class: "merchant", level: 1, flag: "merchant_goldSink", status: "module",
    description: "Gain Deft Hands Perk. Shop tab to buy/sell gear, weapons, armor, and alchemical items."
  },

  // L1: Deep Pockets — Extra item slots
  // STATUS: module — Managed AE on inventory.bonusSlots
  "deep pockets": {
    class: "merchant", level: 1, flag: "merchant_deepPockets", status: "module",
    description: "Extra Item Slots equal to half your Merchant Level (round up).",
    effects: []  // Populated dynamically — scales with level
  },

  // L2: Bang for Your Buck — Luck to not expend items
  // STATUS: todo — needs hook on item use to roll refund die
  "bang for your buck": {
    class: "merchant", level: 2, flag: "merchant_bangForYourBuck", status: "todo",
    description: "When using an Item, spend 1 Luck and roll d10. If lower than remaining Luck, Item not expended."
  },

  // L4: Diamond Hands — Remove/add Relic powers
  // STATUS: flavor — downtime activity, no automation needed
  "diamond hands": {
    class: "merchant", level: 4, flag: "merchant_diamondHands", status: "flavor",
    description: "Spend a Shift to transfer a Power from one Relic to another Item."
  },

  // L6: Treasure Seeker — Sense gold/gems/Relics within Near
  // STATUS: flavor — narrative sense, no mechanical automation
  "treasure seeker": {
    class: "merchant", level: 6, flag: "merchant_treasureSeeker", status: "flavor",
    description: "Sense gold, gems, and Relics within Near as if by Telepathy."
  },

  // L8: Bang for Your Buck (d8) — Upgrade refund die
  // STATUS: todo — depends on L2 implementation
  "bang for your buck (d8)": {
    class: "merchant", level: 8, flag: "merchant_bangForYourBuckD8", status: "todo",
    description: "Bang for Your Buck upgrade: roll d8 instead of d10."
  },

  // L10: Top Shelf — Pull Relic from Gold Sink
  // STATUS: flavor — weekly downtime, no automation
  "top shelf": {
    class: "merchant", level: 10, flag: "merchant_topShelf", status: "flavor",
    description: "Once per week, pull a Relic from Gold Sink (value ≤ Level × 200g)."
  }
};

/* -------------------------------------------- */
/*  Merchant Runtime Hooks                      */
/* -------------------------------------------- */

export const MerchantFeatures = {

  registerHooks() {
    // Deep Pockets: Dynamic AE based on level
    Hooks.on(`${MODULE_ID}.preSyncEffects`, (actor, desiredEffects) => {
      this._applyDeepPocketsScaling(actor, desiredEffects);
    });

    log("Merchant","Hooks registered.");
  },

  /**
   * Calculate Deep Pockets bonus slots: ceil(merchantLevel / 2)
   */
  _applyDeepPocketsScaling(actor, desiredEffects) {
    const key = "merchant_deepPockets_Deep Pockets";
    const effectDef = desiredEffects.get(key);
    if (!effectDef) return;

    const level = actor.system.attributes?.level?.value ?? 1;
    const bonusSlots = Math.ceil(level / 2);

    effectDef.label = `Deep Pockets (+${bonusSlots} slots)`;
    effectDef.icon = "icons/containers/bags/pouch-leather-tan.webp";
    effectDef.changes = [
      { key: "system.inventory.bonusSlots", mode: 2, value: `${bonusSlots}` }
    ];

    log("Merchant",`Deep Pockets: Level ${level} → +${bonusSlots} inventory slots`);
  }
};
