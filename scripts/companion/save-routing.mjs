import { MODULE_ID } from "../utils.mjs";

export const FLAG_CONTROLLER_ACTOR = "controllerActorId";
export const FLAG_CONTROLLER_TYPE  = "controllerType";

export const CONTROLLER_TYPES = Object.freeze({
  COMPANION: "companion",
  HIRELING: "hireling"
});

const SKILL_BY_TYPE = Object.freeze({
  [CONTROLLER_TYPES.COMPANION]: "mana",
  [CONTROLLER_TYPES.HIRELING]:  "leadership"
});

/**
 * Read controller flags from an actor. Returns null if either flag is missing.
 * @param {Actor} actor
 * @returns {{ actorId: string, type: "companion" | "hireling" } | null}
 */
export function getController(actor) {
  if (!actor) return null;
  const actorId = actor.getFlag(MODULE_ID, FLAG_CONTROLLER_ACTOR);
  const type    = actor.getFlag(MODULE_ID, FLAG_CONTROLLER_TYPE);
  if (!actorId || !type) return null;
  if (type !== CONTROLLER_TYPES.COMPANION && type !== CONTROLLER_TYPES.HIRELING) return null;
  return { actorId, type };
}

/**
 * Resolve controller into a roller with skill metadata. Returns null if the
 * controller actor no longer exists or the NPC isn't flagged.
 * @param {Actor} npcActor
 * @returns {{ roller: Actor, type: string, skill: "mana" | "leadership", skillLabel: string } | null}
 */
export function resolveSaveRoller(npcActor) {
  const ctrl = getController(npcActor);
  if (!ctrl) return null;
  const roller = game.actors.get(ctrl.actorId);
  if (!roller) return null;

  const skill = SKILL_BY_TYPE[ctrl.type];
  let skillLabel = skill === "leadership" ? "Leadership" : "Mysticism";
  if (skill === "mana") {
    const key = roller.system?.attributes?.manaSkill;
    const cfgLabel = key ? CONFIG.VAGABOND?.skills?.[key] : null;
    if (cfgLabel) skillLabel = game.i18n.localize(cfgLabel) || skillLabel;
  }

  return { roller, type: ctrl.type, skill, skillLabel };
}

/**
 * Write both controller flags. The caller is responsible for GM-proxying if
 * the current user lacks OWNER on the target actor (see socket-relay.mjs).
 * @param {Actor} actor
 * @param {{ controllerId: string, type: "companion" | "hireling" }} opts
 */
export async function setController(actor, { controllerId, type }) {
  if (!actor) throw new Error("setController: actor is required");
  if (!controllerId) throw new Error("setController: controllerId is required");
  if (type !== CONTROLLER_TYPES.COMPANION && type !== CONTROLLER_TYPES.HIRELING) {
    throw new Error(`setController: invalid type "${type}"`);
  }
  await actor.setFlag(MODULE_ID, FLAG_CONTROLLER_ACTOR, controllerId);
  await actor.setFlag(MODULE_ID, FLAG_CONTROLLER_TYPE, type);
}

/**
 * Remove both controller flags.
 * @param {Actor} actor
 */
export async function clearController(actor) {
  if (!actor) return;
  await actor.unsetFlag(MODULE_ID, FLAG_CONTROLLER_ACTOR);
  await actor.unsetFlag(MODULE_ID, FLAG_CONTROLLER_TYPE);
}
