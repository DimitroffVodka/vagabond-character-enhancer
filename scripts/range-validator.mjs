/**
 * Range Validator
 * Enforces weapon range rules before attack rolls.
 *
 * RANGE RULES (Vagabond RPG):
 *   Close = 5ft (1 square)
 *   Near  = 30ft (6 squares)
 *   Far   = Unlimited (line of sight)
 *
 * WEAPON MODIFIERS:
 *   Long property:   +5ft to Close range (10ft total)
 *   Ranged property:  Close target → Hinder (unless Akimbo Trigger perk)
 *   Thrown property:   Near range (30ft), Far allowed with Hinder
 *   Near property:     Max Near range (30ft) — e.g., shotgun
 *
 * BEHAVIOR:
 *   - Out of range → block attack (ui.notifications.warn)
 *   - Ranged at Close → auto-Hinder (unless Akimbo Trigger)
 *   - Thrown at Far → auto-Hinder
 *   - No token on canvas → skip validation (theatre of mind)
 *   - No targets → skip validation
 */

import { MODULE_ID, log, combineFavor } from "./utils.mjs";

/* -------------------------------------------- */
/*  Constants                                    */
/* -------------------------------------------- */

const RANGE_CLOSE = 5;
const RANGE_NEAR = 30;
const RANGE_FAR = Infinity;

// Known compendium weapons that hit multiple targets in an area. The Vagabond
// system has no native AoE weapon property, so RangeValidator treats these as
// area attacks and bypasses single-target / range validation. Add new entries
// here for any future system AoE weapons. Custom items can opt in via the
// `areaAttack` module flag instead.
const KNOWN_AREA_ATTACK_NAMES = new Set([
  "breath attack",
]);

/* -------------------------------------------- */
/*  Helpers                                     */
/* -------------------------------------------- */

/**
 * Measure Chebyshev distance between two tokens in game units (ft).
 * Chebyshev: diagonal movement costs the same as cardinal (D&D-style).
 * Accounts for token size — measures closest-square-to-closest-square
 * distance between the two token footprints.
 * Rounds to nearest 5ft increment.
 */
export function measureDistance(attackerToken, targetToken) {
  const scene = canvas.scene;
  if (!scene) return 0;

  const gridSize = scene.grid?.size ?? 100;
  const gridDist = scene.grid?.distance ?? 5;

  // Use document positions (PlaceableObject.x can be 0 before render)
  const aDoc = attackerToken.document ?? attackerToken;
  const tDoc = targetToken.document ?? targetToken;

  // Convert to inclusive grid square ranges
  const aMinX = Math.round(aDoc.x / gridSize);
  const aMinY = Math.round(aDoc.y / gridSize);
  const aMaxX = aMinX + (aDoc.width ?? 1) - 1;
  const aMaxY = aMinY + (aDoc.height ?? 1) - 1;

  const tMinX = Math.round(tDoc.x / gridSize);
  const tMinY = Math.round(tDoc.y / gridSize);
  const tMaxX = tMinX + (tDoc.width ?? 1) - 1;
  const tMaxY = tMinY + (tDoc.height ?? 1) - 1;

  // Gap in grid squares on each axis (0 if overlapping on that axis)
  let gapX = 0;
  if (aMaxX < tMinX) gapX = tMinX - aMaxX;
  else if (tMaxX < aMinX) gapX = aMinX - tMaxX;

  let gapY = 0;
  if (aMaxY < tMinY) gapY = tMinY - aMaxY;
  else if (tMaxY < aMinY) gapY = aMinY - tMaxY;

  // Chebyshev distance: max of the two axis gaps
  const gridSquares = Math.max(gapX, gapY);
  const distance = Math.round(gridSquares * gridDist / 5) * 5;

  return distance;
}

/**
 * Get the maximum attack range for a weapon in ft.
 * Also returns flags for special range behaviors.
 */
function _getWeaponRange(item) {
  const range = item.system?.range?.toLowerCase() || "close";
  const properties = (item.system?.properties || []).map(p => p.toLowerCase());

  const hasLong = properties.includes("long");
  const hasRanged = properties.includes("ranged");
  const hasThrown = properties.includes("thrown");
  const hasNear = properties.includes("near");

  let maxRange;

  if (hasRanged) {
    // Ranged weapons default to Far, but Near property caps at 30ft
    maxRange = hasNear ? RANGE_NEAR : RANGE_FAR;
  } else if (hasThrown) {
    // Thrown weapons can reach Near (30ft), or Far with Hinder
    maxRange = RANGE_NEAR;
  } else {
    // Melee weapons: Close (5ft), +5ft with Long
    maxRange = RANGE_CLOSE + (hasLong ? 5 : 0);
  }

  return { maxRange, hasRanged, hasThrown, hasLong, hasNear };
}

/* -------------------------------------------- */
/*  Range Validator                             */
/* -------------------------------------------- */

export const RangeValidator = {

  /**
   * Validate weapon range before an attack roll.
   * Called first in the rollAttack pre-roll chain.
   *
   * @param {object} ctx - Attack context { item, actor, features, favorHinder }
   * @returns {boolean} true if the attack was blocked (caller should abort)
   */
  onPreRollAttack(ctx) {
    // Guard: setting disabled
    if (!game.settings.get(MODULE_ID, "enforceWeaponRange")) return false;

    // Guard: only validate weapon attacks (not spells, items, etc.)
    if (ctx.item.system?.equipmentType !== "weapon" && !ctx.item.system?.weaponSkill) return false;

    // Area-attack escape hatch — bypass target count + range validation for
    // items that hit multiple targets in an area. Two ways to qualify:
    //   1. Compendium-known AoE weapon by name (e.g., "Breath Attack")
    //   2. Opt-in module flag for custom items:
    //      item.setFlag("vagabond-character-enhancer", "areaAttack", true)
    const itemNameLower = (ctx.item.name || "").toLowerCase().trim();
    if (KNOWN_AREA_ATTACK_NAMES.has(itemNameLower) || ctx.item.getFlag?.(MODULE_ID, "areaAttack")) {
      log("Range", `${ctx.item.name}: area attack — bypassing target count + range checks`);
      return false;
    }

    // Guard: no targets selected
    const targets = game.user.targets;
    if (targets.size === 0) return false;

    // --- Target count enforcement ---
    const properties = (ctx.item.system?.properties || []).map(p => p.toLowerCase());
    let hasCleave = properties.includes("cleave");

    // Monk Martial Arts grants implicit Cleave on Finesse weapons (2 targets)
    if (!hasCleave && ctx.features?.monk_martialArts
        && ctx.item.system?.weaponSkill === "finesse" && targets.size === 2) {
      hasCleave = true;
      log("Range", `${ctx.item.name}: Monk Martial Arts grants implicit Cleave (2 targets)`);
    }

    if (targets.size > 1) {
      if (!hasCleave) {
        ui.notifications.warn(`${ctx.item.name} can only target 1 enemy. Deselect extra targets.`);
        log("Range", `BLOCKED: ${ctx.item.name} — ${targets.size} targets but no Cleave property`);
        return true;
      }
      const maxTargets = ctx.actor.system.cleaveMaxTargets ?? 2;
      if (targets.size > maxTargets) {
        ui.notifications.warn(`${ctx.item.name} can target at most ${maxTargets} enemies with Cleave. Deselect extra targets.`);
        log("Range", `BLOCKED: ${ctx.item.name} — ${targets.size} targets, max ${maxTargets}`);
        return true;
      }
    }

    // Guard: get attacker token on canvas (theatre of mind = skip)
    const attackerToken = ctx.actor.getActiveTokens()?.[0];
    if (!attackerToken) return false;

    const { maxRange, hasRanged, hasThrown } = _getWeaponRange(ctx.item);
    const weaponName = ctx.item.name;

    for (const targetToken of targets) {
      const distance = measureDistance(attackerToken, targetToken);
      const targetName = targetToken.name || targetToken.document?.name || "target";

      // --- Out of range check ---
      if (distance > maxRange) {
        // Thrown weapons can reach Far with Hinder
        if (hasThrown && maxRange === RANGE_NEAR) {
          // Allow but apply Hinder
          ctx.favorHinder = combineFavor(ctx.favorHinder, "hinder");
          log("Range", `${weaponName}: Thrown at Far range (${distance}ft) — Hindered for ${ctx.actor.name}`);
          ui.notifications.info(`${weaponName}: Thrown at Far range (${distance}ft) — attack is Hindered.`);
          continue;
        }

        // Block the attack
        ui.notifications.warn(`${targetName} is out of range! ${weaponName} max range: ${maxRange}ft, target is ${distance}ft away.`);
        log("Range", `BLOCKED: ${weaponName} (max ${maxRange}ft) → ${targetName} at ${distance}ft`);
        return true; // Attack blocked
      }

      // --- Ranged weapon at Close range → Hinder ---
      if (hasRanged && distance <= RANGE_CLOSE) {
        // Check for Akimbo Trigger perk
        if (ctx.features?.perk_akimboTrigger) {
          log("Range", `${weaponName}: Ranged at Close (${distance}ft) — Akimbo Trigger negates Hinder`);
          continue;
        }
        ctx.favorHinder = combineFavor(ctx.favorHinder, "hinder");
        log("Range", `${weaponName}: Ranged at Close range (${distance}ft) — Hindered for ${ctx.actor.name}`);
        ui.notifications.info(`${weaponName}: Ranged attack at Close range — Hindered.`);
      }
    }

    return false; // Attack allowed
  }
};
