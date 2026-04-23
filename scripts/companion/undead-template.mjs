/**
 * Undead Template — shared AE/stat overlay for Raise spell and Reanimator perk.
 *
 * Per Core Rulebook 05_Magic / 02_Spell List (Raise) and 03_Heroes/Perks (Reanimator):
 * - Becomes Undead (being type override)
 * - Gains Darksight (senses)
 * - Gains immunity to Poison
 * - Gains Weakness to Silvered
 * - Cannot be Sickened
 *
 * The overlay is applied at spawn time via CompanionSpawner's meta channel
 * and via a managed ActiveEffect installed on the companion actor after spawn.
 * The AE is tagged with `origin: "module.<MODULE_ID>.undead-template"` so we
 * can cleanly remove it on dismiss (the generic CompanionSpawner dismiss
 * deletes the actor anyway for imported compendium creatures, so cleanup is
 * implicit — but we tag the AE for diagnostics and potential cross-scene use).
 */

import { MODULE_ID, log } from "../utils.mjs";
import { gmRequest } from "../socket-relay.mjs";

export const UNDEAD_AE_ORIGIN = `module.${MODULE_ID}.undead-template`;

/**
 * AE data applied to a creature raised as Undead.
 * Uses status effect "poison-immune" and "silver-weakness" semantics from
 * the Vagabond system if present; otherwise falls back to plain changes.
 */
export function makeUndeadAEData(sourceName = "Raised") {
  return {
    name:  `Undead (${sourceName})`,
    img:   "icons/magic/death/skull-horned-goat-pale.webp",
    origin: UNDEAD_AE_ORIGIN,
    description: "Undead: Darksight, immune to Poison, Weak to Silvered, cannot be Sickened.",
    changes: [
      // Being type override — so code that checks beingType sees Undead
      { key: "system.beingType", mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: "Undead" },
      // Senses — ensure Darksight string present
      { key: "system.senses", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "Darksight" },
      // Status immunities — add "sickened" and "poisoned" (poison immunity)
      { key: "system.statusImmunities", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "sickened,poisoned" },
    ],
    statuses: [],
    flags: {
      [MODULE_ID]: { undeadTemplate: true, appliedAt: Date.now() },
    },
  };
}

/**
 * Apply the Undead AE to an actor.
 * GM-proxied via socket relay so player clients can raise undead without
 * needing direct embedded-doc permission on the target actor.
 *
 * @param {Actor} actor - the world actor to stamp with the Undead template
 * @param {object} [opts]
 * @param {string} [opts.sourceName] - label used in the AE name ("Raised" / "Reanimated")
 * @returns {Promise<void>}
 */
export async function applyUndeadTemplate(actor, { sourceName = "Raised" } = {}) {
  if (!actor) return;

  const existing = actor.effects?.find(e => e.origin === UNDEAD_AE_ORIGIN);
  if (existing) {
    log("UndeadTemplate", `${actor.name} already has the Undead template.`);
    return;
  }

  const aeData = makeUndeadAEData(sourceName);
  try {
    // GM-owned actor updates require proxy for player clients
    if (actor.isOwner) {
      await actor.createEmbeddedDocuments("ActiveEffect", [aeData]);
    } else {
      await gmRequest("createActorAE", { actorId: actor.id, aeData });
    }
    log("UndeadTemplate", `Applied Undead template to ${actor.name}`);
  } catch (e) {
    log("UndeadTemplate", `Could not apply Undead template to ${actor.name}: ${e.message}`);
  }
}
