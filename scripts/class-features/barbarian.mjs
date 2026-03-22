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
  "rage": {
    class: "barbarian",
    level: 1,
    flag: "barbarian_rage",
    description: "While Berserk + light/no armor: damage dice upsized, can explode, reduce incoming damage by 1 per die. Can go Berserk after taking damage or as part of an attack."
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
        icon: "icons/svg/terror.svg",
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
  "rip and tear": {
    class: "barbarian",
    level: 10,
    flag: "barbarian_ripAndTear",
    description: "Upgrades Rage: reduce damage by 2 per die instead of 1, +1 bonus to each damage die. Handled by Rage runtime hook."
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
  /*  Rage: Die Upsizing + Exploding + DR         */
  /* -------------------------------------------- */

  /**
   * Rage has three parts:
   * 1. Die upsizing on attacks (libWrapper, runs per-roll)
   * 2. Exploding dice (temporary AE on globalExplode, toggled with Berserk)
   * 3. Damage reduction of 1 per die (temporary AE on incomingDamageReductionPerDie)
   *
   * Parts 2 & 3 are managed via createActiveEffect/deleteActiveEffect hooks
   * that watch for the Berserk status being toggled.
   */
  _registerRageHooks() {
    // --- Part 1: Die upsizing via libWrapper (per-roll) ---
    Hooks.once("ready", () => {
      libWrapper.register(MODULE_ID, "game.vagabond.VagabondDamageHelper.rollDamage", function (wrapped, ...args) {
        const [item, actor, options = {}] = args;

        // Check for Rage conditions
        if (actor && BarbarianFeatures._hasFeature(actor, "barbarian_rage") &&
            BarbarianFeatures._isBerserk(actor) &&
            BarbarianFeatures._isLightOrNoArmor(actor)) {

          BarbarianFeatures._log(`Rage active for ${actor.name} — upsizing dice`);

          // Modify the damage formula by upsizing dice
          if (options.formula) {
            options.formula = BarbarianFeatures._upsizeDice(options.formula);
          }
        }

        return wrapped(...args);
      }, "WRAPPER");

      this._log("Rage libWrapper registered on VagabondDamageHelper.rollDamage");
    });

    // --- Parts 2 & 3: Berserk status toggle → create/remove Rage AE ---

    // When Berserk is applied
    Hooks.on("createActiveEffect", async (effect, options, userId) => {
      if (!game.user.isGM) return;
      if (!effect.statuses?.has("berserk")) return;

      const actor = effect.parent;
      if (!actor || actor.type !== "character") return;
      if (!this._hasFeature(actor, "barbarian_rage")) return;
      if (!this._isLightOrNoArmor(actor)) return;

      this._log(`Rage: Berserk applied to ${actor.name} — creating Rage effects`);
      await this._applyRageEffects(actor);
    });

    // When Berserk is removed
    Hooks.on("deleteActiveEffect", async (effect, options, userId) => {
      if (!game.user.isGM) return;
      if (!effect.statuses?.has("berserk")) return;

      const actor = effect.parent;
      if (!actor || actor.type !== "character") return;

      this._log(`Rage: Berserk removed from ${actor.name} — removing Rage effects`);
      await this._removeRageEffects(actor);
    });
  },

  /**
   * Create the Rage AE with exploding dice + damage reduction.
   * This is a temporary effect that only exists while Berserk.
   */
  async _applyRageEffects(actor) {
    // Don't create duplicates
    const existing = actor.effects.find(e => e.getFlag(MODULE_ID, "rage"));
    if (existing) return;

    // Determine damage reduction amount (1 base, 2 with Rip and Tear)
    const hasRipAndTear = this._hasFeature(actor, "barbarian_ripAndTear");
    const reductionPerDie = hasRipAndTear ? 2 : 1;

    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: hasRipAndTear ? "Rage (Rip and Tear)" : "Rage",
      icon: "icons/svg/terror.svg",
      origin: `${MODULE_ID}.barbarian.rage`,
      flags: { [MODULE_ID]: { managed: true, rage: true } },
      changes: [
        { key: "system.bonuses.globalExplode", mode: 2, value: "1" },
        { key: "system.incomingDamageReductionPerDie", mode: 2, value: String(reductionPerDie) }
      ],
      disabled: false,
      transfer: true
    }]);

    this._log(`Rage AE created: exploding + DR ${reductionPerDie}/die`);
  },

  /**
   * Remove the Rage AE when Berserk ends.
   */
  async _removeRageEffects(actor) {
    const rageEffect = actor.effects.find(e => e.getFlag(MODULE_ID, "rage"));
    if (rageEffect) {
      await rageEffect.delete();
      this._log(`Rage AE removed from ${actor.name}`);
    }
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
