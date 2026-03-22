/**
 * Pugilist Class Features
 * Registry entries + runtime hooks for all Pugilist features.
 */

import { MODULE_ID } from "../vagabond-character-enhancer.mjs";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

export const PUGILIST_REGISTRY = {
  // L1: Fisticuffs
  // While only using Brawl Weapons, you can use a d4 if the damage was previously
  // lower and, once per Round, you can spend half your Speed to make a second attack
  // rather than skip your Move.
  // Additionally, if you have Favor on a Brawl Attack Check and hit a Target you
  // could viably Grapple or Shove, you can choose to Grapple or Shove them.
  "fisticuffs": {
    class: "pugilist",
    level: 1,
    flag: "pugilist_fisticuffs",
    description: "Brawl minimum d4 damage. Half Speed for second attack. Favored Brawl hit → can Grapple or Shove."
  },

  // L1: Rope-a-Dope
  // You gain the Check Hook Perk and can make two attacks with it, rather than one.
  // Grants Perk: Check Hook — Once per Round, make one Brawl attack if a Close Enemy Moves or Attacks (no Action).
  "rope-a-dope": {
    class: "pugilist",
    level: 1,
    flag: "pugilist_ropeADope",
    description: "Gain Check Hook Perk. Make two attacks with it instead of one."
  },

  // L2: Beat Rush
  // If you take the Rush Action, you can also make one attack with a Brawl Weapon
  // that Action.
  "beat rush": {
    class: "pugilist",
    level: 2,
    flag: "pugilist_beatRush",
    description: "Rush Action also includes one Brawl Weapon attack."
  },

  // L4: Prowess
  // If you pass a Save to Block, you ignore two of the highest rolled damage dice,
  // rather than one.
  "prowess": {
    class: "pugilist",
    level: 4,
    flag: "pugilist_prowess",
    description: "Successful Block ignores two highest damage dice instead of one."
  },

  // L6: Haymaker
  // If you pass a Brawl Attack Check by 10 or more, the Target is Dazed until your
  // next Turn.
  "haymaker": {
    class: "pugilist",
    level: 6,
    flag: "pugilist_haymaker",
    description: "Brawl Attack Check by 10+: Target is Dazed until your next Turn."
  },

  // L8: Impact
  // You use a d6 for the damage die of your Brawl Weapons.
  "impact": {
    class: "pugilist",
    level: 8,
    flag: "pugilist_impact",
    description: "Brawl Weapons use d6 damage die."
  },

  // L10: Haymaker Enhancement
  // When you become a 10th Level Pugilist, it triggers if you roll 8 or more.
  "haymaker (8+)": {
    class: "pugilist",
    level: 10,
    flag: "pugilist_haymaker8",
    description: "Haymaker now triggers on 8+ instead of 10+."
  }
};

/* -------------------------------------------- */
/*  Pugilist Runtime Hooks                      */
/* -------------------------------------------- */

export const PugilistFeatures = {
  registerHooks() {
    // TODO: Implement runtime hooks
    // - Fisticuffs: Post-hit Grapple/Shove buttons on Favored brawl hits
    // - Prowess: Hook Block saves to ignore extra damage die
    // - Haymaker: Hook Brawl attack results to apply Dazed (10+ or 8+ at L10)
    // - Impact: Managed AE on brawlDamageDieSizeBonus
  }
};
