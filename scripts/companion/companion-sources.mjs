/**
 * Companion Source Registry
 * Pure-data definitions for every companion source (summons, familiars,
 * hirelings, etc.). Downstream code (spawner, tab renderer, termination
 * manager) is source-agnostic and reads config from here.
 */

export const COMPANION_SOURCES = Object.freeze({
  summoner: {
    label: "Summon",
    badgeColor: "#7b5e00",
    skill: "mana",
    controllerType: "companion",
    terminateOn: ["zeroHP"],
  },
  familiar: {
    label: "Familiar",
    badgeColor: "#4a2080",
    skill: "mana",
    controllerType: "companion",
    terminateOn: ["zeroHP", "ritualRecast"],
  },
  "spell-beast": {
    label: "Beast",
    badgeColor: "#2d5e3a",
    skill: "mana",
    controllerType: "companion",
    terminateOn: ["zeroHP", "duration"],
  },
  "spell-animate": {
    label: "Animated",
    badgeColor: "#2d4a7e",
    skill: "mana",
    controllerType: "companion",
    terminateOn: ["zeroHP", "duration"],
  },
  "talent-control": {
    // Psychic Control Talent — same Animate-spell logic, but driven by the
    // Talent focus pool instead of system spell focus. Distinct sourceId so
    // HP-to-zero auto-dismiss, replace-on-recast, and the Companions-tab
    // badge route correctly without per-call branches.
    label: "Controlled",
    badgeColor: "#5a3a8e",
    skill: "mana",
    controllerType: "companion",
    terminateOn: ["zeroHP", "duration"],
  },
  "spell-raise": {
    label: "Raised",
    badgeColor: "#5e1a1a",
    skill: "mana",
    controllerType: "companion",
    terminateOn: ["zeroHP", "duration"],
  },
  "perk-conjurer": {
    label: "Conjured",
    badgeColor: "#8a7b00",
    skill: "mana",
    controllerType: "companion",
    terminateOn: ["zeroHP"],
  },
  "perk-reanimator": {
    label: "Reanimated",
    badgeColor: "#4e1a1a",
    skill: "mana",
    controllerType: "companion",
    terminateOn: ["zeroHP", "shift"],
  },
  "perk-animal-companion": {
    label: "Companion",
    badgeColor: "#2d6e3a",
    skill: "mana",
    controllerType: "companion",
    terminateOn: ["zeroHP"],
  },
  "hireling-manual": {
    label: "Hireling",
    badgeColor: "#1a5a1a",
    skill: "leadership",
    controllerType: "hireling",
    terminateOn: [],
  },
  // Fallback for v0.3.4 companions without a sourceId
  legacy: {
    label: "Companion",
    badgeColor: "#5a5a5a",
    skill: null,
    controllerType: null,
    terminateOn: [],
  },
});

/**
 * Look up a source meta entry by id. Falls back to `legacy` for unknown ids.
 * @param {string} sourceId
 * @returns {object} source meta entry
 */
export function getSourceMeta(sourceId) {
  return COMPANION_SOURCES[sourceId] ?? COMPANION_SOURCES.legacy;
}
