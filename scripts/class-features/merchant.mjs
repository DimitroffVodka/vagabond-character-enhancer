/**
 * Merchant Class Features
 * Registry entries + runtime hooks for all Merchant features.
 */

import { MODULE_ID } from "../vagabond-character-enhancer.mjs";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

export const MERCHANT_REGISTRY = {
  // L1: Gold Sink
  // You gain the Deft Hands Perk, and can take the Use Action to place nonmagical
  // valuables into a container and close it. You can then open that container to
  // replace the valuables with an Item of equal or lesser value. This Item can't
  // be a Relic or similar magic item.
  // Grants Perk: Deft Hands — You can skip your Move to take the Use Action.
  "gold sink": {
    class: "merchant",
    level: 1,
    flag: "merchant_goldSink",
    description: "Gain Deft Hands Perk. Use Action to place valuables in container → open to get Item of equal/lesser value (no Relics)."
  },

  // L1: Deep Pockets
  // You have an extra number of Item Slots equal to (half your Merchant Level, round up).
  "deep pockets": {
    class: "merchant",
    level: 1,
    flag: "merchant_deepPockets",
    description: "Extra Item Slots equal to (ceil Merchant Level / 2)."
  },

  // L2: Bang for Your Buck
  // When you use an Item with limited uses, you can spend 1 Luck and roll a d10.
  // If the result is lower than your remaining Luck, the Item is not expended.
  "bang for your buck": {
    class: "merchant",
    level: 2,
    flag: "merchant_bangForYourBuck",
    description: "On limited-use Item, spend 1 Luck and roll d10. If lower than remaining Luck, Item not expended."
  },

  // L4: Diamond Hands
  // You can spend a Shift to remove one Power from a non-Fabled Relic or expend
  // valuables of equal or higher value to add a Power to an Item.
  "diamond hands": {
    class: "merchant",
    level: 4,
    flag: "merchant_diamondHands",
    description: "Spend a Shift to remove/add a Power from a non-Fabled Relic using valuables."
  },

  // L6: Treasure Seeker
  // You can sense gold, gems, and Relics within Near as if by Telepathy. This sense
  // is specific enough to tell you where they are, but not what they are.
  "treasure seeker": {
    class: "merchant",
    level: 6,
    flag: "merchant_treasureSeeker",
    description: "Sense gold, gems, and Relics within Near (location but not identity)."
  },

  // L8: Bang for Your Buck Enhancement
  // When you become an 8th Level Merchant, the d10 is a d8.
  "bang for your buck (d8)": {
    class: "merchant",
    level: 8,
    flag: "merchant_bangForYourBuckD8",
    description: "Bang for Your Buck upgrade: roll d8 instead of d10."
  },

  // L10: Top Shelf
  // Once per week, you can pull a Relic from your Gold Sink Feature with a value no
  // higher than (your Merchant Level x 200g), otherwise obeying all the rules for
  // using that Feature.
  "top shelf": {
    class: "merchant",
    level: 10,
    flag: "merchant_topShelf",
    description: "Once per week, pull a Relic from Gold Sink worth up to (Merchant Level x 200g)."
  }
};

/* -------------------------------------------- */
/*  Merchant Runtime Hooks                      */
/* -------------------------------------------- */

export const MerchantFeatures = {
  registerHooks() {
    // TODO: Implement runtime hooks
    // - Deep Pockets: Managed AE on bonus Item Slots (scales with level)
    // - Bang for Your Buck: Hook item use to offer Luck refund roll
    // - Diamond Hands: UI for Relic power management
    // - Treasure Seeker: Sense ability (possibly just flavor/GM tool)
  }
};
