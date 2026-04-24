/**
 * TalentData — TypeDataModel for the "talent" item type.
 *
 * Registered at init via:
 *   CONFIG.Item.dataModels[TALENT_TYPE] = TalentData
 *
 * Fields mirror the Psychic class design spec:
 *   docs/superpowers/specs/2026-04-24-psychic-class-design.md
 */

import { MODULE_ID } from "../utils.mjs";

/**
 * Namespaced item type key for Talent items.
 * Foundry v13 prefixes module-defined subtypes with the module ID.
 * Use this constant everywhere an item-type comparison or creation is needed.
 */
export const TALENT_TYPE = `${MODULE_ID}.talent`;

const { fields } = foundry.data;

export class TalentData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      /** HTML description of what this Talent does. */
      description: new fields.HTMLField({ required: false, blank: true, initial: "" }),

      /** Dice formula for damage, e.g. "1d6". Empty string for non-damage Talents. */
      damage: new fields.StringField({ required: false, blank: true, initial: "" }),

      /** Vagabond damage type string, e.g. "fire", "cold", "poison". */
      damageType: new fields.StringField({ required: false, blank: true, initial: "" }),

      /**
       * Status condition name applied on a full cast, e.g. "confused", "restrained".
       * Empty for non-effect Talents.
       */
      effect: new fields.StringField({ required: false, blank: true, initial: "" }),

      /**
       * Allowed delivery options for this Talent.
       * Filtered against affordability at cast-time against the virtual Mana cap.
       * Examples: ["touch", "remote"], ["touch", "remote", "cone", "sphere"]
       */
      delivery: new fields.ArrayField(new fields.StringField(), { initial: [] }),

      /**
       * How long the Talent's effect lasts:
       *   "instant"   — resolves immediately, no ongoing focus needed
       *   "focus"     — must maintain Focus each round (free for Psychic)
       *   "continual" — sustained without Focus (rare)
       */
      duration: new fields.StringField({
        required: true,
        choices: ["instant", "focus", "continual"],
        initial: "instant"
      }),

      /**
       * Active Effect definition object applied to the caster while they Focus
       * this Talent. Used by the 4 self-buff Talents (Absence, Evade, Shield,
       * Transvection). Null for all other Talents.
       * Shape: standard Foundry AE data (key, mode, value, label …)
       */
      focusBuffAE: new fields.ObjectField({ required: false, nullable: true, initial: null }),

      /**
       * Optional reference to a system spell name this Talent is modelled after.
       * Pure flavor — powers a subtitle on the chat card.
       * Example: Pyrokinesis → aliasOf "burn"
       */
      aliasOf: new fields.StringField({ required: false, blank: true, initial: "" })
    };
  }
}
