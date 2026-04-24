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
 *
 * Matches Vagabond bestiary field shapes verified against Zombie, Boomer:
 *   - system.statusImmunities — ARRAY of strings; each value must be its
 *     own ADD change (passing "sickened,poisoned" adds the literal comma
 *     string as a single item, not two items)
 *   - system.immunities       — ARRAY of damage-type strings
 *   - system.weaknesses       — ARRAY of damage-type strings
 *   - system.senses           — STRING (OVERRIDE to avoid ugly concatenation
 *     like "Keen HearingDarksight")
 *
 * Per rulebook Raise: gains Darksight, Poison immunity, Silvered weakness,
 * cannot be Sickened.
 */
export function makeUndeadAEData(sourceName = "Raised") {
  const ADD = CONST.ACTIVE_EFFECT_MODES.ADD;
  const OVERRIDE = CONST.ACTIVE_EFFECT_MODES.OVERRIDE;
  return {
    name:  `Undead (${sourceName})`,
    img:   "icons/svg/skull.svg",
    origin: UNDEAD_AE_ORIGIN,
    description: "Undead: Darksight, Poison immunity, Silvered weakness, cannot be Sickened.",
    changes: [
      { key: "system.beingType",       mode: OVERRIDE, value: "Undead" },
      { key: "system.senses",          mode: OVERRIDE, value: "Darksight" },
      { key: "system.statusImmunities", mode: ADD,      value: "sickened" },
      { key: "system.immunities",       mode: ADD,      value: "poison" },
      { key: "system.weaknesses",       mode: ADD,      value: "silver" },
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

    // Update scene tokens for this actor to Darkvision — the AE adds
    // system.senses="Darksight" but the token's own sight config isn't
    // auto-derived from senses, so we update the TokenDocument too.
    for (const scene of game.scenes) {
      const tokens = scene.tokens.filter(t => t.actorId === actor.id);
      for (const tok of tokens) {
        try {
          await tok.update({
            sight: { enabled: true, range: null, visionMode: "darkvision" },
          });
        } catch (e) {
          // Player client without scene permission — fall back to GM proxy
          try {
            await gmRequest("updateToken", {
              sceneId: scene.id,
              tokenId: tok.id,
              update: { sight: { enabled: true, range: null, visionMode: "darkvision" } },
            });
          } catch (e2) {
            log("UndeadTemplate", `Could not update token sight for ${tok.name}: ${e2.message}`);
          }
        }
      }
    }
  } catch (e) {
    log("UndeadTemplate", `Could not apply Undead template to ${actor.name}: ${e.message}`);
  }
}
