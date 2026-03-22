/**
 * Witch Class Features
 * Registry entries + runtime hooks for all Witch features.
 */

import { MODULE_ID } from "../vagabond-character-enhancer.mjs";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

export const WITCH_REGISTRY = {
  "occultist": {
    class: "witch",
    flag: "witch_occultist",
    description: "Gain a Perk with Mysticism prerequisite. You can Cast Spells using Mysticism."
  },
  "hex": {
    class: "witch",
    flag: "witch_hex",
    description: "Spell effects can become continual for one Target until you end Focus. Costs 1 extra Mana."
  },
  "ritualism": {
    class: "witch",
    flag: "witch_ritualism",
    description: "Once per Shift, conduct a 10-minute Ritual as an Action. At L10, twice per Shift."
  },
  "things betwixt": {
    class: "witch",
    flag: "witch_thingsBetwixt",
    description: "Once per Scene, use Action or skip Move to become invisible until next Turn. Requires Focus."
  },
  "coventry": {
    class: "witch",
    flag: "witch_coventry",
    description: "You can Cast Spells that Near Allies can Cast."
  },
  "widdershins": {
    class: "witch",
    flag: "witch_widdershins",
    description: "Target of your Hex is Weak to your damage. Spells ignore Status Immunities of Hexed Targets."
  },
  "ritualism (2 uses)": {
    class: "witch",
    flag: "witch_ritualism2",
    description: "Ritualism can be used twice per Shift. Can finish Rituals requiring a Shift in 10 minutes."
  }
};

/* -------------------------------------------- */
/*  Witch Runtime Hooks                         */
/* -------------------------------------------- */

export const WitchFeatures = {
  registerHooks() {
    // TODO: Implement runtime hooks
    // - Hex: Hook casting to offer continual option, track hex target
    // - Things Betwixt: Action button for invisibility
    // - Coventry: Extend spell list with allies' known spells
    // - Widdershins: Hook damage to apply Weakness to Hex target
  }
};
