/**
 * Shared Utilities
 * Common functions used across all class feature modules.
 */

export const MODULE_ID = "vagabond-character-enhancer";

/**
 * Log a debug message if debug mode is enabled.
 * @param {string} prefix - Class or subsystem name (e.g. "Barbarian", "Detector")
 * @param {...any} args - Message parts
 */
export function log(prefix, ...args) {
  if (game.settings.get(MODULE_ID, "debugMode")) {
    console.log(`${MODULE_ID} | ${prefix} |`, ...args);
  }
}

/**
 * Check if an actor has a specific feature flag.
 * @param {Actor} actor
 * @param {string} flag - e.g. "barbarian_rage"
 * @returns {boolean}
 */
export function hasFeature(actor, flag) {
  const features = actor?.getFlag(MODULE_ID, "features");
  return features?.[flag] ?? false;
}

/**
 * Get all feature flags for an actor.
 * @param {Actor} actor
 * @returns {object|null}
 */
export function getFeatures(actor) {
  return actor?.getFlag?.(MODULE_ID, "features") ?? null;
}

/**
 * Combine a favor modifier with an existing favorHinder state.
 * favor + favor = favor, none + favor = favor, hinder + favor = none (cancel)
 * @param {string} currentFH - "favor", "hinder", or "none"
 * @param {"favor"|"hinder"} modifier - what to apply
 * @returns {string}
 */
export function combineFavor(currentFH, modifier = "favor") {
  if (modifier === "favor") {
    return currentFH === "hinder" ? "none" : "favor";
  }
  if (modifier === "hinder") {
    return currentFH === "favor" ? "none" : "hinder";
  }
  return currentFH;
}

/**
 * Check if any PC combatant (or scene PC) has an active Inspiration buff.
 * @returns {boolean}
 */
export function hasActiveInspiration() {
  if (game.combat) {
    for (const combatant of game.combat.combatants) {
      if (combatant.actor?.type === "character" &&
          combatant.actor.effects?.find(e => e.getFlag(MODULE_ID, "virtuosoBuff") === "inspiration")) {
        return true;
      }
    }
    return false;
  }
  const scenePCs = canvas.tokens?.placeables?.filter(t => t.actor?.type === "character") || [];
  return scenePCs.some(t => {
    const features = t.actor?.getFlag(MODULE_ID, "features");
    return features?.bard_virtuoso;
  });
}
