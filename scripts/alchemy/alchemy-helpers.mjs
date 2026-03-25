/**
 * Alchemy Helpers
 *
 * Shared constants, actor detection, material math, and weapon conversion
 * used by both the Cookbook window and the crawl-strip craft menu.
 */

import { MODULE_ID } from "../vagabond-character-enhancer.mjs";

// ── Damage Helper — route through system's armor/immune/weak calculation ─────

/**
 * Apply damage to an actor, respecting armor, immunities, and weaknesses.
 * Uses the system's VagabondDamageHelper.calculateFinalDamage() when available.
 * @param {Actor} targetActor  — the actor receiving damage
 * @param {number} rawDamage   — pre-mitigation damage amount
 * @param {string} damageType  — "fire", "acid", "cold", etc.
 * @param {Item|null} weapon   — attacking weapon (for metal checks), or null
 * @returns {number} actual damage dealt after mitigation
 */
export async function applyCalculatedDamage(targetActor, rawDamage, damageType, weapon = null) {
  let finalDamage = rawDamage;
  try {
    const { VagabondDamageHelper } = await import(
      "../../../systems/vagabond/module/helpers/damage-helper.mjs"
    );
    finalDamage = VagabondDamageHelper.calculateFinalDamage(
      targetActor, rawDamage, damageType, weapon
    );
  } catch (err) {
    console.warn(`${MODULE_ID} | Could not use system damage calc, applying raw:`, err);
  }
  if (finalDamage <= 0) return 0;
  const currentHP = targetActor.system?.health?.value ?? 0;
  const newHP = Math.max(0, currentHP - finalDamage);
  await targetActor.update({ "system.health.value": newHP });
  return finalDamage;
}

// ── Level Progression ────────────────────────────────────────────────────────

export const ALCHEMIST_LEVELS = {
  1:  { formulaeKnown: 4, maxValueSilver: 50 },
  2:  { formulaeKnown: 4, maxValueSilver: 100 },
  3:  { formulaeKnown: 5, maxValueSilver: 150 },
  4:  { formulaeKnown: 5, maxValueSilver: 200 },
  5:  { formulaeKnown: 6, maxValueSilver: 250 },
  6:  { formulaeKnown: 6, maxValueSilver: 300 },
  7:  { formulaeKnown: 7, maxValueSilver: 350 },
  8:  { formulaeKnown: 7, maxValueSilver: 400 },
  9:  { formulaeKnown: 8, maxValueSilver: 450 },
  10: { formulaeKnown: 8, maxValueSilver: 500 },
};

// Offensive alchemical types that become weapons when crafted
const WEAPON_TYPES = new Set(["acid", "explosive", "poison"]);

// Items that are weapons even though their alchemicalType is NOT in WEAPON_TYPES
// (e.g. Holy Water is a "concoction" but is thrown at targets)
const WEAPON_OVERRIDES = new Set(["Holy Water"]);

// Secondary effects triggered on a successful hit with a crafted alchemical weapon.
// Each entry maps a compendium item name → effect metadata.
const ALCHEMICAL_EFFECTS = {
  "Alchemist\u2019s Fire": {
    effectName: "Burning",
    countdownDie: "d6",
    damageType: "fire",
  },
  "Acid, Basic": {
    effectName: "Burning",
    countdownDie: "d4",
    damageType: "acid",
  },
  "Acid, Defoliator": {
    effectName: "Burning",
    countdownDie: "d6",
    damageType: "acid",
    onlyTargetNames: [
      "Viper Tree", "Assassin Vine", "Hydrangean", "Shambling Mound",
      "Treant", "Triffid", "Violet Fungus", "Yellow Mould",
    ],
  },
  "Acid, Oxidizing": {
    effectName: "Burning",
    countdownDie: "d6",
    damageType: "acid",
    confirmCountdown: "Target is made of metal?",
    gmReminder: "If the target is non-Relic Armor or Weapon: Armor rating is reduced by 1 (breaks at 0). Weapon damage die is reduced by one size until repaired (destroyed if already d4).",
  },
  "Frigid Azote": {
    effectName: "Frozen",
    // No countdownDie — damage is one-shot via the weapon attack itself.
    // On hit: halve target's speed for 1 round via Active Effect.
    onHitEffects: [{
      label: "Frozen (Frigid Azote)",
      icon: "icons/svg/frozen.svg",
      durationRounds: 1,
      speedHalved: true,   // special flag: dynamically calculates speed penalty
    }],
  },
  "Tanglefoot Bag": {
    effectName: "Restrained",
    countdownDie: "d4",
    // No damageType — this countdown doesn't deal damage, it tracks duration.
    // Restrained AE is linked to the countdown die: removed when the die ends.
    linkedStatus: {
      label: "Restrained (Tanglefoot Bag)",
      statusId: "restrained",
      icon: "icons/svg/net.svg",
      changes: [
        { key: "system.speed.bonus", mode: 2, value: "-999" },
        { key: "system.favorHinder", mode: 5, value: "hinder" },
        { key: "system.incomingAttacksModifier", mode: 5, value: "favor" },
        { key: "system.outgoingSavesModifier", mode: 5, value: "favor" },
      ],
    },
  },
  "Levin Shell": {
    effectName: "Dazed",
    damageType: "shock",
    // AoE splash: other Close beings take half damage (rounded down)
    splash: {
      rangeFt: 5,               // Close = within 5ft
      damageMultiplier: 0.5,    // half damage, Math.floor applied
    },
    // Dazed applied to ALL damaged targets (primary + splash)
    onHitEffects: [{
      label: "Dazed (Levin Shell)",
      statusId: "dazed",        // use system's built-in Dazed status
      icon: "icons/svg/sleep.svg",
      durationRounds: 1,
      changes: [
        { key: "system.speed.bonus", mode: 2, value: "-999" },
      ],
    }],
  },
  "Dwarfblind Stone": {
    effectName: "Blinded",
    countdownDie: "d6",
    // No damageType — doesn't deal ongoing damage, just tracks Blinded duration.
    // Only affects targets with Darksight.
    onlyTargetSenses: ["darksight"],   // check target's senses field
    linkedStatus: {
      label: "Blinded (Dwarfblind Stone)",
      statusId: "blinded",
      icon: "icons/svg/blind.svg",
      changes: [],  // system's built-in Blinded already has changes
    },
  },
  "Oil, Basic": {
    effectName: "Oil Coating",
    isCoating: true,
    coatingDie: "d6",        // Countdown die size
    coatingDamage: "1d6",    // Bonus fire damage per hit
    coatingLight: { dim: 5, bright: 0 },
    burnsTarget: false,      // Does NOT apply Burning to hit targets
  },
  "Oil, Anointing": {
    effectName: "Anointing Oil",
    isCoating: true,
    coatingDie: "d6",
    coatingDamage: "1d6",
    coatingLight: { dim: 5, bright: 0 },
    burnsTarget: false,
    silvered: true,
  },
  "Oil, Bladefire": {
    effectName: "Bladefire Oil",
    isCoating: true,
    coatingDie: "d6",        // Oil itself burns on Cd6
    coatingDamage: "1d6",    // Bonus fire damage per hit
    coatingLight: { dim: 30, bright: 15 },  // Sheds Light out to Near
    burnsTarget: true,       // Targets hit are Burning (Cd4)
    burnsTargetDie: "d4",    // Burning countdown on the target
  },

  // ── Holy Water ────────────────────────────────────────────────────────────
  // Thrown at Undead/Hellspawn: 1d6 magic damage + Burning Cd4
  // "Hellspawn" is a lore tag (in NPC descriptions), not a system beingType,
  // so we match by creature name for hellspawn + beingType for Undead.
  "Holy Water": {
    effectName: "Burning",
    countdownDie: "d4",
    damageType: "magic",
    onlyTargetBeingTypes: ["Undead"],
    onlyTargetNames: ["Chort", "Dethbat", "Hellhound", "Imp", "Nightmare", "Oni", "Pit Fiend", "Stolas Demon", "Viper Tree", "Viskyd", "Zotz Demon"],
  },

  // ── Poisons ───────────────────────────────────────────────────────────────
  // All poisons apply the Sickened status (system built-in) linked to
  // a countdown die. When the die ends, Sickened is removed.
  // The countdown die also deals damage each tick for Basic poison.
  "Poison, Basic": {
    effectName: "Sickened",
    countdownDie: "d4",
    damageType: "poison",
    linkedStatus: {
      label: "Sickened (Poison, Basic)",
      statusId: "sickened",
      icon: "icons/svg/poison.svg",
      changes: [
        { key: "system.incomingHealingModifier", mode: 2, value: "-2" },
      ],
    },
  },
  "Poison, Deadly Nightshade": {
    effectName: "Sickened",
    countdownDie: "d4",
    // No damageType — the countdown tracks Sickened duration, not damage.
    // "Cures lycanthropy" is a narrative effect handled by GM.
    linkedStatus: {
      label: "Sickened (Deadly Nightshade)",
      statusId: "sickened",
      icon: "icons/svg/poison.svg",
      changes: [
        { key: "system.incomingHealingModifier", mode: 2, value: "-2" },
      ],
    },
    gmReminder: "If the target is a Lycanthrope, the poison cures their lycanthropy.",
  },
  "Poison, Truth Serum": {
    effectName: "Sickened",
    countdownDie: "d8",
    // No damageType — duration only. Target cannot lie while Sickened.
    linkedStatus: {
      label: "Sickened (Truth Serum)",
      statusId: "sickened",
      icon: "icons/svg/poison.svg",
      changes: [
        { key: "system.incomingHealingModifier", mode: 2, value: "-2" },
      ],
    },
    gmReminder: "While Sickened by Truth Serum, the target cannot lie.",
  },

  // ── Thunderstone ──────────────────────────────────────────────────────────
  // 1d6 blunt damage to target. All targets Near (30ft) cannot hear.
  "Thunderstone": {
    damageType: "blunt",
    gmReminder: "All creatures Near the blast (30 ft) cannot hear until the end of their next turn.",
  },
};

/* ──────────────────────────────────────────────────────────────────────────────
 * SELF-USE CONSUMABLE EFFECTS TABLE
 *
 * Items consumed by the user (not thrown at targets): potions, antitoxin, etc.
 * Each entry describes what happens when the item is consumed.
 * ──────────────────────────────────────────────────────────────────────────── */

const CONSUMABLE_EFFECTS = {
  // ── Antitoxin ─────────────────────────────────────────────────────────────
  "Antitoxin": {
    type: "removeStatus",
    statusId: "sickened",
    chatMessage: "{actor} drinks Antitoxin — Sickened status removed!",
  },

  // ── Healing Potions ───────────────────────────────────────────────────────
  "Potion, Healing I": {
    type: "heal",
    formula: "1d6 + 1",
    resource: "health",
    chatMessage: "{actor} drinks a Healing Potion I and regains {amount} HP! ({from} → {to})",
  },
  "Potion, Healing II": {
    type: "heal",
    formula: "2d6 + 2",
    resource: "health",
    chatMessage: "{actor} drinks a Healing Potion II and regains {amount} HP! ({from} → {to})",
  },
  "Potion, Healing III": {
    type: "heal",
    formula: "3d6 + 3",
    resource: "health",
    chatMessage: "{actor} drinks a Healing Potion III and regains {amount} HP! ({from} → {to})",
  },

  // ── Mana Potions ──────────────────────────────────────────────────────────
  "Potion, Mana I": {
    type: "heal",
    formula: "1d6 + 1",
    resource: "mana",
    chatMessage: "{actor} drinks a Mana Potion I and restores {amount} mana! ({from} → {to})",
  },
  "Potion, Mana II": {
    type: "heal",
    formula: "2d6 + 2",
    resource: "mana",
    chatMessage: "{actor} drinks a Mana Potion II and restores {amount} mana! ({from} → {to})",
  },
  "Potion, Mana III": {
    type: "heal",
    formula: "3d6 + 3",
    resource: "mana",
    chatMessage: "{actor} drinks a Mana Potion III and restores {amount} mana! ({from} → {to})",
  },

  // ── Speed Potions ─────────────────────────────────────────────────────────
  "Potion, Speed I": {
    type: "applyEffect",
    label: "Speed Potion I",
    icon: "icons/svg/wing.svg",
    durationSeconds: 3600,  // 1 hour
    changes: [
      { key: "system.speed.bonus", mode: 5, value: "5" },
    ],
    chatMessage: "{actor} drinks a Speed Potion I — +5 Speed for 1 hour!",
  },
  "Potion, Speed II": {
    type: "applyEffect",
    label: "Speed Potion II",
    icon: "icons/svg/wing.svg",
    durationSeconds: 3600,
    changes: [
      { key: "system.speed.bonus", mode: 5, value: "10" },
    ],
    chatMessage: "{actor} drinks a Speed Potion II — +10 Speed for 1 hour!",
  },
  "Potion, Speed III": {
    type: "applyEffect",
    label: "Speed Potion III",
    icon: "icons/svg/wing.svg",
    durationSeconds: 3600,
    changes: [
      { key: "system.speed.bonus", mode: 5, value: "15" },
    ],
    chatMessage: "{actor} drinks a Speed Potion III — +15 Speed for 1 hour!",
  },
};

/**
 * Look up a self-use consumable effect by item name.
 * @param {string} itemName
 * @returns {object|null}
 */
export function getConsumableEffect(itemName) {
  if (CONSUMABLE_EFFECTS[itemName]) return CONSUMABLE_EFFECTS[itemName];
  const key = _norm(itemName);
  for (const [k, v] of Object.entries(CONSUMABLE_EFFECTS)) {
    if (_norm(k) === key) return v;
  }
  return null;
}

/**
 * Use a self-use consumable: apply its effect to the consuming actor,
 * then delete or decrement the item.
 *
 * @param {Actor} actor  - The actor consuming the item
 * @param {Item}  item   - The inventory item being consumed
 * @returns {boolean} true if the effect was applied successfully
 */
export async function useConsumable(actor, item) {
  const effect = getConsumableEffect(item.name);
  if (!effect) {
    ui.notifications.warn(`No consumable effect defined for "${item.name}".`);
    return false;
  }

  let chatText = effect.chatMessage.replace("{actor}", actor.name);

  try {
    if (effect.type === "removeStatus") {
      // Remove all AEs with the target status
      const toRemove = actor.effects.filter(ae =>
        ae.statuses?.has(effect.statusId)
      );
      if (!toRemove.length) {
        ui.notifications.info(`${actor.name} is not ${effect.statusId}.`);
        return false;
      }
      await actor.deleteEmbeddedDocuments("ActiveEffect", toRemove.map(e => e.id));

    } else if (effect.type === "heal") {
      // Potency/Big Bang: modify formula for Alchemists
      let formula = effect.formula;
      const alcData = getAlchemistData(actor);
      if (alcData?.level >= 8) {
        formula = `1d6 + ${formula}`; // Big Bang: +d6 bonus
      }

      const roll = new Roll(formula);
      await roll.evaluate();

      // Potency (level 4+): apply exploding dice to healing rolls
      if (alcData?.level >= 4) {
        try {
          const { VagabondDamageHelper } = globalThis.vagabond.utils ?? {};
          if (VagabondDamageHelper?._manuallyExplodeDice) {
            const dieMatch = effect.formula.match(/d(\d+)/);
            const maxFace = dieMatch ? parseInt(dieMatch[1]) : 6;
            const explodeValues = alcData.level >= 8 ? [maxFace, maxFace - 1] : [maxFace];
            await VagabondDamageHelper._manuallyExplodeDice(roll, explodeValues);
          }
        } catch (e) {
          console.warn(`${MODULE_ID} | Exploding dice on heal failed:`, e);
        }
      }

      const amount = roll.total;

      if (effect.resource === "health") {
        const current = actor.system?.health?.value ?? 0;
        const max = actor.system?.health?.max ?? current;
        const newVal = Math.min(max, current + amount);
        await actor.update({ "system.health.value": newVal });
        chatText = chatText
          .replace("{amount}", String(amount))
          .replace("{from}", String(current))
          .replace("{to}", String(newVal));
      } else if (effect.resource === "mana") {
        const current = actor.system?.mana?.current ?? 0;
        const max = actor.system?.mana?.max ?? current;
        const newVal = Math.min(max, current + amount);
        await actor.update({ "system.mana.current": newVal });
        chatText = chatText
          .replace("{amount}", String(amount))
          .replace("{from}", String(current))
          .replace("{to}", String(newVal));
      }

    } else if (effect.type === "applyEffect") {
      const aeData = {
        name: effect.label,
        icon: effect.icon || "icons/svg/aura.svg",
        origin: `module.${MODULE_ID}`,
        disabled: false,
        changes: effect.changes ?? [],
      };
      if (effect.durationSeconds) {
        aeData.duration = { seconds: effect.durationSeconds };
      }
      await actor.createEmbeddedDocuments("ActiveEffect", [aeData]);
    }

    // Consume the item (delete if qty ≤ 1, else decrement)
    const qty = item.system?.quantity ?? 1;
    if (qty <= 1) {
      await item.delete();
    } else {
      await item.update({ "system.quantity": qty - 1 });
    }

    // Post chat message
    await ChatMessage.create({
      content: `<p><strong>${chatText}</strong></p>`,
      speaker: ChatMessage.getSpeaker({ actor }),
    });

    console.log(`${MODULE_ID} | Used consumable: ${item.name} on ${actor.name}`);
    return true;

  } catch (err) {
    console.error(`${MODULE_ID} | Failed to use consumable "${item.name}":`, err);
    ui.notifications.error("Consumable use failed — check console.");
    return false;
  }
}

/**
 * Apply on-hit Active Effects from an alchemical effect to a target actor.
 * Handles special flags like `speedHalved` which require dynamic calculation.
 * @param {object} effect  - The ALCHEMICAL_EFFECTS entry
 * @param {Actor}  targetActor - The target actor (token actor for unlinked)
 */
export async function applyOnHitEffects(effect, targetActor) {
  if (!effect?.onHitEffects?.length || !targetActor) return;

  for (const fx of effect.onHitEffects) {
    const changes = [];

    if (fx.speedHalved) {
      const isPC = targetActor.type === "character";
      if (isPC) {
        // PCs: speed.bonus is an array, add negative half of base speed
        const baseSpeed = targetActor.system?.speed?.base ?? 0;
        const penalty = -Math.floor(baseSpeed / 2);
        changes.push({ key: "system.speed.bonus", mode: 2, value: String(penalty) });
      } else {
        // NPCs: speed is a flat number, multiply by 0.5
        changes.push({ key: "system.speed", mode: 1, value: "0.5" });
      }
    }

    // Append explicit changes from the effect definition (e.g. Dazed speed = 0)
    if (fx.changes?.length) {
      changes.push(...fx.changes);
    }

    // Build the AE document data
    const aeData = {
      name: fx.label,
      icon: fx.icon || "icons/svg/aura.svg",
      origin: `module.${MODULE_ID}`,
      disabled: false,
      changes,
    };

    // Add status ID if specified (uses system's built-in status marker)
    if (fx.statusId) {
      aeData.statuses = [fx.statusId];
    }

    // Set duration if specified — include combat context so Foundry can auto-expire
    if (fx.durationRounds) {
      const combat = game.combat;
      aeData.duration = {
        rounds: fx.durationRounds,
        startRound: combat?.round ?? 0,
        startTurn:  combat?.turn ?? 0,
      };
    }

    try {
      await targetActor.createEmbeddedDocuments("ActiveEffect", [aeData]);
      console.log(`${MODULE_ID} | Applied "${fx.label}" to ${targetActor.name}`);
    } catch (err) {
      console.warn(`${MODULE_ID} | Failed to apply "${fx.label}" to ${targetActor.name}:`, err);
    }
  }
}

/**
 * Edge-to-edge Chebyshev distance between two tokens in feet.
 * Reuses the same logic as flanking-checker.mjs.
 */
function _tokenDistanceFt(tokenA, tokenB) {
  const scene = canvas.scene;
  if (!scene) return Infinity;
  const gridSize = scene.grid?.size ?? 100;
  const gridDist = scene.grid?.distance ?? 5;
  const ax = tokenA.document.x / gridSize, ay = tokenA.document.y / gridSize;
  const aw = tokenA.document.width,        ah = tokenA.document.height;
  const bx = tokenB.document.x / gridSize, by = tokenB.document.y / gridSize;
  const bw = tokenB.document.width,        bh = tokenB.document.height;
  const gapX = Math.max(0, Math.max(ax, bx) - Math.min(ax + aw, bx + bw));
  const gapY = Math.max(0, Math.max(ay, by) - Math.min(ay + ah, by + bh));
  return Math.max(gapX, gapY) * gridDist;
}

/**
 * Handle AoE splash damage after a successful weapon hit.
 * Finds all tokens within `splash.rangeFt` of the primary target,
 * applies `Math.floor(damage * splash.damageMultiplier)` to each,
 * and applies on-hit effects (e.g. Dazed) to all damaged targets.
 *
 * @param {object}  effect       - The ALCHEMICAL_EFFECTS entry (must have .splash)
 * @param {object}  primaryTarget - {tokenId, actorId, sceneId, actorName}
 * @param {number}  primaryDamage - The damage rolled against the primary target
 * @param {Actor}   attackerActor - The actor performing the attack
 */
export async function applySplashDamage(effect, primaryTarget, primaryDamage, attackerActor) {
  if (!effect?.splash || !primaryTarget?.tokenId) return;

  const { rangeFt, damageMultiplier } = effect.splash;
  const splashDamage = Math.floor(primaryDamage * damageMultiplier);

  // Get the primary target's token on canvas
  const primaryTokenObj = canvas.tokens?.get(primaryTarget.tokenId);
  if (!primaryTokenObj) {
    console.warn(`${MODULE_ID} | Splash: primary target token not found on canvas`);
    return;
  }

  // Find all other tokens within Close range of primary target
  const allTokens = canvas.tokens?.placeables ?? [];
  const splashTargets = [];
  for (const tok of allTokens) {
    if (tok.id === primaryTarget.tokenId) continue;               // skip primary
    if (tok.actor?.id === attackerActor?.id) continue;             // skip attacker
    if (!tok.actor) continue;                                       // skip tokenless
    const dist = _tokenDistanceFt(primaryTokenObj, tok);
    if (dist <= rangeFt) {
      splashTargets.push(tok);
    }
  }

  // Collect all damaged actors for on-hit effects (primary + splash)
  const damagedActors = [];

  // Resolve primary target actor (handle unlinked tokens)
  let primaryActor = primaryTokenObj.actor;
  if (primaryActor) damagedActors.push(primaryActor);

  // Apply splash damage to nearby tokens
  const splashResults = [];
  if (splashDamage > 0) {
    for (const tok of splashTargets) {
      const splashActor = tok.actor;
      if (!splashActor) continue;
      const currentHP = splashActor.system?.health?.value ?? 0;
      try {
        const finalSplash = await applyCalculatedDamage(splashActor, splashDamage, effect.damageType);
        const newHP = splashActor.system?.health?.value ?? 0;
        splashResults.push({ name: splashActor.name, damage: finalSplash, from: currentHP, to: newHP });
        if (finalSplash > 0) damagedActors.push(splashActor);
      } catch (err) {
        console.warn(`${MODULE_ID} | Splash damage failed for ${splashActor.name}:`, err);
      }
    }
  }

  // Apply on-hit effects (e.g. Dazed) to ALL damaged actors
  if (effect.onHitEffects?.length) {
    for (const actor of damagedActors) {
      await applyOnHitEffects(effect, actor);
    }
  }

  // Post splash summary to chat
  if (splashResults.length > 0) {
    const lines = splashResults.map(r =>
      `<li><strong>${r.name}</strong> takes <strong>${r.damage} ${effect.damageType ?? ""}</strong> splash damage (${r.from} → ${r.to} HP)</li>`
    ).join("");
    await ChatMessage.create({
      content: `<p><strong>${effect.effectName ?? "Splash"}</strong> — nearby targets caught in the blast:</p><ul>${lines}</ul>`,
      speaker: { alias: "Vagabond Crawler" },
    });
  }

  console.log(`${MODULE_ID} | Splash: ${splashResults.length} nearby targets hit for ${splashDamage} each`);
}

/** Normalize smart quotes to straight for reliable matching. */
function _norm(s) { return s?.replace?.(/[\u2018\u2019]/g, "'") ?? ""; }

/** Look up secondary effect data for a given alchemical item name. */
export function getAlchemicalEffect(itemName) {
  // Try exact match first, then normalized
  if (ALCHEMICAL_EFFECTS[itemName]) return ALCHEMICAL_EFFECTS[itemName];
  const key = _norm(itemName);
  for (const [k, v] of Object.entries(ALCHEMICAL_EFFECTS)) {
    if (_norm(k) === key) return v;
  }
  return null;
}

// ── Compendium Cache ─────────────────────────────────────────────────────────

let _compendiumCache = null;

/**
 * Load all items from the system's alchemical-items compendium.
 * Results are cached for the session.
 */
export async function fetchCompendiumItems() {
  if (_compendiumCache) return _compendiumCache;
  const pack = game.packs.get("vagabond.alchemical-items");
  if (!pack) {
    console.warn(`${MODULE_ID} | Compendium 'vagabond.alchemical-items' not found.`);
    return [];
  }
  const docs = await pack.getDocuments();
  _compendiumCache = docs.map(d => d.toObject());
  return _compendiumCache;
}

/** Clear cache (e.g. if compendium is updated). */
export function clearCompendiumCache() { _compendiumCache = null; }

// ── Actor Detection ──────────────────────────────────────────────────────────

/**
 * Gather all alchemist-relevant data from an actor.
 * Returns null if the actor is not an Alchemist.
 */
export function getAlchemistData(actor) {
  if (!actor) return null;

  const classItem = actor.items.find(
    i => i.type === "class" && i.name === "Alchemist"
  );
  if (!classItem) return null;

  const level = Math.max(1, Math.min(10,
    actor.system?.attributes?.level?.value ?? 1
  ));
  const progression = ALCHEMIST_LEVELS[level] ?? ALCHEMIST_LEVELS[1];

  // Match Alchemy Tools regardless of equipmentType — the gear compendium uses
  // "gear" but the alchemical-items compendium uses "alchemical".
  const tools = actor.items.find(i =>
    i.type === "equipment"
    && i.name.toLowerCase().includes("alchemy tools")
  );

  const materials = actor.items.filter(i =>
    i.type === "equipment"
    && i.name.toLowerCase().includes("materials")
    && (i.system?.isConsumable || i.system?.gearCategory === "Alchemy & Medicine")
  );
  const totalSilver = materials.reduce((sum, m) => {
    // If consumable with quantity, use quantity as silver value
    if (m.system?.isConsumable) return sum + (m.system?.quantity ?? 0);
    // Non-consumable materials: derive silver from baseCost
    return sum + itemValueInSilver(m);
  }, 0);

  const formulae = tools?.getFlag(MODULE_ID, "knownFormulae") ?? [];

  return {
    classItem,
    level,
    tools,
    materials,
    totalSilver,
    formulae,
    maxFormulaeCount: progression.formulaeKnown,
    maxFormulaeValue: progression.maxValueSilver,
  };
}

// ── Cost Helpers ─────────────────────────────────────────────────────────────

// Book-accurate price overrides (in silver) for compendium items with wrong values.
// Source: Vagabond core rulebook Alchemical Items table.
const PRICE_OVERRIDES = {
  "Acid, Green Slime":      500,    // book: 5g    (compendium: 50s)
  "Candle, Calming":        250,    // book: 2g50s (compendium: 2s 50c)
  "Frigid Azote":           50,     // book: 50s   (compendium: 2g)
  "Potion, Clairaudience":  5000,   // book: 50g   (compendium: 25g)
  "Potion, ESP":            25000,  // book: 250g  (compendium: 25g)
  "Potion, Giant Strength": 25000,  // book: 250g  (compendium: 175g)
  "Potion, Invisibility":   5000,   // book: 50g   (compendium: 50s)
  "Torch, Repel Beast":     200,    // book: 2g    (compendium: 5g)
};

/** Convert an item's baseCost object to a flat silver value. Applies book price overrides. */
export function itemValueInSilver(itemOrData) {
  // Check for book-accurate price override first
  const name = itemOrData?.name ?? "";
  if (PRICE_OVERRIDES[name] !== undefined) return PRICE_OVERRIDES[name];

  const cost = itemOrData?.system?.baseCost ?? itemOrData?.baseCost ?? {};
  return (cost.gold ?? 0) * 100 + (cost.silver ?? 0) + (cost.copper ?? 0) * 0.01;
}

/** Format a silver value as a human-readable cost string. */
export function formatCost(silver) {
  if (silver >= 100 && silver % 100 === 0) return `${silver / 100}g`;
  if (silver >= 100) {
    const g = Math.floor(silver / 100);
    const s = silver % 100;
    return `${g}g ${s}s`;
  }
  if (silver >= 1) return `${silver}s`;
  return `${Math.round(silver * 100)}c`;
}

/**
 * Get the crafting cost in silver for an item.
 * @param {object} itemData  - Item data (with system.baseCost)
 * @param {boolean} isFormula - Whether this is one of the alchemist's known formulae
 * @returns {number} silver cost
 */
export function getCraftCost(itemData, isFormula) {
  if (isFormula) return 5;
  return Math.ceil(itemValueInSilver(itemData) / 2);
}

/**
 * Convert a non-consumable Materials item into a consumable with quantity = silver value.
 * Called automatically when crafting encounters a raw Materials item.
 */
async function _convertToConsumable(actor, mat) {
  const silver = itemValueInSilver(mat);
  if (silver <= 0) return null;
  await actor.updateEmbeddedDocuments("Item", [{
    _id: mat.id,
    "name": `Materials (${formatCost(silver)}) (Consumable)`,
    "system.isConsumable": true,
    "system.quantity": silver,
    "system.baseCost.gold": 0,
    "system.baseCost.silver": silver,
    "system.baseCost.copper": 0,
  }]);
  return actor.items.get(mat.id);
}

/**
 * Update the name and cost of a Materials item to reflect remaining quantity.
 */
function _materialsUpdateData(mat, newQty) {
  const update = {
    _id: mat.id,
    "system.quantity": newQty,
    "name": `Materials (${formatCost(newQty)}) (Consumable)`,
    "system.baseCost.gold": 0,
    "system.baseCost.silver": newQty,
    "system.baseCost.copper": 0,
  };
  return update;
}

/**
 * Deduct silver-worth of materials from an actor's material items.
 * Converts non-consumable materials to consumable on first use.
 * Deducts from the largest-quantity item first.
 * Updates item name/cost to reflect remaining quantity.
 */
export async function deductMaterials(actor, silverCost) {
  let materials = actor.items
    .filter(i =>
      i.type === "equipment"
      && i.name.toLowerCase().includes("materials")
      && (i.system?.isConsumable || i.system?.gearCategory === "Alchemy & Medicine")
    );

  // Convert any non-consumable materials first
  for (const mat of materials) {
    if (!mat.system?.isConsumable) {
      await _convertToConsumable(actor, mat);
    }
  }

  // Re-fetch after conversions
  materials = actor.items
    .filter(i =>
      i.type === "equipment"
      && i.system?.isConsumable
      && i.name.toLowerCase().includes("materials")
    )
    .sort((a, b) => (b.system?.quantity ?? 0) - (a.system?.quantity ?? 0));

  let remaining = silverCost;
  const updates = [];

  for (const mat of materials) {
    if (remaining <= 0) break;
    const qty = mat.system?.quantity ?? 0;
    const deduct = Math.min(qty, remaining);
    const newQty = qty - deduct;
    updates.push(_materialsUpdateData(mat, newQty));
    remaining -= deduct;
  }

  if (remaining > 0) {
    ui.notifications.error("Not enough materials!");
    return false;
  }

  if (updates.length) {
    await actor.updateEmbeddedDocuments("Item", updates);
  }

  // Remove empty material items (quantity 0)
  const empties = materials.filter(m => {
    const update = updates.find(u => u._id === m.id);
    return update && update["system.quantity"] === 0;
  });
  if (empties.length) {
    await actor.deleteEmbeddedDocuments("Item", empties.map(m => m.id));
  }

  return true;
}

// ── Auto-Convert Materials Hook ──────────────────────────────────────────────

/**
 * Register a createItem hook that auto-converts raw Materials items
 * into consumables when added to an Alchemist's inventory.
 * Gold values are converted to silver, quantity is set to silver value,
 * and the item name is updated to show remaining uses.
 */
export function registerMaterialsHook() {
  Hooks.on("createItem", async (item, _options, _userId) => {
    // Only act on items owned by an actor
    const actor = item.parent;
    if (!actor || actor.documentName !== "Actor") return;

    // Only materials
    if (item.type !== "equipment") return;
    if (!item.name.toLowerCase().includes("materials")) return;

    // Already consumable — nothing to do
    if (item.system?.isConsumable) return;

    // Must be on an Alchemist
    const isAlchemist = actor.items.some(
      i => i.type === "class" && i.name === "Alchemist"
    );
    if (!isAlchemist) return;

    // Convert
    const silver = itemValueInSilver(item);
    if (silver <= 0) return;

    await actor.updateEmbeddedDocuments("Item", [{
      _id: item.id,
      "name": `Materials (${formatCost(silver)}) (Consumable)`,
      "system.isConsumable": true,
      "system.quantity": silver,
      "system.baseCost.gold": 0,
      "system.baseCost.silver": silver,
      "system.baseCost.copper": 0,
    }]);

    console.log(`${MODULE_ID} | Auto-converted Materials to consumable: ${silver}s`);
  });
}

// ── Weapon Conversion ────────────────────────────────────────────────────────

/**
 * Check whether an alchemical item should be converted to a weapon.
 */
export function isOffensiveType(itemData) {
  if (WEAPON_OVERRIDES.has(itemData?.name)) return true;
  const aType = (itemData?.system?.alchemicalType ?? "").toLowerCase();
  return WEAPON_TYPES.has(aType);
}

/**
 * Transform compendium alchemical item data into a usable weapon.
 * Returns a new object — does not mutate the input.
 */
export function convertToWeapon(itemData) {
  const data = foundry.utils.deepClone(itemData);
  data.system.equipmentType = "weapon";
  data.system.weaponSkill   = "craft";
  data.system.range         = "near";
  data.system.grip          = "1H";
  data.system.isConsumable  = true;
  data.system.equipped      = false;
  data.system.equipmentState = "oneHand";
  // Always use damageAmount as the weapon's one-hand damage — the alchemical
  // compendium items have the real damage in damageAmount while damageOneHand
  // holds a generic template default (e.g. "d6") that doesn't reflect the item.
  if (data.system.damageAmount) {
    data.system.damageOneHand = data.system.damageAmount;
  } else {
    // Fallback for items with no damage set (e.g. Dwarfblind Stone)
    data.system.damageOneHand = "1d6";
  }
  if (data.system.damageType && data.system.damageType !== "-") {
    data.system.damageTypeOneHand = data.system.damageType;
  } else {
    data.system.damageTypeOneHand = "blunt";
  }
  // Embed secondary effect metadata (e.g. Burning Cd6) on the weapon via flags
  const effect = getAlchemicalEffect(itemData.name);
  if (effect) {
    data.flags = data.flags ?? {};
    data.flags[MODULE_ID] = {
      ...(data.flags[MODULE_ID] ?? {}),
      alchemicalEffect: effect,
    };
  }

  // Strip compendium metadata so it creates as a new item
  delete data._id;
  delete data._stats;
  return data;
}

/**
 * Prepare an item for adding to an actor's inventory.
 * Non-offensive items stay as-is but get cleaned metadata.
 */
export function prepareForInventory(itemData) {
  const data = foundry.utils.deepClone(itemData);
  delete data._id;
  delete data._stats;
  return data;
}

// ── Craft Action ─────────────────────────────────────────────────────────────

/**
 * Execute a craft action: fetch from compendium, convert if needed,
 * deduct materials, add to actor, post chat message.
 *
 * @param {Actor}  actor     - The crafting actor
 * @param {string} itemName  - Name of the item in the compendium
 * @param {boolean} isFormula - Whether this is a known formula (5s cost)
 * @returns {boolean} true if successful
 */
export async function craftItem(actor, itemName, isFormula) {
  const alcData = getAlchemistData(actor);
  if (!alcData) {
    ui.notifications.warn("This character is not an Alchemist!");
    return false;
  }
  if (!alcData.tools) {
    ui.notifications.warn("Alchemy Tools required to craft!");
    return false;
  }

  const compendiumItems = await fetchCompendiumItems();
  const itemData = compendiumItems.find(
    d => d.name.toLowerCase() === itemName.toLowerCase()
  );
  if (!itemData) {
    ui.notifications.error(`Item "${itemName}" not found in compendium.`);
    return false;
  }

  const cost = getCraftCost(itemData, isFormula);
  if (alcData.totalSilver < cost) {
    ui.notifications.error(`Not enough materials! Need ${formatCost(cost)}, have ${formatCost(alcData.totalSilver)}.`);
    return false;
  }

  // Deduct materials first
  const deducted = await deductMaterials(actor, cost);
  if (!deducted) return false;

  // Prepare item data
  let newItemData;
  if (isOffensiveType(itemData)) {
    newItemData = convertToWeapon(itemData);
    newItemData.name = `${itemData.name} (Weapon)`;
  } else {
    newItemData = prepareForInventory(itemData);
    // Keep damage fields intact for healing items so the system handles
    // healing natively (damageType: "healing", damageAmount: "1d6+1", etc.)
    // Only strip damage fields for non-healing consumables that have custom
    // effects handled by useConsumable().
    const consEffect = getConsumableEffect(itemData.name);
    if (consEffect && newItemData.system?.damageType !== "healing") {
      if (newItemData.system) {
        newItemData.system.damageAmount = "";
        newItemData.system.damageType = "-";
      }
    }
    // Mark as consumable and equipped so they appear in the sliding panel
    if (newItemData.system) {
      newItemData.system.equipped = true;
      if (newItemData.system.damageType === "healing") {
        newItemData.system.isConsumable = true;
        newItemData.system.locked = true;
      }
    }
  }

  // Create on actor
  const [createdItem] = await actor.createEmbeddedDocuments("Item", [newItemData]);

  // Apply alchemical effect flags after creation (Foundry strips unknown flags during create)
  const effect = getAlchemicalEffect(itemData.name);
  if (effect && createdItem) {
    await createdItem.setFlag(MODULE_ID, "alchemicalEffect", effect);
  }

  // ── Potency (Level 4+) & Big Bang (Level 8+) ──
  // Apply exploding dice and bonus damage to ALL crafted alchemical items
  // (weapons, potions, oils, concoctions — not just offensive types)
  if (createdItem && alcData.level >= 4) {
    // For weapons, use currentDamage; for non-weapons, use damageAmount
    const currentDmg = createdItem.system.currentDamage
      || createdItem.system.damageAmount || "";
    const dieMatch = currentDmg.match(/d(\d+)/);
    const maxFace = dieMatch ? parseInt(dieMatch[1]) : 6;
    const updates = { "system.canExplode": true };

    if (alcData.level >= 8) {
      // Big Bang: explode on two highest values + bonus d6
      updates["system.explodeValues"] = `${maxFace},${maxFace - 1}`;
      // Add +d6 to the appropriate damage field
      if (isOffensiveType(itemData)) {
        updates["system.currentDamage"] = `${currentDmg} + 1d6`;
      } else if (currentDmg) {
        updates["system.damageAmount"] = `${currentDmg} + 1d6`;
      }
    } else {
      // Potency: explode on max value only
      updates["system.explodeValues"] = `${maxFace}`;
    }
    await createdItem.update(updates);
    console.log(`${MODULE_ID} | Applied ${alcData.level >= 8 ? "Big Bang" : "Potency"} to ${createdItem.name}: explode=${updates["system.explodeValues"]}`);
  }

  // Chat message
  const costStr = formatCost(cost);
  ChatMessage.create({
    content: `<p><strong>${actor.name}</strong> crafted <strong>${itemData.name}</strong> (cost: ${costStr})</p>`,
    speaker: ChatMessage.getSpeaker({ actor }),
  });

  return true;
}

// ── Countdown Dice Damage Hook ──────────────────────────────────────────────

/**
 * Register a hook that auto-applies damage when a countdown die with
 * our damage metadata is rolled. Listens for new chat messages from the
 * system's countdown dice roll flow, extracts the roll result, and
 * applies it as damage to the stored target.
 */
export function registerCountdownDamageHook() {
  Hooks.on("createChatMessage", async (message) => {
    // Only run for the GM to avoid duplicate applications
    if (!game.user.isGM) return;

    const content = message.content ?? "";
    console.log(`${MODULE_ID} | createChatMessage hook — checking for countdown dice. Has "Countdown Dice": ${content.includes("Countdown Dice")}, Has "countdown": ${content.toLowerCase().includes("countdown")}`);

    // Check if this is a countdown dice chat card
    if (!content.toLowerCase().includes("countdown")) return;

    console.log(`${MODULE_ID} | Countdown chat detected. Content snippet:`, content.substring(0, 500));

    // Extract the dice name from the chat card — try multiple patterns
    let diceName = null;
    // Pattern 1: title element
    const titleMatch = content.match(/class="[^"]*title[^"]*"[^>]*>([^<]+)/);
    if (titleMatch) diceName = titleMatch[1].trim();
    // Pattern 2: fallback — scan for our naming convention "X - Y - Z"
    if (!diceName) {
      const nameMatch = content.match(/>\s*([^<]+ - [^<]+ - [^<]+)\s*</);
      if (nameMatch) diceName = nameMatch[1].trim();
    }

    console.log(`${MODULE_ID} | Extracted dice name:`, diceName);
    if (!diceName) return;

    // Find the matching countdown die journal entry with our damage flags
    const journal = game.journal.find(j => {
      const cdFlags = j.flags?.vagabond?.countdownDice;
      if (!cdFlags || cdFlags.type !== "countdownDice") return false;
      if (cdFlags.name !== diceName) return false;
      return !!j.flags?.[MODULE_ID]?.countdownDamage;
    });

    console.log(`${MODULE_ID} | Journal match:`, journal ? `${journal.name} (id: ${journal.id})` : "NOT FOUND");
    if (!journal) {
      // Debug: list all countdown dice journals
      const allCD = game.journal.filter(j => j.flags?.vagabond?.countdownDice?.type === "countdownDice");
      console.log(`${MODULE_ID} | All countdown dice:`, allCD.map(j => ({
        name: j.flags.vagabond.countdownDice.name,
        hasOurFlags: !!j.flags?.[MODULE_ID]?.countdownDamage,
      })));
      return;
    }

    const dmgData = journal.flags[MODULE_ID].countdownDamage;

    // Extract roll result from the chat card
    const resultMatch = content.match(/Result:\s*(\d+)/);
    const rollResult = resultMatch ? parseInt(resultMatch[1]) : 0;
    console.log(`${MODULE_ID} | Roll result:`, rollResult, "Damage data:", dmgData);
    if (rollResult <= 0) return;

    // Find the target — prefer the token actor (handles unlinked tokens)
    let targetActor = null;
    if (dmgData.targetTokenId && dmgData.targetSceneId) {
      const scene = game.scenes.get(dmgData.targetSceneId);
      const tokenDoc = scene?.tokens?.get(dmgData.targetTokenId);
      targetActor = tokenDoc?.actor ?? null;
    }
    // Fallback to world actor
    if (!targetActor) targetActor = game.actors.get(dmgData.targetActorId);
    if (!targetActor) {
      console.warn(`${MODULE_ID} | Target actor not found: ${dmgData.targetActorId}`);
      return;
    }

    // Apply damage (only if this countdown deals damage)
    if (dmgData.damageType) {
      const currentHP = targetActor.system?.health?.value ?? 0;
      const finalDmg = await applyCalculatedDamage(targetActor, rollResult, dmgData.damageType);
      const newHP = targetActor.system?.health?.value ?? 0;

      // Post damage notification to chat
      const mitigated = finalDmg < rollResult ? ` (${rollResult - finalDmg} mitigated by armor)` : "";
      ChatMessage.create({
        content: `<p><strong>${diceName}</strong> deals <strong>${finalDmg} ${dmgData.damageType}</strong> damage to <strong>${targetActor.name}</strong>.${mitigated} (${currentHP} → ${newHP} HP)</p>`,
        speaker: { alias: "Vagabond Crawler" },
      });

      console.log(`${MODULE_ID} | Countdown damage applied: ${finalDmg} ${dmgData.damageType} to ${targetActor.name}`);
    }
  });
}

/**
 * Register a hook that removes linked Active Effects when their
 * countdown die journal entry is deleted (die reached end).
 * E.g. Tanglefoot Bag → Restrained AE removed when Cd4 ends.
 */
export function registerCountdownLinkedAEHook() {
  Hooks.on("deleteJournalEntry", async (journal) => {
    if (!game.user.isGM) return;

    const dmgData = journal.flags?.[MODULE_ID]?.countdownDamage;
    if (!dmgData) return;

    // ── Oil weapon cleanup: remove ignited/coating flags + restore light ──
    if (dmgData.oilWeaponId && dmgData.oilActorId) {
      try {
        const oilActor = game.actors.get(dmgData.oilActorId);
        if (oilActor) {
          const weapon = oilActor.items.get(dmgData.oilWeaponId);
          if (weapon) {
            // Restore original token light
            const origLight = weapon.flags?.[MODULE_ID]?.oilOriginalLight;
            const token = oilActor.getActiveTokens(true)[0];
            if (token?.document && origLight) {
              await token.document.update({
                "light.dim": origLight.dim ?? 0,
                "light.bright": origLight.bright ?? 0,
                "light.color": origLight.color ?? null,
                "light.alpha": 0.5,
                "light.animation.type": origLight.animation ?? null,
                "light.animation.speed": 5,
                "light.animation.intensity": 5,
              });
            }
            // Restore original damage type if silvered (Anointing Oil)
            if (weapon.flags?.[MODULE_ID]?.oilOriginalDamageType !== undefined) {
              await weapon.update({ "system.damageType": weapon.flags[MODULE_ID].oilOriginalDamageType });
              await weapon.unsetFlag(MODULE_ID, "oilOriginalDamageType");
            }
            // Restore original metal if it was changed
            if (weapon.flags?.[MODULE_ID]?.oilOriginalMetal !== undefined) {
              await weapon.update({ "system.metal": weapon.flags[MODULE_ID].oilOriginalMetal });
              await weapon.unsetFlag(MODULE_ID, "oilOriginalMetal");
            }
            await weapon.unsetFlag(MODULE_ID, "oilOriginalLight");
            await weapon.unsetFlag(MODULE_ID, "oilIgnited");
            await weapon.unsetFlag(MODULE_ID, "oilCoating");

            ChatMessage.create({
              content: `<p>The burning oil on <strong>${weapon.name}</strong> has burned out.</p>`,
              speaker: { alias: "Vagabond Crawler" },
            });
            console.log(`${MODULE_ID} | Oil burned out on ${weapon.name}`);
          }
        }
      } catch (err) {
        console.warn(`${MODULE_ID} | Failed to clean up oil weapon flags:`, err);
      }
    }

    if (!dmgData.linkedAEId) return;

    // Resolve the target actor
    let targetActor = null;
    if (dmgData.targetTokenId && dmgData.targetSceneId) {
      const scene = game.scenes.get(dmgData.targetSceneId);
      const tokenDoc = scene?.tokens?.get(dmgData.targetTokenId);
      targetActor = tokenDoc?.actor ?? null;
    }
    if (!targetActor && dmgData.targetActorId) {
      targetActor = game.actors.get(dmgData.targetActorId);
    }
    if (!targetActor) return;

    // Find and remove the linked AE
    const ae = targetActor.effects.get(dmgData.linkedAEId);
    if (ae) {
      try {
        await ae.delete();
        console.log(`${MODULE_ID} | Removed linked AE "${ae.name}" from ${targetActor.name} (countdown ended)`);
        ChatMessage.create({
          content: `<p><strong>${ae.name}</strong> has ended on <strong>${targetActor.name}</strong>.</p>`,
          speaker: { alias: "Vagabond Crawler" },
        });
      } catch (err) {
        console.warn(`${MODULE_ID} | Failed to remove linked AE:`, err);
      }
    }
  });
}

/**
 * Register a hook that applies oil bonus damage when a weapon attack
 * chat card is created from the character sheet (not the crawl strip,
 * which handles it separately in npc-action-menu.mjs).
 * Listens for weapon attack chat cards and checks if the weapon has
 * an active oil coating.
 */
export function registerOilBonusDamageHook() {
  Hooks.on("createChatMessage", async (message) => {
    if (!game.user.isGM) return;

    const content = message.content ?? "";
    // Only weapon attack cards that are hits (result-hit banner present)
    if (!content.includes("Attack")) return;
    if (!content.includes("result-hit")) return;

    // Extract actor and item IDs from the card
    const actorMatch = content.match(/data-actor-id="([^"]+)"/);
    const itemMatch = content.match(/data-item-id="([^"]+)"/);
    if (!actorMatch || !itemMatch) return;

    const actor = game.actors.get(actorMatch[1]);
    const weapon = actor?.items.get(itemMatch[1]);
    if (!weapon) return;

    // Check for oil ignited flag
    const oilData = weapon.flags?.[MODULE_ID]?.oilIgnited;
    if (!oilData) return;

    console.log(`${MODULE_ID} | Oil bonus damage hook fired for ${weapon.name}`);

    // Roll oil bonus damage
    try {
      const bonusRoll = new Roll(oilData.damageFormula || "1d6");
      await bonusRoll.evaluate();
      const bonusDmg = bonusRoll.total;

      // Find targets — prefer message flags, fallback to HTML attributes
      const scene = game.scenes.active;
      let appliedDmg = bonusDmg;
      let targetName = "target";

      const flagTargets = message.flags?.vagabond?.targetsAtRollTime;
      let targetTokenDoc = null;
      if (flagTargets?.length && scene && flagTargets[0].sceneId === scene.id) {
        targetTokenDoc = scene.tokens.get(flagTargets[0].tokenId);
      }
      if (!targetTokenDoc) {
        const targetMatches = [...content.matchAll(/data-token-id="([^"]+)"/g)];
        if (targetMatches.length && scene) {
          targetTokenDoc = scene.tokens.get(targetMatches[0][1]);
        }
      }

      if (targetTokenDoc) {
        const targetActor = targetTokenDoc?.actor;
        if (targetActor) {
          targetName = targetActor.name;
          appliedDmg = await applyCalculatedDamage(targetActor, bonusDmg, oilData.damageType || "fire");

          // Bladefire: apply Burning countdown die to the target on hit
          if (oilData.burnsTarget && oilData.burnsTargetDie) {
            try {
              const { CountdownDice } = globalThis.vagabond.documents;
              const targetScene = scene.id;
              const cdName = `Burning - ${weapon.name} - ${targetActor.name}`;
              const cdJournal = await CountdownDice.create({
                name: cdName,
                diceType: oilData.burnsTargetDie,
                size: "S",
              });
              // Store damage metadata on the countdown die
              if (cdJournal) {
                await cdJournal.setFlag(MODULE_ID, "countdownDamage", {
                  damageType: "fire",
                  targetActorId: targetActor.id,
                  targetTokenId: targetTokenDoc.id,
                  targetSceneId: targetScene,
                });
              }
              console.log(`${MODULE_ID} | Bladefire applied Burning (${oilData.burnsTargetDie}) to ${targetActor.name}`);
            } catch (cdErr) {
              console.warn(`${MODULE_ID} | Failed to create Bladefire burning die:`, cdErr);
            }
          }
        }
      }

      // Post bonus damage chat card
      const diceResults = bonusRoll.dice.map(d => d.results.map(r => r.result)).flat();
      const mitigated = appliedDmg < bonusDmg ? ` (${bonusDmg - appliedDmg} mitigated by armor)` : "";
      const silverNote = oilData.silvered ? " ⚔️ Silvered" : "";
      await ChatMessage.create({
        content: `<p>🔥 <strong>${weapon.name}</strong> (Burning Oil) deals <strong>${appliedDmg} ${oilData.damageType || "fire"}</strong> bonus damage to <strong>${targetName}</strong>! [${oilData.damageFormula}: ${diceResults.join(", ")}]${mitigated}${silverNote}</p>`,
        speaker: ChatMessage.getSpeaker({ actor }),
      });
    } catch (err) {
      console.warn(`${MODULE_ID} | Oil bonus damage failed:`, err);
    }
  });
}

/**
 * Apply all post-attack alchemical effects for a weapon hit.
 * Handles countdown dice, linked statuses, on-hit AEs, splash damage,
 * and GM reminders. Called from both the crawl strip and the chat hook.
 *
 * @param {Item} weapon        - The attacking weapon item
 * @param {Actor} attackerActor - The attacking actor
 * @param {object|null} targetInfo - { actor, tokenId, sceneId } for the primary target
 * @param {number|null} damageTotal - Total damage dealt (for splash calc), or null
 */
export async function applyAlchemicalPostAttack(weapon, attackerActor, targetInfo, damageTotal) {
  const flagEffect = weapon.flags?.[MODULE_ID]?.alchemicalEffect;
  if (!flagEffect) return;

  const targetActor = targetInfo?.actor ?? null;
  const baseName = weapon.name.replace(/\s*\(Weapon\)\s*$/, "");

  // Always merge with the live ALCHEMICAL_EFFECTS table so changes
  // (e.g. new target filters) apply without re-crafting the weapon.
  const liveEffect = ALCHEMICAL_EFFECTS[baseName] ?? {};
  const effect = { ...flagEffect, ...liveEffect };
  const targetName = targetActor?.name ?? "Unknown";

  // ── Countdown die (Burning, Blinded, Restrained, etc.) ──
  if (effect.countdownDie) {
    let createCountdown = true;

    // Conditional: check target being type and/or name list (e.g. Holy Water: Undead + Hellspawn names)
    if (effect.onlyTargetBeingTypes?.length || effect.onlyTargetNames?.length) {
      let matchesType = false;
      let matchesName = false;

      if (effect.onlyTargetBeingTypes?.length) {
        const beingType = targetActor?.system?.beingType
          ?? targetActor?.system?.ancestry?.beingType
          ?? targetActor?.system?.attributes?.beingType
          ?? "";
        matchesType = effect.onlyTargetBeingTypes.some(t => t.toLowerCase() === beingType.toLowerCase());
      }
      if (effect.onlyTargetNames?.length) {
        matchesName = effect.onlyTargetNames.some(n => targetName.toLowerCase().includes(n.toLowerCase()));
      }

      // OR logic: passes if EITHER being type or name matches
      console.log(`${MODULE_ID} | Target filter: name="${targetName}", beingType="${targetActor?.system?.beingType ?? "?"}", matchesType=${matchesType}, matchesName=${matchesName}`);
      createCountdown = matchesType || matchesName;
      if (!createCountdown) {
        const parts = [];
        if (effect.onlyTargetBeingTypes?.length) parts.push(...effect.onlyTargetBeingTypes);
        if (effect.onlyTargetNames?.length) parts.push("a valid creature type");
        const filterDesc = parts.join(" or ");
        ChatMessage.create({
          content: `<p><strong>${weapon.name}</strong> has no special effect — target is not ${filterDesc}.</p>`,
          speaker: ChatMessage.getSpeaker({ actor: attackerActor }),
        });
      }
    }
    // Conditional: check target senses (e.g. Dwarfblind Stone: Darksight)
    else if (effect.onlyTargetSenses?.length) {
      const senses = (targetActor?.system?.senses ?? "").toLowerCase();
      createCountdown = effect.onlyTargetSenses.some(s => senses.includes(s.toLowerCase()));
      if (!createCountdown) {
        ChatMessage.create({
          content: `<p><strong>${weapon.name}</strong> has no effect — target does not have ${effect.onlyTargetSenses.join("/")}.</p>`,
          speaker: ChatMessage.getSpeaker({ actor: attackerActor }),
        });
      }
    }
    // Conditional: GM confirmation dialog (e.g. Oxidizing: is target metal?)
    else if (effect.confirmCountdown) {
      createCountdown = await foundry.applications.api.DialogV2.confirm({
        window: { title: "Countdown Die" },
        content: `<p>${effect.confirmCountdown}</p>`,
        modal: false,
        rejectClose: false,
      }) ?? false;
    }

    if (createCountdown) {
      try {
        const dieName = `${effect.effectName} - ${baseName} - ${targetName}`;
        const { CountdownDice } = globalThis.vagabond.documents;
        const cdJournal = await CountdownDice.create({
          name: dieName,
          diceType: effect.countdownDie,
          size: "S",
        });

        if (cdJournal) {
          const flagData = {
            targetActorId: targetActor?.id ?? null,
            targetTokenId: targetInfo?.tokenId ?? null,
            targetSceneId: targetInfo?.sceneId ?? null,
          };
          if (effect.damageType) flagData.damageType = effect.damageType;

          // Linked status: apply AE now and store reference for removal when die ends
          if (effect.linkedStatus && targetActor) {
            const aeData = {
              name: effect.linkedStatus.label,
              icon: effect.linkedStatus.icon || "icons/svg/aura.svg",
              origin: `module.${MODULE_ID}.countdown.${cdJournal.id}`,
              disabled: false,
              changes: effect.linkedStatus.changes ?? [],
            };
            if (effect.linkedStatus.statusId) {
              aeData.statuses = [effect.linkedStatus.statusId];
            }
            try {
              const [ae] = await targetActor.createEmbeddedDocuments("ActiveEffect", [aeData]);
              flagData.linkedAEId = ae?.id ?? null;
              console.log(`${MODULE_ID} | Applied "${effect.linkedStatus.label}" to ${targetActor.name}`);
            } catch (aeErr) {
              console.warn(`${MODULE_ID} | Failed to apply linked status:`, aeErr);
            }
          }

          await cdJournal.setFlag(MODULE_ID, "countdownDamage", flagData);

          if (effect.gmReminder) {
            ChatMessage.create({
              content: `<p><strong>⚠️ ${baseName} — GM Reminder:</strong> ${effect.gmReminder}</p>`,
              speaker: { alias: "Vagabond Crawler" },
              whisper: game.users.filter(u => u.isGM).map(u => u.id),
            });
          }
        }
      } catch (cdErr) {
        console.warn(`${MODULE_ID} | Failed to create countdown die:`, cdErr);
      }
    }
  }

  // ── AoE splash damage (e.g. Levin Shell) ──
  if (effect.splash && damageTotal) {
    const primaryToken = targetInfo?.tokenId
      ? { tokenId: targetInfo.tokenId, sceneId: targetInfo.sceneId, actorId: targetActor?.id, actorName: targetName }
      : null;
    await applySplashDamage(effect, primaryToken, damageTotal, attackerActor);
  }
  // ── On-hit Active Effects (e.g. Frigid Azote speed halving) ──
  else if (effect.onHitEffects?.length && targetActor) {
    await applyOnHitEffects(effect, targetActor);
  }
}

/**
 * Register a hook that applies alchemical weapon effects when an attack
 * chat card is created from ANY source (character sheet or crawl strip).
 * This is the unified handler — the crawl strip no longer needs its own
 * post-attack effect logic.
 */
export function registerAlchemicalAttackHook() {
  Hooks.on("createChatMessage", async (message) => {
    if (!game.user.isGM) return;

    const content = message.content ?? "";
    // Only weapon attack cards that are hits
    if (!content.includes("Attack")) return;
    if (!content.includes("result-hit")) return;

    // Extract actor and item IDs
    const actorMatch = content.match(/data-actor-id="([^"]+)"/);
    const itemMatch = content.match(/data-item-id="([^"]+)"/);
    if (!actorMatch || !itemMatch) return;

    const actor = game.actors.get(actorMatch[1]);
    const weapon = actor?.items.get(itemMatch[1]);
    if (!weapon) return;

    // Only process weapons with alchemical effects
    const effect = weapon.flags?.[MODULE_ID]?.alchemicalEffect;
    if (!effect) return;

    // Resolve target from message flags (system stores targets there)
    const scene = game.scenes.active;
    let targetInfo = null;

    const flagTargets = message.flags?.vagabond?.targetsAtRollTime;
    if (flagTargets?.length && scene) {
      const t = flagTargets[0]; // primary target
      if (t.sceneId === scene.id) {
        const tokenDoc = scene.tokens.get(t.tokenId);
        if (tokenDoc?.actor) {
          targetInfo = {
            actor: tokenDoc.actor,
            tokenId: tokenDoc.id,
            sceneId: scene.id,
          };
        }
      }
    }

    // Fallback: try HTML data attributes (crawl strip cards)
    if (!targetInfo) {
      const targetTokenMatch = content.match(/data-token-id="([^"]+)"/);
      if (targetTokenMatch && scene) {
        const tokenDoc = scene.tokens.get(targetTokenMatch[1]);
        if (tokenDoc?.actor) {
          targetInfo = {
            actor: tokenDoc.actor,
            tokenId: tokenDoc.id,
            sceneId: scene.id,
          };
        }
      }
    }

    // Extract damage total from the chat card (for splash calculations)
    const dmgMatch = content.match(/data-damage-amount="(\d+)"/);
    const damageTotal = dmgMatch ? parseInt(dmgMatch[1]) : null;

    console.log(`${MODULE_ID} | Alchemical attack hook: ${weapon.name} → ${targetInfo?.actor?.name ?? "no target"}`);
    await applyAlchemicalPostAttack(weapon, actor, targetInfo, damageTotal);
  });
}

/**
 * Register a hook that auto-applies consumable effects when a self-use
 * alchemical item is used through the system's native handler (gear use card).
 * The system handles consumption; we only apply the mechanical effect and post
 * a result message.
 */
export function registerConsumableUseHook() {
  Hooks.on("createChatMessage", async (message) => {
    if (!game.user.isGM) return;

    const content = message.content ?? "";
    // Skip attack cards — only process gear-use / item-use cards
    if (content.includes("result-hit") || content.includes("result-miss")) return;

    // Extract actor and item from message flags (system stores IDs there,
    // NOT as data-attributes in the HTML content)
    const flagActorId = message.flags?.vagabond?.actorId;
    const flagItemId = message.flags?.vagabond?.itemId;
    if (!flagActorId) return;

    const actor = game.actors.get(flagActorId);
    if (!actor) return;
    const item = flagItemId ? actor.items.get(flagItemId) : null;
    // Item may already be deleted by system consumption — look up by name from chat
    const itemName = item?.name ?? content.match(/<h3[^>]*>([^<]+)<\/h3>/)?.[1]?.trim();
    if (!itemName) return;

    const effect = getConsumableEffect(itemName);
    if (!effect) return;

    // Skip healing effects if the item has damageType: "healing" — the system
    // handles healing natively via its damage card. Our hook would double-heal.
    if (effect.type === "heal" && item?.system?.damageType === "healing") {
      console.log(`${MODULE_ID} | Skipping custom heal for ${itemName} — system handles natively.`);
      return;
    }

    console.log(`${MODULE_ID} | Consumable use detected: ${itemName}`);

    try {
      let chatText = effect.chatMessage.replace("{actor}", actor.name);

      if (effect.type === "removeStatus") {
        const toRemove = actor.effects.filter(ae => ae.statuses?.has(effect.statusId));
        if (toRemove.length) {
          await actor.deleteEmbeddedDocuments("ActiveEffect", toRemove.map(e => e.id));
        } else {
          ChatMessage.create({
            content: `<p>${actor.name} is not ${effect.statusId}.</p>`,
            speaker: ChatMessage.getSpeaker({ actor }),
          });
          return;
        }

      } else if (effect.type === "heal") {
        let formula = effect.formula;
        const alcData = getAlchemistData(actor);
        if (alcData?.level >= 8) formula = `1d6 + ${formula}`;

        const roll = new Roll(formula);
        await roll.evaluate();

        if (alcData?.level >= 4) {
          try {
            const { VagabondDamageHelper } = globalThis.vagabond.utils ?? {};
            if (VagabondDamageHelper?._manuallyExplodeDice) {
              const dieMatch = effect.formula.match(/d(\d+)/);
              const maxFace = dieMatch ? parseInt(dieMatch[1]) : 6;
              const explodeVals = alcData.level >= 8 ? [maxFace, maxFace - 1] : [maxFace];
              await VagabondDamageHelper._manuallyExplodeDice(roll, explodeVals);
            }
          } catch (e) { /* non-fatal */ }
        }

        const amount = roll.total;
        if (effect.resource === "health") {
          const current = actor.system?.health?.value ?? 0;
          const max = actor.system?.health?.max ?? current;
          const newVal = Math.min(max, current + amount);
          await actor.update({ "system.health.value": newVal });
          chatText = chatText.replace("{amount}", amount).replace("{from}", current).replace("{to}", newVal);
        } else if (effect.resource === "mana") {
          const current = actor.system?.mana?.current ?? 0;
          const max = actor.system?.mana?.max ?? current;
          const newVal = Math.min(max, current + amount);
          await actor.update({ "system.mana.current": newVal });
          chatText = chatText.replace("{amount}", amount).replace("{from}", current).replace("{to}", newVal);
        }

      } else if (effect.type === "applyEffect") {
        const aeData = {
          name: effect.label,
          icon: effect.icon || "icons/svg/aura.svg",
          origin: `module.${MODULE_ID}`,
          disabled: false,
          changes: effect.changes ?? [],
        };
        if (effect.durationSeconds) aeData.duration = { seconds: effect.durationSeconds };
        await actor.createEmbeddedDocuments("ActiveEffect", [aeData]);
      }

      await ChatMessage.create({
        content: `<p><strong>${chatText}</strong></p>`,
        speaker: ChatMessage.getSpeaker({ actor }),
      });
    } catch (err) {
      console.error(`${MODULE_ID} | Consumable effect failed:`, err);
    }
  });
}

/**
 * Register a hook that grants a Studied die when an Alchemist (level 2+)
 * crits on a Craft check (alchemical weapon attack).
 * Eureka class feature.
 */
export function registerEurekaHook() {
  Hooks.on("createChatMessage", async (message) => {
    if (!game.user.isGM) return;

    const content = message.content ?? "";
    // Must be a weapon attack card that is a hit AND a crit
    if (!content.includes("Attack")) return;
    if (!content.includes("result-hit")) return;
    if (!content.includes("(Crit)")) return;

    // Extract actor and item
    const actorMatch = content.match(/data-actor-id="([^"]+)"/);
    const itemMatch = content.match(/data-item-id="([^"]+)"/);
    if (!actorMatch || !itemMatch) return;

    const actor = game.actors.get(actorMatch[1]);
    if (!actor) return;
    const weapon = actor.items.get(itemMatch[1]);
    if (!weapon) return;

    // Only for alchemical weapons (weaponSkill === "craft")
    if (weapon.system.weaponSkill !== "craft") return;

    // Check Alchemist level ≥ 2
    const alcData = getAlchemistData(actor);
    if (!alcData || alcData.level < 2) return;

    // Grant a Studied die
    const current = actor.system.studiedDice ?? 0;
    await actor.update({ "system.studiedDice": current + 1 });

    ChatMessage.create({
      content: `<p>🧪 <strong>Eureka!</strong> ${actor.name} gains a Studied die! (now has ${current + 1})</p>`,
      speaker: ChatMessage.getSpeaker({ actor }),
    });

    console.log(`${MODULE_ID} | Eureka! ${actor.name} gained a Studied die (${current} → ${current + 1})`);
  });
}

/**
 * Register a hook that auto-removes expired on-hit Active Effects
 * (e.g. Frozen from Frigid Azote) when combat turns advance.
 * Called once from vagabond-character-enhancer.mjs ready hook.
 */
export function registerEffectExpirationHook() {
  Hooks.on("updateCombat", async (combat, changed) => {
    // Only fire when round or turn actually changes
    if (!("round" in changed || "turn" in changed)) return;
    if (!game.user.isGM) return;

    const round = combat.round;

    // Check all combatants for expired module AEs
    for (const combatant of combat.combatants) {
      const actor = combatant.token?.actor ?? combatant.actor;
      if (!actor) continue;

      const toDelete = [];
      for (const ae of actor.effects) {
        if (ae.origin !== `module.${MODULE_ID}`) continue;
        if (!ae.duration?.rounds) continue;

        const startRound = ae.duration.startRound ?? 0;
        const durationRounds = ae.duration.rounds ?? 0;
        // Applied round 2, duration 1 → expires at start of round 3 (2 + 1 = 3)
        const expiresAtRound = startRound + durationRounds;

        if (round >= expiresAtRound) {
          toDelete.push(ae.id);
        }
      }

      if (toDelete.length) {
        try {
          await actor.deleteEmbeddedDocuments("ActiveEffect", toDelete);
          console.log(`${MODULE_ID} | Expired ${toDelete.length} effect(s) on ${actor.name}`);
        } catch (err) {
          console.warn(`${MODULE_ID} | Failed to expire effects on ${actor.name}:`, err);
        }
      }
    }
  });
  console.log(`${MODULE_ID} | Effect expiration hook registered.`);
}

// ── Populate World Items Folder ──────────────────────────────────────────────

/**
 * Create a world-level Items folder containing all alchemical items from the
 * compendium.  Offensive items (acid/explosive/poison) are weapon-converted;
 * others are kept as-is.  All items include proper flags for on-hit effects.
 *
 * Intended as a one-time GM setup.  Running it again will skip items that
 * already exist in the folder (matched by name).
 *
 * Usage (macro or console):
 *   const { populateAlchemicalFolder } = await import(
 *     "./modules/vagabond-crawler/scripts/alchemy-helpers.mjs"
 *   );
 *   await populateAlchemicalFolder();
 */
export async function populateAlchemicalFolder() {
  if (!game.user.isGM) {
    ui.notifications.warn("Only a GM can populate the alchemical items folder.");
    return;
  }

  const FOLDER_NAME = "Alchemical Weapons (Vagabond Crawler)";

  // Find or create the folder
  let folder = game.folders.find(f => f.name === FOLDER_NAME && f.type === "Item");
  if (!folder) {
    folder = await Folder.create({ name: FOLDER_NAME, type: "Item", sorting: "a" });
    console.log(`${MODULE_ID} | Created folder: ${FOLDER_NAME}`);
  }

  // Fetch compendium
  const compendiumItems = await fetchCompendiumItems();
  if (!compendiumItems.length) {
    ui.notifications.warn("No alchemical items found in compendium.");
    return;
  }

  // Get existing items in folder to skip duplicates
  const existingNames = new Set(
    game.items.filter(i => i.folder?.id === folder.id).map(i => i.name)
  );

  let created = 0;
  let skipped = 0;
  const toCreate = [];

  for (const itemData of compendiumItems) {
    const alchEffect = getAlchemicalEffect(itemData.name);
    const consEffect = getConsumableEffect(itemData.name);
    if (!alchEffect && !consEffect) continue;

    if (alchEffect && isOffensiveType(itemData)) {
      // Weapon-converted version (thrown alchemicals)
      const weaponData = convertToWeapon(itemData);
      weaponData.name = `${itemData.name} (Weapon)`;
      if (existingNames.has(weaponData.name)) { skipped++; continue; }
      weaponData.folder = folder.id;
      weaponData.system.isConsumable = true;
      weaponData.system.quantity = weaponData.system.quantity ?? 1;
      toCreate.push(weaponData);
    } else {
      // Non-weapon: oils, coatings, self-use consumables (potions, antitoxin, etc.)
      const data = prepareForInventory(itemData);
      if (existingNames.has(data.name)) { skipped++; continue; }
      data.folder = folder.id;
      data.system.isConsumable = true;
      data.system.quantity = data.system.quantity ?? 1;
      toCreate.push(data);
    }
  }

  if (toCreate.length) {
    const created_items = await Item.create(toCreate);
    created = created_items.length;

    // Set alchemical effect flags on created weapon items
    // (flags may not persist through Item.create, so set via setFlag like craftItem)
    for (const item of created_items) {
      const baseName = item.name.replace(/\s*\(Weapon\)\s*$/, "");
      const effect = getAlchemicalEffect(baseName);
      if (effect) {
        await item.setFlag(MODULE_ID, "alchemicalEffect", effect);
      }
    }
  }

  ui.notifications.info(`Alchemical Items: ${created} created, ${skipped} already existed.`);
  console.log(`${MODULE_ID} | Populated folder "${FOLDER_NAME}": ${created} created, ${skipped} skipped.`);
}

// ── Flag Migration ────────────────────────────────────────────────────────────

const OLD_MODULE = "vagabond-crawler";

/**
 * One-time migration: copy alchemy flags from vagabond-crawler namespace
 * to vagabond-character-enhancer namespace. Runs once, tracked by world setting.
 */
export async function migrateAlchemyFlags() {
  if (!game.user.isGM) return;

  const migrationKey = "alchemyFlagsMigrated";
  if (game.settings.get(MODULE_ID, migrationKey)) return;

  console.log(`${MODULE_ID} | Migrating alchemy flags from ${OLD_MODULE}...`);
  let migrated = 0;

  // Actor-level flags (knownFormulae lives on the Alchemy Tools item's flags)
  // Item-level flags on actor items
  const FLAG_KEYS = [
    "knownFormulae", "alchemicalEffect",
    "oilCoating", "oilIgnited", "oilOriginalLight",
    "oilOriginalMetal", "oilOriginalDamageType"
  ];

  for (const actor of game.actors) {
    // Migrate flags on actor's items
    for (const item of actor.items) {
      for (const key of FLAG_KEYS) {
        const oldVal = item.getFlag(OLD_MODULE, key);
        if (oldVal != null) {
          await item.setFlag(MODULE_ID, key, oldVal);
          migrated++;
        }
      }
    }
  }

  // Migrate flags on journal entries (countdownDamage)
  for (const journal of game.journal) {
    const cdDmg = journal.getFlag(OLD_MODULE, "countdownDamage");
    if (cdDmg != null) {
      await journal.setFlag(MODULE_ID, "countdownDamage", cdDmg);
      migrated++;
    }
  }

  // Mark migration as done
  await game.settings.set(MODULE_ID, migrationKey, true);
  console.log(`${MODULE_ID} | Alchemy flag migration complete: ${migrated} flags copied.`);
}
