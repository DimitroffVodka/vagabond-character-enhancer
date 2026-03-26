/**
 * Gunslinger Class Features
 * Registry entries + runtime hooks for all Gunslinger features.
 *
 * ARCHITECTURE OVERVIEW
 * ─────────────────────
 * Deadeye is the core mechanic. It tracks a cascading crit threshold that
 * lowers by 1 (min 17) after each passed Ranged Check. Most other features
 * key off Deadeye state or ranged crits:
 *
 *   Deadeye (L1)  → tracks stacks via actor flag, modifies rangedCritBonus
 *   Grit (L4)     → ranged crit → damage dice explode
 *   Devastator (L6) → kill enemy → set Deadeye to max stacks (3)
 *   Bad Medicine (L8) → ranged crit → extra damage die
 *   High Noon (L10) → ranged crit → extra attack notification
 *   Quick Draw (L1) → combat start → free ranged attack (hindered if 2H)
 *
 * The monkey-patch on rollAttack (in vagabond-character-enhancer.mjs) handles:
 *   - Reading Deadeye stacks → applying rangedCritBonus
 *   - After a hit → incrementing stacks
 *   - After a miss → NOT resetting (resets at end of turn only)
 *   - On crit → signaling for Grit/Bad Medicine/High Noon
 *
 * The hooks in this file handle:
 *   - Turn-end reset of Deadeye stacks (updateCombat hook)
 *   - Devastator kill detection (updateActor hook on HP→0)
 *   - Quick Draw pre-combat attack (createCombat hook)
 *   - High Noon extra attack notification (chat card)
 */

import { MODULE_ID } from "../vagabond-character-enhancer.mjs";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

export const GUNSLINGER_REGISTRY = {
  // ──────────────────────────────────────────────
  // L1: Quick Draw
  // ──────────────────────────────────────────────
  // RULES: You gain the Marksmanship Perk. When combat occurs, you can make
  // one Ranged attack before the first Turn, Hindered if 2H Weapon.
  //
  // STATUS: module
  // MODULE HANDLES: createCombat hook posts a reminder chat card with
  // the gunslinger's ranged weapons listed. The actual attack is made by
  // the player clicking the weapon — we just remind them and note hinder.
  "quick draw": {
    class: "gunslinger", level: 1, flag: "gunslinger_quickDraw", status: "module",
    description: "Gain Marksmanship Perk. Make one Ranged attack before first Turn (Hindered if 2H)."
  },

  // ──────────────────────────────────────────────
  // L1: Deadeye
  // ──────────────────────────────────────────────
  // RULES: After you pass a Ranged Check, you Crit on subsequent Ranged
  // attacks on a d20 roll 1 lower, but no lower than 17. Resets to 0 at
  // end of your Turn if you didn't pass a Ranged Check since your last Turn.
  //
  // STATUS: module
  // MODULE HANDLES:
  //   - Actor flag: deadeye.stacks (0-3), deadeye.hitThisTurn (boolean)
  //   - Monkey-patch on rollAttack reads stacks, applies as rangedCritBonus
  //   - After passing ranged check, increments stacks (max 3 = crit on 17)
  //   - updateCombat hook resets stacks if hitThisTurn is false
  "deadeye": {
    class: "gunslinger", level: 1, flag: "gunslinger_deadeye", status: "module",
    description: "Each passed Ranged Check lowers crit by 1 (min 17). Resets end of Turn if no hit."
  },

  // ──────────────────────────────────────────────
  // L2: Skeet Shooter
  // ──────────────────────────────────────────────
  // RULES: Once per Round, make Off-Turn Ranged attack to reduce projectile damage.
  // STATUS: flavor — Reaction attack is a player decision, no automation needed.
  "skeet shooter": {
    class: "gunslinger", level: 2, flag: "gunslinger_skeetShooter", status: "flavor",
    description: "Once per Round, make Off-Turn Ranged attack to reduce incoming projectile damage."
  },

  // ──────────────────────────────────────────────
  // L4: Grit
  // ──────────────────────────────────────────────
  // RULES: When you Crit on a Ranged attack, the damage dice can explode.
  //
  // STATUS: module
  // MODULE HANDLES: Monkey-patch on rollDamage checks for ranged crit +
  // gunslinger_grit → temporarily enables exploding on the weapon item
  // before the damage roll, then restores the original state.
  "grit": {
    class: "gunslinger", level: 4, flag: "gunslinger_grit", status: "module",
    description: "When you Crit on Ranged attack, damage dice can explode."
  },

  // ──────────────────────────────────────────────
  // L6: Devastator
  // ──────────────────────────────────────────────
  // RULES: When you reduce an Enemy to 0 HP, the Deadeye crit roll is
  // immediately set to 17 (max stacks = 3).
  //
  // STATUS: module
  // MODULE HANDLES: updateActor hook detects HP→0 on NPCs. Checks if
  // the last attacker was a gunslinger with Devastator via combat tracking.
  "devastator": {
    class: "gunslinger", level: 6, flag: "gunslinger_devastator", status: "module",
    description: "Reduce an Enemy to 0 HP → Deadeye crit immediately set to 17."
  },

  // ──────────────────────────────────────────────
  // L8: Bad Medicine
  // ──────────────────────────────────────────────
  // RULES: You deal an extra die of damage when you Crit with a Ranged Check.
  //
  // STATUS: module
  // MODULE HANDLES: Monkey-patch on rollDamage detects ranged crit +
  // gunslinger_badMedicine → adds an extra die matching the weapon's
  // base die size to the damage formula before rolling.
  "bad medicine": {
    class: "gunslinger", level: 8, flag: "gunslinger_badMedicine", status: "module",
    description: "Extra die of damage when you Crit with a Ranged Check."
  },

  // ──────────────────────────────────────────────
  // L10: High Noon
  // ──────────────────────────────────────────────
  // RULES: Once per Turn, if you Crit on a Ranged Check, you can make
  // one additional attack.
  //
  // STATUS: module
  // MODULE HANDLES: After ranged crit, posts a chat notification
  // "You may make one additional attack." The system doesn't enforce
  // attacks-per-turn, so this is a reminder. Tracks "used this turn"
  // via flag to enforce "once per Turn."
  "high noon": {
    class: "gunslinger", level: 10, flag: "gunslinger_highNoon", status: "module",
    description: "Once per Turn, Crit on Ranged → make one additional attack."
  }
};

/* -------------------------------------------- */
/*  Gunslinger Runtime Hooks                    */
/* -------------------------------------------- */

export const GunslingerFeatures = {
  _log(...args) {
    if (game.settings.get(MODULE_ID, "debugMode")) {
      console.log(`${MODULE_ID} | Gunslinger |`, ...args);
    }
  },

  _hasFeature(actor, flag) {
    return actor.getFlag(MODULE_ID, `features.${flag}`);
  },

  registerHooks() {
    this._registerDeadeyeHooks();
    this._registerDevastatorHooks();
    this._registerQuickDrawHooks();
    this._log("Hooks registered.");
  },

  /* -------------------------------------------- */
  /*  Deadeye: Cascading Crit Tracker             */
  /* -------------------------------------------- */

  /**
   * Get the current Deadeye stacks for an actor.
   * Stacks range from 0 (no bonus) to 3 (crit on 17).
   */
  getDeadeyeStacks(actor) {
    return actor.getFlag(MODULE_ID, "deadeye.stacks") ?? 0;
  },

  /**
   * Increment Deadeye stacks after a passed Ranged Check.
   * Called from the rollAttack monkey-patch after a hit.
   * Max 3 stacks (crit threshold 17 = base 20 - 3).
   */
  async incrementDeadeye(actor) {
    const current = this.getDeadeyeStacks(actor);
    if (current >= 3) return; // Already at max

    const newStacks = current + 1;
    await actor.setFlag(MODULE_ID, "deadeye.stacks", newStacks);
    await actor.setFlag(MODULE_ID, "deadeye.hitThisTurn", true);

    this._log(`Deadeye: ${actor.name} stacks ${current} → ${newStacks} (crit on ${20 - newStacks})`);

    // Post subtle notification
    if (newStacks > 0) {
      ChatMessage.create({
        content: `<div class="vagabond-chat-card-v2" data-card-type="deadeye">
          <div class="card-body">
            <section class="content-body">
              <div class="card-description" style="text-align:center;">
                <i class="fas fa-crosshairs"></i> <strong>Deadeye!</strong>
                ${actor.name} now crits on <strong>${20 - newStacks}+</strong>
                for Ranged attacks.
              </div>
            </section>
          </div>
        </div>`,
        speaker: ChatMessage.getSpeaker({ actor }),
      });
    }
  },

  /**
   * Set Deadeye stacks to max (3) — used by Devastator on kill.
   */
  async setDeadeyeMax(actor) {
    await actor.setFlag(MODULE_ID, "deadeye.stacks", 3);
    await actor.setFlag(MODULE_ID, "deadeye.hitThisTurn", true);

    this._log(`Devastator: ${actor.name} Deadeye set to max (crit on 17)`);

    ChatMessage.create({
      content: `<div class="vagabond-chat-card-v2" data-card-type="devastator">
        <div class="card-body">
          <section class="content-body">
            <div class="card-description" style="text-align:center;">
              <i class="fas fa-skull-crossbones"></i> <strong>Devastator!</strong>
              ${actor.name} eliminates a target — Deadeye crit set to <strong>17+</strong>!
            </div>
          </section>
        </div>
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor }),
    });
  },

  /**
   * Reset Deadeye stacks at end of turn if no hit was made.
   */
  _registerDeadeyeHooks() {
    // Reset Deadeye at end of gunslinger's turn
    Hooks.on("updateCombat", async (combat, changes) => {
      if (!game.user.isGM) return;
      if (!("turn" in changes) && !("round" in changes)) return;

      // The combatant whose turn just ENDED is the previous one
      const turnOrder = combat.turns;
      const prevTurnIndex = combat.turn === 0
        ? turnOrder.length - 1
        : combat.turn - 1;
      const prevCombatant = turnOrder?.[prevTurnIndex];
      if (!prevCombatant?.actor) return;

      const actor = prevCombatant.actor;
      if (actor.type !== "character") return;
      if (!this._hasFeature(actor, "gunslinger_deadeye")) return;

      const hitThisTurn = actor.getFlag(MODULE_ID, "deadeye.hitThisTurn");
      const currentStacks = this.getDeadeyeStacks(actor);

      if (!hitThisTurn && currentStacks > 0) {
        // No ranged hit this turn — reset Deadeye
        await actor.setFlag(MODULE_ID, "deadeye.stacks", 0);
        this._log(`Deadeye reset for ${actor.name} (no ranged hit this turn).`);

        ChatMessage.create({
          content: `<div class="vagabond-chat-card-v2" data-card-type="deadeye-reset">
            <div class="card-body">
              <section class="content-body">
                <div class="card-description" style="text-align:center;opacity:0.7;">
                  <i class="fas fa-crosshairs"></i> <em>Deadeye reset for ${actor.name}.</em>
                </div>
              </section>
            </div>
          </div>`,
          speaker: ChatMessage.getSpeaker({ actor }),
        });
      }

      // Always reset hitThisTurn flag for the new turn
      await actor.setFlag(MODULE_ID, "deadeye.hitThisTurn", false);
      // Reset High Noon used flag
      await actor.unsetFlag(MODULE_ID, "highNoonUsed");
    });
  },

  /* -------------------------------------------- */
  /*  Devastator: Kill → Max Deadeye              */
  /* -------------------------------------------- */

  /**
   * Detect when an NPC is reduced to 0 HP and check if the last attacker
   * was a gunslinger with Devastator.
   *
   * We track "last ranged attacker" via a module-level variable set in the
   * rollAttack monkey-patch. This is simpler than parsing chat history.
   */
  _registerDevastatorHooks() {
    Hooks.on("updateActor", async (actor, changes) => {
      if (!game.user.isGM) return;
      if (actor.type !== "npc") return;

      // Check if HP went to 0
      const newHP = changes.system?.health?.value;
      if (newHP === undefined || newHP > 0) return;

      // Check the last ranged attacker (set by rollAttack monkey-patch)
      const lastAttacker = GunslingerFeatures._lastRangedAttacker;
      if (!lastAttacker) return;

      const attackerActor = game.actors.get(lastAttacker);
      if (!attackerActor) return;
      if (!this._hasFeature(attackerActor, "gunslinger_devastator")) return;

      await this.setDeadeyeMax(attackerActor);
    });
  },

  /* -------------------------------------------- */
  /*  Quick Draw: Pre-Combat Ranged Attack         */
  /* -------------------------------------------- */

  _registerQuickDrawHooks() {
    Hooks.on("createCombat", async (combat) => {
      if (!game.user.isGM) return;

      // Find gunslingers in combat
      for (const combatant of combat.combatants) {
        const actor = combatant.actor;
        if (!actor || actor.type !== "character") continue;
        if (!this._hasFeature(actor, "gunslinger_quickDraw")) continue;

        // Find ranged weapons
        const rangedWeapons = actor.items.filter(i => {
          if (i.type !== "equipment") return false;
          if (i.system.equipmentType !== "weapon") return false;
          if (!i.system.equipped) return false;
          return i.system.weaponSkill === "ranged";
        });

        if (rangedWeapons.length === 0) continue;

        // Post Quick Draw reminder with weapon info
        const weaponList = rangedWeapons.map(w => {
          const is2H = w.system.grip === "2H";
          const hinderNote = is2H ? ' <span style="color:#c44;">(Hindered — 2H)</span>' : "";
          return `<strong>${w.name}</strong>${hinderNote}`;
        }).join(", ");

        ChatMessage.create({
          content: `<div class="vagabond-chat-card-v2" data-card-type="quick-draw">
            <div class="card-body">
              <header class="card-header">
                <div class="header-icon">
                  <img src="icons/weapons/guns/gun-pistol-flintlock-black.webp" alt="Quick Draw">
                </div>
                <div class="header-info">
                  <h3 class="header-title">Quick Draw!</h3>
                  <div class="metadata-tags-row">
                    <div class="meta-tag tag-skill"><span>Free Ranged Attack</span></div>
                  </div>
                </div>
              </header>
              <section class="content-body">
                <div class="card-description">
                  ${actor.name} can make a free Ranged attack before the first Turn!<br>
                  Available: ${weaponList}
                </div>
              </section>
            </div>
          </div>`,
          speaker: ChatMessage.getSpeaker({ actor }),
        });
      }
    });
  },

  /* -------------------------------------------- */
  /*  High Noon: Extra Attack Notification         */
  /* -------------------------------------------- */

  /**
   * Post a High Noon notification after a ranged crit.
   * Called from the rollAttack monkey-patch.
   */
  async notifyHighNoon(actor) {
    // Check if already used this turn
    const used = actor.getFlag(MODULE_ID, "highNoonUsed");
    if (used) return;

    await actor.setFlag(MODULE_ID, "highNoonUsed", true);

    ChatMessage.create({
      content: `<div class="vagabond-chat-card-v2" data-card-type="high-noon">
        <div class="card-body">
          <section class="content-body">
            <div class="card-description" style="text-align:center;">
              <i class="fas fa-sun"></i> <strong>High Noon!</strong>
              ${actor.name} may make one additional Ranged attack!
            </div>
          </section>
        </div>
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor }),
    });

    this._log(`High Noon triggered for ${actor.name}`);
  },

  /* -------------------------------------------- */
  /*  Statics for monkey-patch communication       */
  /* -------------------------------------------- */

  /**
   * Set by the rollAttack monkey-patch when a ranged attack is made.
   * Read by the Devastator hook to identify who killed an NPC.
   * @type {string|null} Actor ID of the last ranged attacker
   */
  _lastRangedAttacker: null,
};
