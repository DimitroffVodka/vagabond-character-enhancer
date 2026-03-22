/**
 * Pugilist Class Features
 * Registry entries + runtime hooks for all Pugilist features.
 */

import { MODULE_ID } from "../vagabond-character-enhancer.mjs";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

export const PUGILIST_REGISTRY = {
  "fisticuffs": {
    class: "pugilist",
    flag: "pugilist_fisticuffs",
    description: "While only using Brawl Weapons, use d4 minimum damage. Once per Round, spend half Move to Grapple or Shove after a Favored hit."
  },
  "rope-a-dope": {
    class: "pugilist",
    flag: "pugilist_ropeADope",
    description: "Gain the Check Hook Perk and can make two attacks with it, rather than one."
  },
  "beat rush": {
    class: "pugilist",
    flag: "pugilist_beatRush",
    description: "If you Rush, you can also make one attack with a Brawl Weapon that Action."
  },
  "prowess": {
    class: "pugilist",
    flag: "pugilist_prowess",
    description: "If you pass a Save to Block, you ignore two of the highest rolled damage dice, rather than one."
  },
  "haymaker": {
    class: "pugilist",
    flag: "pugilist_haymaker",
    description: "If you pass a Brawl Attack Check by 10+, the Target is Dazed until your next Turn. At L10, triggers on 8+."
  },
  "impact": {
    class: "pugilist",
    flag: "pugilist_impact",
    description: "You use a d6 for the damage die of your Brawl weapons."
  },
  "haymaker (8+)": {
    class: "pugilist",
    flag: "pugilist_haymaker8",
    description: "Haymaker now triggers if you roll 8 or more, rather than 10 or more."
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
    // - Haymaker: Hook Brawl attack results to apply Dazed
    // - Impact: Managed AE on brawlDamageDieSizeBonus
  }
};
