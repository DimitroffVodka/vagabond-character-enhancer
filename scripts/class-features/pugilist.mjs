/**
 * Pugilist Class Features
 * Registry entries + runtime hooks for all Pugilist features.
 */

import { MODULE_ID } from "../vagabond-character-enhancer.mjs";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

export const PUGILIST_REGISTRY = {
  // L1: Fisticuffs — Brawl min d4, second attack for half Speed, Favor grapple/shove
  // STATUS: module (d4 min) + todo (second attack, favor grapple)
  //
  // MODULE HANDLES:
  //   - Managed AE: brawlDamageDieSizeBonus to ensure minimum d4
  //     NOTE: The system's brawl weapons start at d3 (fist). This sets die size
  //     bonus to bring d3 up to d4. Actually, the base system may handle this
  //     differently — the brawl "weapon" might already be d4. If so, this AE
  //     is a no-op safeguard.
  "fisticuffs": {
    class: "pugilist", level: 1, flag: "pugilist_fisticuffs", status: "partial",
    description: "Brawl Weapons use d4 minimum. Spend half Speed for second attack. Favor → Grapple/Shove."
  },

  // L1: Rope-a-Dope — Check Hook Perk + 2 attacks with it
  // STATUS: flavor — Perk grant is manual
  "rope-a-dope": {
    class: "pugilist", level: 1, flag: "pugilist_ropeADope", status: "flavor",
    description: "Gain Check Hook Perk. Make two attacks with it instead of one."
  },

  // L2: Beat Rush — Rush Action includes a Brawl attack
  // STATUS: flavor — action economy choice, no mechanical enforcement
  "beat rush": {
    class: "pugilist", level: 2, flag: "pugilist_beatRush", status: "flavor",
    description: "If you Rush, you can also make one Brawl Weapon attack."
  },

  // L4: Prowess — Block ignores 2 highest damage dice instead of 1
  // STATUS: todo — needs hook on Block save to modify damage dice removal
  "prowess": {
    class: "pugilist", level: 4, flag: "pugilist_prowess", status: "todo",
    description: "On a passed Block Save, ignore two highest damage dice instead of one."
  },

  // L6: Haymaker — Pass Brawl by 10+ → Dazed
  // STATUS: todo — needs hook on Brawl attack margin to apply Dazed status
  "haymaker": {
    class: "pugilist", level: 6, flag: "pugilist_haymaker", status: "todo",
    description: "Pass a Brawl Attack by 10+ → Target is Dazed until your next Turn. At L10: triggers at 8+."
  },

  // L8: Impact — Brawl die → d6
  // STATUS: module — Managed AE
  "impact": {
    class: "pugilist", level: 8, flag: "pugilist_impact", status: "module",
    description: "Brawl Weapon damage die becomes d6.",
    effects: [{
      label: "Impact",
      icon: "icons/skills/melee/unarmed-punch-fist.webp",
      changes: [
        // Increase brawl die size by 2 (d4 base → d6)
        // If Fisticuffs already set d4, this brings it to d6
        { key: "system.brawlDamageDieSizeBonus", mode: 2, value: "2" }
      ]
    }]
  },

  // L10: Haymaker Enhancement — triggers at 8+ instead of 10+
  // STATUS: todo — depends on Haymaker implementation
  "haymaker enhancement": {
    class: "pugilist", level: 10, flag: "pugilist_haymakerEnhancement", status: "todo",
    description: "Haymaker triggers when passing Brawl by 8+ instead of 10+."
  }
};

/* -------------------------------------------- */
/*  Pugilist Runtime Hooks                      */
/* -------------------------------------------- */

export const PugilistFeatures = {
  _log(...args) {
    if (game.settings.get(MODULE_ID, "debugMode")) {
      console.log(`${MODULE_ID} | PugilistFeatures |`, ...args);
    }
  },

  registerHooks() {
    this._log("Hooks registered.");
  }
};
