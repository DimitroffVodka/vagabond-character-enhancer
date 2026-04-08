/**
 * Rogue Class Features
 * Registry entries + runtime hooks for all Rogue features.
 *
 * ARCHITECTURE OVERVIEW
 * ─────────────────────
 * The Rogue is a single-target burst class built around Sneak Attack:
 *
 *   Sneak Attack (L1)       → Extra d4s on favored attacks + armor penetration
 *   Infiltrator (L1)        → Resourceful Perk + situational favor (flavor)
 *   Unflinching Luck (L2)   → Luck refund on d12 roll (todo)
 *   Evasive (L4)            → Ignore Reflex hinder + remove 2 Dodge dice (todo)
 *   Lethal Weapon (L6)      → Sneak Attack on ALL favored attacks per turn
 *   Unflinching Luck d10(8) → Upgrade refund die (todo)
 *   Waylay (L10)            → Kill grants extra Action (todo)
 *
 * SNEAK ATTACK FLOW
 * ─────────────────
 * 1. rollAttack post-roll: detect favored + hit → stash dice count on item
 * 2. rollDamage pre-roll: inject Xd4 into damage formula
 * 3. calculateFinalDamage: reduce target armor by dice count
 * 4. Chat notification with sneak attack details
 */

import { MODULE_ID, log } from "../utils.mjs";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

export const ROGUE_REGISTRY = {
  // ──────────────────────────────────────────────
  // L1: Sneak Attack
  // ──────────────────────────────────────────────
  // RULES: If your first attack on a Turn is Favored, it deals extra d4
  // damage and ignores Armor equal to the number of extra dice.
  // Scaling: L1=1d4, L4=2d4, L7=3d4, L10=4d4 (+1d4 every 3 levels)
  //
  // STATUS: module — Detects favored hit in rollAttack post-roll,
  // injects bonus d4s in rollDamage, reduces armor in calculateFinalDamage.
  "sneak attack": {
    class: "rogue", level: 1, flag: "rogue_sneakAttack", status: "module",
    description: "First Favored attack on a Turn deals extra d4 damage and ignores Armor equal to dice count. +1d4 every 3 levels."
  },

  // ──────────────────────────────────────────────
  // L1: Infiltrator
  // ──────────────────────────────────────────────
  // RULES: Gain Resourceful Perk. Favor on ambush/trap checks.
  //
  // STATUS: flavor — Perk grant + narrative bonuses.
  "infiltrator": {
    class: "rogue", level: 1, flag: "rogue_infiltrator", status: "flavor",
    description: "Gain Resourceful Perk. Favor on Checks and Saves to ambush and against known traps."
  },

  // ──────────────────────────────────────────────
  // L2: Unflinching Luck
  // ──────────────────────────────────────────────
  // RULES: When you spend Luck for Favor, roll d12. If < remaining Luck,
  // the Luck is not spent.
  //
  // STATUS: flavor — too complicated to automate (requires Luck system hook).
  "unflinching luck": {
    class: "rogue", level: 2, flag: "rogue_unflinchingLuck", status: "flavor",
    description: "When spending Luck for Favor, roll d12. If lower than remaining Luck, the Luck is not spent."
  },

  // ──────────────────────────────────────────────
  // L4: Evasive
  // ──────────────────────────────────────────────
  // RULES: Ignore Hinder on Reflex Saves while not Incapacitated.
  // Ignore two Dodged damage dice instead of one.
  //
  // STATUS: module — Shares infrastructure with Dancer Evasive.
  // Strips Hinder from Reflex saves, removes 2 Dodge dice instead of 1.
  "evasive": {
    class: "rogue", level: 4, flag: "rogue_evasive", status: "module",
    description: "Ignore Hinder on Reflex Saves while not Incapacitated. Ignore two Dodged damage dice instead of one."
  },

  // ──────────────────────────────────────────────
  // L6: Lethal Weapon
  // ──────────────────────────────────────────────
  // RULES: Sneak Attack applies to ANY Favored attacks on a Turn,
  // not just the first.
  //
  // STATUS: module — Removes the first-attack-only restriction from
  // Sneak Attack turn tracking.
  "lethal weapon": {
    class: "rogue", level: 6, flag: "rogue_lethalWeapon", status: "module",
    description: "Sneak Attack applies to any Favored attacks on a Turn, not just the first."
  },

  // ──────────────────────────────────────────────
  // L8: Unflinching Luck (d10)
  // ──────────────────────────────────────────────
  // RULES: Unflinching Luck upgrade: d12 → d10.
  //
  // STATUS: flavor — depends on Unflinching Luck (also flavor).
  "unflinching luck (d10)": {
    class: "rogue", level: 8, flag: "rogue_unflinchingLuckD10", status: "flavor",
    description: "Unflinching Luck upgrade: roll d10 instead of d12."
  },

  // ──────────────────────────────────────────────
  // L10: Waylay
  // ──────────────────────────────────────────────
  // RULES: Once per Round, killing an Enemy grants an immediate Action.
  //
  // STATUS: flavor — player-tracked action economy.
  "waylay": {
    class: "rogue", level: 10, flag: "rogue_waylay", status: "flavor",
    description: "Once per Round, killing an Enemy grants you an immediate Action."
  }
};

/* -------------------------------------------- */
/*  Module-level state                          */
/* -------------------------------------------- */

/**
 * Track Sneak Attack usage per turn.
 * Key: actorId, Value: true (used this turn).
 * Reset on combat turn change.
 */
const _sneakAttackUsedThisTurn = new Map();

/**
 * Sneak Attack armor penetration for calculateFinalDamage.
 * Set in onPreRollDamage, consumed in onCalculateFinalDamage.
 * Key: damageSourceActorId, Value: number of sneak dice.
 */
let _sneakAttackArmorPen = 0;

/* -------------------------------------------- */
/*  Rogue Runtime Hooks                         */
/* -------------------------------------------- */

export const RogueFeatures = {

  registerHooks() {
    // Reset Sneak Attack tracking on combat turn/round change
    Hooks.on("updateCombat", (combat, changed) => {
      if ("turn" in changed || "round" in changed) {
        _sneakAttackUsedThisTurn.clear();
      }
    });

    log("Rogue", "Hooks registered.");
  },

  /* -------------------------------------------- */
  /*  Sneak Attack Dice Calculation                */
  /* -------------------------------------------- */

  /**
   * Calculate the number of Sneak Attack d4s based on Rogue level.
   * L1=1d4, L4=2d4, L7=3d4, L10=4d4
   * Formula: 1 + floor((rogueLevel - 1) / 3)
   */
  _getSneakAttackDice(features) {
    const rogueLevel = features?._classLevel ?? 1;
    return 1 + Math.floor((rogueLevel - 1) / 3);
  },

  /* -------------------------------------------- */
  /*  Handler Methods (called from main dispatcher) */
  /* -------------------------------------------- */

  /**
   * Post-roll attack handler: detect Favored hit and stash sneak attack data.
   * Called AFTER rollAttack returns with the result.
   *
   * Stashes _vceSneakAttack on the item for rollDamage to pick up.
   */
  onPostRollAttack(ctx) {
    if (!ctx.features?.rogue_sneakAttack) return;
    if (!ctx.rollResult) return;

    // Must be a hit
    if (!ctx.rollResult.isHit) return;

    // Must be Favored (the effective favor/hinder used for the roll)
    const effectiveFH = ctx.rollResult.favorHinder;
    if (effectiveFH !== "favor") return;

    // First attack only — unless Lethal Weapon (L6) removes the restriction
    const hasLethal = ctx.features.rogue_lethalWeapon ?? false;
    if (!hasLethal) {
      if (_sneakAttackUsedThisTurn.has(ctx.actor.id)) {
        log("Rogue", `Sneak Attack: already used this turn for ${ctx.actor.name} (no Lethal Weapon)`);
        return;
      }
    }

    // Calculate dice count
    const diceCount = this._getSneakAttackDice(ctx.features);

    // Stash on item for rollDamage
    ctx.item._vceSneakAttack = { diceCount };

    // Mark used this turn
    _sneakAttackUsedThisTurn.set(ctx.actor.id, true);

    log("Rogue", `Sneak Attack: ${ctx.actor.name} — ${diceCount}d4 queued (Favored hit)`);
  },

  /**
   * Pre-roll damage handler: inject Sneak Attack d4s into damage formula.
   * Called from the rollDamage dispatcher.
   */
  onPreRollDamage(ctx) {
    const sneakData = ctx.item._vceSneakAttack;
    if (!sneakData) return;

    const { diceCount } = sneakData;
    const formula = ctx.item.system.currentDamage || "d6";

    // Save original damage for restore in finally block
    ctx.sneakOrigDamage = ctx.item.system.currentDamage;

    // Inject bonus d4s
    ctx.item.system.currentDamage = `${formula} + ${diceCount}d4`;

    // Stash armor pen for calculateFinalDamage
    _sneakAttackArmorPen = diceCount;

    log("Rogue", `Sneak Attack: +${diceCount}d4 added to ${formula} → ${ctx.item.system.currentDamage}`);
  },

  /**
   * Post-roll damage cleanup: restore formula, clean stashed data, post chat.
   * Called from the rollDamage finally block.
   */
  onPostRollDamage(ctx) {
    const sneakData = ctx.item._vceSneakAttack;
    if (!sneakData) return;

    // Restore original damage formula
    if (ctx.sneakOrigDamage !== undefined) {
      ctx.item.system.currentDamage = ctx.sneakOrigDamage;
    }

    // Post chat notification
    const { diceCount } = sneakData;
    const actorName = ctx.actor.name;
    ChatMessage.create({
      content: `<div class="vagabond-chat-card-v2" data-card-type="sneak-attack">
        <div class="card-body">
          <section class="content-body">
            <div class="card-description" style="text-align:center;">
              <i class="fas fa-crosshairs"></i> <strong>Sneak Attack!</strong><br>
              ${actorName} deals +${diceCount}d4 bonus damage and ignores ${diceCount} Armor.
            </div>
          </section>
        </div>
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor: ctx.actor }),
    });

    // Clean up
    delete ctx.item._vceSneakAttack;

    log("Rogue", `Sneak Attack: cleanup done for ${actorName}`);
  },

  /**
   * calculateFinalDamage handler: reduce armor by sneak attack dice count.
   * Called from the calculateFinalDamage wrapper.
   *
   * @param {Object} ctx - { actor, result, damage }
   *   actor = the TARGET actor (defender)
   *   damage = raw damage before armor
   *   result = damage after armor (from system calculation)
   */
  onCalculateFinalDamage(ctx) {
    if (_sneakAttackArmorPen <= 0) return;

    const armorPen = _sneakAttackArmorPen;
    // Consume — only apply once per damage application
    _sneakAttackArmorPen = 0;

    const targetArmor = ctx.actor.system?.armor ?? 0;
    if (targetArmor <= 0) return;

    // The system already subtracted full armor. We need to add back
    // the penetrated amount (up to the armor value).
    const penAmount = Math.min(armorPen, targetArmor);
    const oldResult = ctx.result;
    ctx.result = Math.min(ctx.damage, ctx.result + penAmount);

    if (ctx.result !== oldResult) {
      log("Rogue", `Sneak Attack: armor pen ${penAmount} on ${ctx.actor.name} (armor ${targetArmor}): ${oldResult} → ${ctx.result}`);
    }
  }
};
