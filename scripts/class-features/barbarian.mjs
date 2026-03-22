/**
 * Barbarian Class Features
 * Registry entries + runtime hooks for all Barbarian features.
 */

import { MODULE_ID } from "../vagabond-character-enhancer.mjs";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

/**
 * All Barbarian class features.
 * Keys are lowercase feature names matching the class compendium's levelFeatures.
 * Features with `effects` get automatic managed Active Effects.
 * Features without `effects` need runtime hooks (below).
 */
export const BARBARIAN_REGISTRY = {
  // L1: Rage
  // While Berserk and wearing Light Armor or no Armor, you reduce damage you take
  // by 1 per damage die, and your attack damage dice are one size larger and can explode.
  // Further, you can go Berserk after you take damage or as part of making an attack.
  // You remain Berserk this way for 1 minute, unless you end it (no Action) or go Unconscious.
  //
  // Implementation notes:
  // - DR per die: PERMANENT managed AE on incomingDamageReductionPerDie.
  //   The system already gates this behind berserk status check (damage-helper.mjs:1180).
  // - Exploding: PERMANENT managed AE using formula "(@statuses.berserk) ? 1 : 0"
  //   so it only activates while Berserk.
  // - Die upsizing: Runtime hook on renderChatMessage (modifies button formula).
  // - Auto-Berserk: Runtime hook on attack/damage to apply Berserk status.
  // - Berserk status itself grants: no Cast, no Focus, no Frightened, no Morale (system config).
  "rage": {
    class: "barbarian",
    level: 1,
    flag: "barbarian_rage",
    description: "While Berserk + light/no armor: damage dice upsized, can explode, reduce incoming damage by 1 per die. Can go Berserk after taking damage or as part of an attack.",
    effects: [
      {
        label: "Rage",
        icon: "icons/skills/melee/hand-grip-sword-red.webp",
        changes: [
          // DR 1 per die — system gates behind berserk + light armor check
          { key: "system.incomingDamageReductionPerDie", mode: 2, value: "1" },
          // Exploding — only active while Berserk (formula evaluates to 0 or 1)
          { key: "system.bonuses.globalExplode", mode: 2, value: "(@statuses.berserk) ? 1 : 0" }
        ]
      }
    ]
  },

  // L1: Wrath
  // You gain the Interceptor Perk, and can make its attack against an Enemy that
  // makes a Ranged Attack, Casts, or that damages you or an Ally.
  // Grants Perk: Interceptor — Once per Round, attack a Close Enemy that begins to Move out of your reach (Off-Turn).
  "wrath": {
    class: "barbarian",
    level: 1,
    flag: "barbarian_wrath",
    description: "Gain the Interceptor Perk. Can make its attack against Enemies that make Ranged Attacks, Cast, or damage you or an Ally."
  },

  // L2: Aggressor
  // You have a 10 foot bonus to Speed during the first Round of Combat, and having
  // 3 or more Fatigue doesn't prevent you from taking the Rush Action.
  "aggressor": {
    class: "barbarian",
    level: 2,
    flag: "barbarian_aggressor",
    description: "+10 Speed during first Round of Combat. 3+ Fatigue doesn't prevent Rush Action."
  },

  // L4: Fearmonger
  // When you kill an Enemy, every Near Enemy with HD lower than your Level becomes
  // Frightened until the end of your next Turn.
  "fearmonger": {
    class: "barbarian",
    level: 4,
    flag: "barbarian_fearmonger",
    description: "When you kill an Enemy, every Near Enemy with HD lower than your Level becomes Frightened until end of your next Turn."
  },

  // L6: Mindless Rancor
  // You can't be Charmed, Confused, or compelled to act against your will.
  "mindless rancor": {
    class: "barbarian",
    level: 6,
    flag: "barbarian_mindlessRancor",
    description: "You can't be Charmed, Confused, or compelled to act against your will.",
    effects: [
      {
        label: "Mindless Rancor",
        icon: "icons/skills/social/intimidation-impressing.webp",
        changes: [
          { key: "system.statusImmunities", mode: 2, value: "charmed" },
          { key: "system.statusImmunities", mode: 2, value: "confused" }
        ]
      }
    ]
  },

  // L8: Bloodthirsty
  // Your attacks against Beings that are missing any HP are Favored, and you can
  // sense them within Far as if by Blindsight.
  "bloodthirsty": {
    class: "barbarian",
    level: 8,
    flag: "barbarian_bloodthirsty",
    description: "Attacks against Beings missing any HP are Favored. Sense them within Far as Blindsight."
  },

  // L10: Rip and Tear
  // While Berserk, you reduce damage you take by 2 per damage die, rather than 1,
  // and you gain a +1 bonus to each die of damage you deal.
  //
  // Implementation notes:
  // - Adds +1 more DR per die (stacks with Rage's 1 = total 2)
  // - Adds +1 bonus to each damage die dealt (universalDamageBonus, gated by berserk formula)
  "rip and tear": {
    class: "barbarian",
    level: 10,
    flag: "barbarian_ripAndTear",
    description: "Upgrades Rage: reduce damage by 2 per die instead of 1, +1 bonus to each damage die.",
    effects: [
      {
        label: "Rip and Tear",
        icon: "icons/skills/melee/strike-slash-blade-red.webp",
        changes: [
          // +1 more DR per die (stacks with Rage's 1 for total 2)
          { key: "system.incomingDamageReductionPerDie", mode: 2, value: "1" },
          // +1 bonus per damage die, only while Berserk
          { key: "system.universalDamageBonus", mode: 2, value: "(@statuses.berserk) ? 1 : 0" }
        ]
      }
    ]
  }
};

/* -------------------------------------------- */
/*  Constants                                   */
/* -------------------------------------------- */

const DIE_UPSIZE_MAP = {
  4: 6,
  6: 8,
  8: 10,
  10: 12,
  12: 12 // d12 stays d12
};

/* -------------------------------------------- */
/*  Barbarian Runtime Hooks                     */
/* -------------------------------------------- */

export const BarbarianFeatures = {
  /**
   * Register all Barbarian runtime hooks.
   */
  registerHooks() {
    this._registerRageHooks();
    this._registerAggressorHooks();
    this._registerFearmongerHooks();
    this._registerBloodthirstyHooks();

    this._log("Barbarian hooks registered.");
  },

  _log(...args) {
    if (game.settings.get(MODULE_ID, "debugMode")) {
      console.log(`${MODULE_ID} | Barbarian |`, ...args);
    }
  },

  /**
   * Check if an actor has a specific feature flag.
   */
  _hasFeature(actor, flag) {
    const features = actor?.getFlag(MODULE_ID, "features");
    return features?.[flag] ?? false;
  },

  /**
   * Check if actor is wearing light or no armor.
   */
  _isLightOrNoArmor(actor) {
    const equippedArmor = actor.items.filter(
      i => i.type === "equipment" &&
           i.system.equipmentType === "armor" &&
           i.system.equipped
    );
    if (equippedArmor.length === 0) return true;
    return equippedArmor.every(a => {
      const armorType = a.system.armorType?.toLowerCase() ?? "";
      return armorType === "light" || armorType === "";
    });
  },

  /**
   * Check if actor has the Berserk status active.
   */
  _isBerserk(actor) {
    return actor.statuses?.has("berserk") ?? false;
  },

  /* -------------------------------------------- */
  /*  Rage: Auto-Berserk + Die Upsizing + Cleanup */
  /* -------------------------------------------- */

  /**
   * Rage implementation:
   *
   * PERMANENT effects (from registry, created by FeatureDetector):
   * - incomingDamageReductionPerDie = 1 (system gates behind berserk + light armor)
   * - globalExplode = (@statuses.berserk) ? 1 : 0 (only active while Berserk)
   * - Rip and Tear adds +1 more DR and +1 universalDamageBonus (also berserk-gated)
   *
   * RUNTIME hooks (below):
   * 1. Auto-apply Berserk on attack or taking damage
   * 2. Die upsizing on damage buttons (renderChatMessage)
   * 3. Remove Berserk when combat ends
   */
  _registerRageHooks() {
    // --- Auto-apply Berserk when attacking ---
    // "you can go Berserk as part of making an attack"
    // Fires when attack chat card appears with a damage button
    Hooks.on("renderChatMessage", async (message, html) => {
      if (!game.user.isGM) return;
      const actorId = message.speaker?.actor;
      if (!actorId) return;
      const actor = game.actors.get(actorId);
      if (!actor || actor.type !== "character") return;
      if (!this._hasFeature(actor, "barbarian_rage")) return;
      if (this._isBerserk(actor)) return;
      if (!this._isLightOrNoArmor(actor)) return;

      const el = html instanceof jQuery ? html[0] : html;
      if (!el.querySelector(".vagabond-damage-button")) return;

      this._log(`Rage: ${actor.name} attacking — auto-applying Berserk`);
      await actor.toggleStatusEffect("berserk", { active: true });
    });

    // --- Auto-apply Berserk when taking damage ---
    // "you can go Berserk after you take damage"
    Hooks.on("updateActor", async (actor, changes) => {
      if (!game.user.isGM) return;
      if (actor.type !== "character") return;
      if (!this._hasFeature(actor, "barbarian_rage")) return;
      if (this._isBerserk(actor)) return;
      if (!this._isLightOrNoArmor(actor)) return;

      const newHP = changes.system?.health?.value;
      if (newHP === undefined) return;

      // HP decreased = took damage
      const oldHP = actor.system.health?.value ?? actor.system.health?.max ?? 0;
      if (newHP < oldHP) {
        this._log(`Rage: ${actor.name} took damage — auto-applying Berserk`);
        await actor.toggleStatusEffect("berserk", { active: true });
      }
    });

    // --- Die upsizing on damage buttons ---
    // Modifies data-damage-formula on buttons before the user clicks them.
    // Only fires while Berserk + light/no armor.
    Hooks.on("renderChatMessage", (message, html) => {
      const actorId = message.speaker?.actor;
      if (!actorId) return;
      const actor = game.actors.get(actorId);
      if (!actor) return;

      if (!this._hasFeature(actor, "barbarian_rage") ||
          !this._isBerserk(actor) ||
          !this._isLightOrNoArmor(actor)) return;

      const el = html instanceof jQuery ? html[0] : html;
      const damageButtons = el.querySelectorAll("[data-damage-formula]");
      if (damageButtons.length === 0) return;

      for (const button of damageButtons) {
        const formula = button.dataset.damageFormula;
        if (!formula) continue;
        const upsized = this._upsizeDice(formula);
        if (upsized !== formula) {
          button.dataset.damageFormula = upsized;
          this._log(`Rage: Upsized formula "${formula}" → "${upsized}"`);
        }
      }

      // Add visual indicator
      const header = el.querySelector(".vagabond-card-header, .card-header");
      if (header && !header.querySelector(".vce-rage-tag")) {
        const rageTag = document.createElement("span");
        rageTag.className = "vce-rage-tag";
        rageTag.textContent = "RAGE";
        header.appendChild(rageTag);
      }
    });

    // --- Remove Berserk when combat ends ---
    // "You remain Berserk this way for 1 minute, unless you end it or go Unconscious."
    // In practice, Berserk should end when combat ends.
    Hooks.on("deleteCombat", async (combat) => {
      if (!game.user.isGM) return;
      for (const combatant of combat.combatants) {
        const actor = combatant.actor;
        if (!actor || actor.type !== "character") continue;
        if (!this._hasFeature(actor, "barbarian_rage")) continue;
        if (!this._isBerserk(actor)) continue;

        this._log(`Rage: Combat ended — removing Berserk from ${actor.name}`);
        await actor.toggleStatusEffect("berserk", { active: false });
      }
    });
  },

  /**
   * Upsize all dice in a formula string.
   * d4 → d6 → d8 → d10 → d12
   */
  _upsizeDice(formula) {
    return formula.replace(/(\d+)d(\d+)/gi, (match, count, size) => {
      const numSize = parseInt(size);
      const newSize = DIE_UPSIZE_MAP[numSize] ?? numSize;
      return `${count}d${newSize}`;
    });
  },

  /* -------------------------------------------- */
  /*  Aggressor: +10 Speed First Round            */
  /* -------------------------------------------- */

  _registerAggressorHooks() {
    // Apply speed bonus at combat start
    Hooks.on("updateCombat", async (combat, changes) => {
      if (!game.user.isGM) return;
      if (changes.round !== 1 || combat.previous?.round !== 0) return;

      // Combat just started (round 0 → 1)
      for (const combatant of combat.combatants) {
        const actor = combatant.actor;
        if (!actor || actor.type !== "character") continue;
        if (!this._hasFeature(actor, "barbarian_aggressor")) continue;

        this._log(`Aggressor: Applying +10 speed to ${actor.name}`);
        await this._applyAggressorEffect(actor);
      }
    });

    // Remove speed bonus after the barbarian's first turn
    Hooks.on("updateCombat", async (combat, changes) => {
      if (!game.user.isGM) return;
      if (!("turn" in changes)) return;

      // Check if the combatant who just finished their turn has Aggressor
      const prevCombatant = combat.combatants.contents[combat.previous?.turn];
      if (!prevCombatant?.actor) return;

      const actor = prevCombatant.actor;
      if (combat.round === 1 && this._hasFeature(actor, "barbarian_aggressor")) {
        await this._removeAggressorEffect(actor);
        this._log(`Aggressor: Removed +10 speed from ${actor.name}`);
      }
    });
  },

  async _applyAggressorEffect(actor) {
    const existing = actor.effects.find(e => e.getFlag(MODULE_ID, "aggressor"));
    if (existing) return;

    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: "Aggressor",
      icon: "icons/svg/wing.svg",
      origin: `${MODULE_ID}.barbarian.aggressor`,
      flags: { [MODULE_ID]: { managed: true, aggressor: true } },
      changes: [
        { key: "system.speed.bonus", mode: 2, value: "10" }
      ],
      duration: { rounds: 1 },
      disabled: false,
      transfer: true
    }]);
  },

  async _removeAggressorEffect(actor) {
    const effect = actor.effects.find(e => e.getFlag(MODULE_ID, "aggressor"));
    if (effect) {
      await effect.delete();
    }
  },

  /* -------------------------------------------- */
  /*  Fearmonger: Frighten Weaker Enemies on Kill */
  /* -------------------------------------------- */

  _registerFearmongerHooks() {
    Hooks.on("updateActor", async (actor, changes) => {
      if (!game.user.isGM) return;
      if (actor.type !== "npc") return;

      // Check if NPC just hit 0 HP
      const newHP = changes.system?.health?.value;
      if (newHP !== undefined && newHP <= 0) {
        // Find the last attacker — check if they have Fearmonger
        await this._checkFearmonger(actor);
      }
    });
  },

  async _checkFearmonger(defeatedNpc) {
    if (!game.combat) return;

    const defeatedTL = defeatedNpc.system.threatLevel?.value ?? 0;

    // Find characters in combat with Fearmonger
    for (const combatant of game.combat.combatants) {
      const actor = combatant.actor;
      if (!actor || actor.type !== "character") continue;
      if (!this._hasFeature(actor, "barbarian_fearmonger")) continue;

      this._log(`Fearmonger: ${actor.name} killed an NPC, checking for weaker enemies`);

      // Find the barbarian's token
      const barbarianToken = combatant.token?.object;
      if (!barbarianToken) continue;

      // Find nearby weaker NPCs
      for (const otherCombatant of game.combat.combatants) {
        const npc = otherCombatant.actor;
        if (!npc || npc.type !== "npc" || npc.id === defeatedNpc.id) continue;
        if ((npc.system.health?.value ?? 0) <= 0) continue;

        const npcTL = npc.system.threatLevel?.value ?? 0;
        if (npcTL >= defeatedTL) continue; // Must be weaker

        // Check distance (within 30 ft)
        const npcToken = otherCombatant.token?.object;
        if (!npcToken || !barbarianToken) continue;

        const distance = canvas.grid.measurePath([barbarianToken.center, npcToken.center]).distance;
        if (distance > 30) continue;

        // Check immunity
        if (npc.system.statusImmunities?.includes("frightened")) continue;

        // Apply Frightened
        this._log(`Fearmonger: Applying Frightened to ${npc.name}`);
        await npc.toggleStatusEffect("frightened", { active: true });
      }
    }
  },

  /* -------------------------------------------- */
  /*  Bloodthirsty: Favor vs Wounded Targets      */
  /* -------------------------------------------- */

  _registerBloodthirstyHooks() {
    // TODO: Wrap roll builder via libWrapper to add Favor when target HP < max
    Hooks.once("ready", () => {
      this._log("Bloodthirsty: TODO — wrap roll builder to add Favor vs wounded targets");
    });
  }
};
