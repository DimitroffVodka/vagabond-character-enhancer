/**
 * Fighter Class Features
 * Registry entries + runtime hooks for all Fighter features.
 */

import { MODULE_ID, log, hasFeature, combineFavor } from "../utils.mjs";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

/**
 * All Fighter class features.
 * Keys are lowercase feature names matching the class compendium's levelFeatures.
 *
 * Status key:
 *   "system"  — Fully handled by mordachai's base system. Module does nothing.
 *   "module"  — Fully handled by this module (managed AE and/or runtime hook).
 *   "partial" — System handles part, module handles the rest. See notes.
 *   "flavor"  — Roleplay/narrative only. Nothing to automate.
 *   "todo"    — Needs implementation. Not yet working.
 */
export const FIGHTER_REGISTRY = {
  // ──────────────────────────────────────────────
  // L1: Fighting Style
  // ──────────────────────────────────────────────
  // RULES: You gain the Situational Awareness Perk and another Perk with the
  // Melee or Ranged Training Prerequisite, ignoring prerequisites for this Perk.
  //
  // STATUS: flavor — Perk grants are manual character creation choices.
  "fighting style": {
    class: "fighter",
    level: 1,
    flag: "fighter_fightingStyle",
    status: "flavor",
    description: "Gain Situational Awareness Perk + another Perk with Melee or Ranged Training Prerequisite (ignoring prereqs)."
  },

  // ──────────────────────────────────────────────
  // L1: Valor
  // ──────────────────────────────────────────────
  // RULES: The roll required for you to Crit on Attack Checks, and Saves to
  // Dodge or Block Attacks is reduced by 1, and is reduced by 1 more when you
  // reach 4th and 8th Levels in this Class.
  //
  // STATUS: system — The base system already includes a "Valor (lvl. 1|4|8)" AE
  // on the Fighter class item with formula-based level scaling:
  //   attackCritBonus: -1 (always), plus (@lvl >= 4) ? -1 : 0, plus (@lvl >= 8) ? -1 : 0
  //   reflexCritBonus: same pattern
  //   endureCritBonus: same pattern
  //
  // DO NOT add a managed AE here — it would double-stack with the system's AE.
  "valor": {
    class: "fighter",
    level: 1,
    flag: "fighter_valor",
    status: "system",
    description: "Crit on Attack Checks and Dodge/Block Saves reduced by 1. Increases to -2 at L4, -3 at L8."
  },

  // ──────────────────────────────────────────────
  // L2: Momentum
  // ──────────────────────────────────────────────
  // RULES: If you pass a Save against an attack, the next attack you make
  // before the end of your next Turn is Favored.
  //
  // STATUS: module
  //
  // MODULE HANDLES:
  //   - Hook on createChatMessage detects successful save cards from fighters.
  //   - Grants a temporary "Momentum" AE (flag carrier, no AE changes).
  //   - onPreRollAttack handler below checks for Momentum AE, applies favor,
  //     and consumes (deletes) the AE after the attack.
  //   - Cleanup hook on updateCombat removes expired Momentum at end of
  //     the fighter's next turn.
  "momentum": {
    class: "fighter",
    level: 2,
    flag: "fighter_momentum",
    status: "module",
    description: "Pass a Save against an attack → next attack before end of next Turn is Favored."
  },

  // ──────────────────────────────────────────────
  // L6: Muster for Battle
  // ──────────────────────────────────────────────
  // RULES: You have two Actions on your first Turn.
  //
  // STATUS: todo — Needs combat start hook to grant extra action on first turn.
  // The system doesn't have an "actions per turn" field, so this may need
  // a chat reminder rather than mechanical enforcement.
  "muster for battle": {
    class: "fighter",
    level: 6,
    flag: "fighter_musterForBattle",
    status: "todo",
    description: "You have two Actions on your first Turn of Combat."
  },

  // ──────────────────────────────────────────────
  // L10: Harrying
  // ──────────────────────────────────────────────
  // RULES: You can attack twice with the Attack Action, rather than just once.
  //
  // STATUS: todo — Similar to Muster, the system doesn't enforce "attacks per
  // action." This may need a chat reminder or UI indicator.
  "harrying": {
    class: "fighter",
    level: 10,
    flag: "fighter_harrying",
    status: "todo",
    description: "Attack twice with the Attack Action instead of once."
  }
};

/* -------------------------------------------- */
/*  Fighter Runtime Hooks                       */
/* -------------------------------------------- */

export const FighterFeatures = {

  registerHooks() {
    // Valor: Handled entirely by the base system's AE on the Fighter class item.
    // No module hooks needed.

    // Momentum: Pass save → next attack favored
    this._registerMomentumHooks();

    log("Fighter","Hooks registered.");
  },

  /* -------------------------------------------- */
  /*  Handler Methods (called from main dispatcher) */
  /* -------------------------------------------- */

  /**
   * Momentum: Consume Momentum AE for attack favor.
   * Called from rollAttack dispatcher.
   */
  onPreRollAttack(ctx) {
    const momentumBuff = ctx.actor.effects?.find(e => e.getFlag(MODULE_ID, "momentumBuff"));
    if (!momentumBuff || ctx.favorHinder === "favor") return;
    ctx.favorHinder = combineFavor(ctx.favorHinder, "favor");
    // Delete the AE (consumed) — fire-and-forget
    momentumBuff.delete().catch(e => console.warn(`${MODULE_ID} | Momentum cleanup failed:`, e));
    log("Fighter", `Momentum: consumed — attack favored for ${ctx.actor.name}`);
  },

  /* -------------------------------------------- */
  /*  Momentum (L2)                                */
  /* -------------------------------------------- */

  /**
   * Momentum: If you pass a Save against an attack, the next attack you make
   * before the end of your next Turn is Favored.
   *
   * Implementation approach:
   *   1. Hook `createChatMessage` to detect successful save cards from fighters.
   *      The system posts save results via VagabondChatCard with type "save-roll"
   *      and outcome "PASS"/"FAIL" in the HTML.
   *   2. On a passed save, create a temporary "Momentum" AE on the fighter that
   *      grants favor. The AE is purely a flag carrier — actual favor application
   *      is done via onPreRollAttack handler (same pattern as Virtuoso Valor).
   *   3. After the fighter's next attack roll, remove the Momentum AE (consumed).
   *   4. Clean up at end of the fighter's next turn if not consumed.
   *
   * Why not use AE changes for favor:
   *   AE overrides on system.favorHinder would bulldoze other favor/hinder sources
   *   (flanking, conditions). The handler approach combines favor correctly.
   */
  _registerMomentumHooks() {
    // Detect successful saves from fighters
    Hooks.on("createChatMessage", (message) => {
      if (!game.user.isGM) return;
      this._checkMomentumTrigger(message);
    });

    // Consume Momentum on next attack
    // This is handled via the onPreRollAttack handler above
    // (dispatched from vagabond-character-enhancer.mjs).

    // Clean up Momentum at end of fighter's next turn
    Hooks.on("updateCombat", (combat, changes) => {
      if (!game.user.isGM) return;
      if (!("turn" in changes) && !("round" in changes)) return;
      this._cleanupExpiredMomentum(combat);
    });
  },

  /**
   * Check if a chat message is a successful save from a fighter with Momentum.
   * If so, grant the Momentum buff AE.
   */
  async _checkMomentumTrigger(message) {
    const content = message.content || "";

    // Look for save-roll cards with PASS outcome
    if (!content.includes('save-roll') || !content.includes('PASS')) return;

    // Get the actor who made the save
    const speakerActorId = message.speaker?.actor;
    if (!speakerActorId) return;

    const actor = game.actors.get(speakerActorId);
    if (!actor || actor.type !== "character") return;

    // Check if this actor has Momentum
    if (!hasFeature(actor, "fighter_momentum")) return;

    // Check if they already have Momentum active (don't stack)
    const existing = actor.effects.find(e => e.getFlag(MODULE_ID, "momentumBuff"));
    if (existing) return;

    // Grant Momentum AE
    const aeData = {
      name: "Momentum",
      icon: "icons/skills/movement/arrow-upward-yellow.webp",
      origin: `Actor.${actor.id}`,
      disabled: false,
      flags: {
        [MODULE_ID]: {
          managed: true,
          momentumBuff: true,
          // Track when it was granted for cleanup (expires end of next turn)
          grantedRound: game.combat?.round ?? 0,
          grantedTurn: game.combat?.turn ?? 0
        }
      },
      changes: []  // Favor applied via onPreRollAttack handler, not AE changes
    };

    await actor.createEmbeddedDocuments("ActiveEffect", [aeData]);
    log("Fighter",`Momentum granted to ${actor.name} after passing save.`);

    // Post a subtle notification
    ChatMessage.create({
      content: `<div class="vagabond-chat-card-v2" data-card-type="momentum">
        <div class="card-body">
          <section class="content-body">
            <div class="card-description" style="text-align:center;">
              <i class="fas fa-bolt"></i> <strong>Momentum!</strong>
              ${actor.name}'s next attack is Favored.
            </div>
          </section>
        </div>
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor }),
    });
  },

  /**
   * Remove expired Momentum AEs when the fighter's own turn ends.
   *
   * Momentum lasts "before the end of your next Turn" — meaning:
   *   1. Fighter passes a save on the enemy's turn (e.g. round 3)
   *   2. Round 4 starts — fighter still has Momentum
   *   3. Fighter's turn begins in round 4 — can use Momentum on their attack
   *   4. Fighter's turn ENDS — Momentum expires if not consumed
   *
   * We detect "fighter's turn just ended" by checking if the PREVIOUS combatant
   * (the one whose turn just finished) is the fighter with Momentum.
   * The `hasActed` flag is set to true when Momentum has survived through
   * at least one of the fighter's own turns.
   */
  async _cleanupExpiredMomentum(combat) {
    // The combatant whose turn just ENDED is the previous turn's combatant.
    // When updateCombat fires with a new turn, the previous combatant's turn is over.
    const prevTurnIndex = combat.turn === 0
      ? combat.combatants.size - 1
      : combat.turn - 1;
    const turnOrder = combat.turns;
    const prevCombatant = turnOrder?.[prevTurnIndex];
    if (!prevCombatant) return;

    const actor = prevCombatant.actor;
    if (!actor || actor.type !== "character") return;

    const momentumAE = actor.effects.find(e => e.getFlag(MODULE_ID, "momentumBuff"));
    if (!momentumAE) return;

    const hasActed = momentumAE.getFlag(MODULE_ID, "hasActed");
    if (hasActed) {
      // Fighter already had a turn with Momentum and didn't use it — expire it
      await momentumAE.delete();
      log("Fighter",`Momentum expired for ${actor.name} (turn ended without using it).`);
    } else {
      // This is the fighter's first turn since Momentum was granted.
      // Mark it as "has acted" — it will expire at end of their NEXT turn
      // (but per the rules, "before the end of your next Turn" means this turn).
      // So actually, this IS the turn it should expire on. Mark and expire.
      //
      // Wait — re-reading: "the next attack you make before the end of your
      // next Turn is Favored." The fighter gets ONE turn to use it. If their
      // turn just ended and they didn't attack, it's gone.
      await momentumAE.delete();
      log("Fighter",`Momentum expired for ${actor.name} (their turn ended).`);
    }
  },

  /**
   * Called from onPreRollAttack handler.
   * If the actor has Momentum, returns true and deletes the AE (consumed).
   */
  async consumeMomentum(actor) {
    const momentumAE = actor.effects.find(e => e.getFlag(MODULE_ID, "momentumBuff"));
    if (!momentumAE) return false;

    await momentumAE.delete();
    log("Fighter",`Momentum consumed by ${actor.name} on attack.`);
    return true;
  }
};
