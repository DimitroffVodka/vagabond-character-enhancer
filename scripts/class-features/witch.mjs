/**
 * Witch Class Features
 * Registry entries + runtime hooks for all Witch features.
 */

import { MODULE_ID, log } from "../utils.mjs";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

export const WITCH_REGISTRY = {
  // L1: Occultist — Mysticism Perk + Cast using Mysticism
  // STATUS: system (casting) + flavor (perk grant)
  "occultist": {
    class: "witch", level: 1, flag: "witch_occultist", status: "system",
    description: "Gain a Mysticism Perk. Cast Spells using Mysticism. Learn 4 Spells. Max Mana = 4 × Level."
  },

  // L1: Hex — Make spell effects continual without Focus
  // STATUS: todo — needs custom tracking for hexed targets and continual effects
  // Complex: multiple simultaneous hexes (half level round up), no Focus required,
  // switching hex to new target removes from old target.
  "hex": {
    class: "witch", level: 1, flag: "witch_hex", status: "todo",
    description: "Spell effects become continual on one Target without Focus. Max simultaneous = ceil(level/2)."
  },

  // L2: Ritualism — 10-minute Ritual as Action, once per Shift
  // STATUS: flavor — narrative downtime action
  "ritualism": {
    class: "witch", level: 2, flag: "witch_ritualism", status: "flavor",
    description: "Once per Shift, conduct a 10-minute Ritual as an Action."
  },

  // L4: Things Betwixt — Action/skip Move to become invisible until next Turn
  // STATUS: todo — needs toggle to apply invisible status with Focus requirement
  "things betwixt": {
    class: "witch", level: 4, flag: "witch_thingsBetwixt", status: "todo",
    description: "Once per Scene, become invisible until next Turn (requires Focus)."
  },

  // L6: Coventry — Cast Spells that Near Allies can Cast
  // STATUS: flavor — spell access expansion, no automation
  "coventry": {
    class: "witch", level: 6, flag: "witch_coventry", status: "flavor",
    description: "Cast Spells that Near Allies can Cast."
  },

  // L8: Widdershins — Hex target Weak to your damage + ignore status immunities
  // STATUS: todo — needs hook on damage to apply weakness + status immunity bypass
  "widdershins": {
    class: "witch", level: 8, flag: "witch_widdershins", status: "todo",
    description: "Hex Target is Weak to damage you deal (doesn't ignore Immunity). Your Spells ignore their Status Immunities."
  },

  // L10: Ritualism (2 uses) — Two Rituals per Shift
  // STATUS: flavor — extends L2 feature
  "ritualism (2 uses)": {
    class: "witch", level: 10, flag: "witch_ritualism2", status: "flavor",
    description: "Conduct Rituals twice per Shift instead of once."
  }
};

/* -------------------------------------------- */
/*  Witch Runtime Hooks                         */
/* -------------------------------------------- */

export const WitchFeatures = {

  registerHooks() {
    // Witch features center on the Hex mechanic:
    //   - Track hexed targets per actor
    //   - Apply continual spell effects without Focus
    //   - Widdershins: damage weakness + status immunity bypass on hex target
    // These need significant custom state management.

    log("Witch","Hooks registered.");
  }
};
