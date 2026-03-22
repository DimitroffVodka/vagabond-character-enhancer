/**
 * Barbarian Class Features
 * Runtime hooks for features that can't be pure Active Effects.
 */

import { MODULE_ID } from "../vagabond-character-enhancer.mjs";

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
/*  Barbarian Features                          */
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
  /*  Rage: Die Upsizing + Exploding              */
  /* -------------------------------------------- */

  _registerRageHooks() {
    // Use libWrapper if available to wrap damage formula preparation
    Hooks.once("ready", () => {
      if (typeof libWrapper !== "undefined") {
        // Wrap the damage helper's rollDamage to intercept damage formulas
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
      } else {
        this._log("libWrapper not available — Rage die upsizing will use chat card hook fallback");
        // Fallback: intercept chat card damage buttons
        this._registerRageChatFallback();
      }
    });
  },

  /**
   * Fallback for Rage without libWrapper — modify damage display in chat.
   */
  _registerRageChatFallback() {
    Hooks.on("renderChatMessage", (message, html) => {
      // Check if this is a damage roll from a Berserk barbarian
      const actorId = message.speaker?.actor;
      if (!actorId) return;
      const actor = game.actors.get(actorId);
      if (!actor) return;

      if (!this._hasFeature(actor, "barbarian_rage") ||
          !this._isBerserk(actor) ||
          !this._isLightOrNoArmor(actor)) return;

      // Add visual indicator to the chat card
      const header = html[0]?.querySelector?.(".vagabond-card-header") ?? html.find?.(".vagabond-card-header")?.[0];
      if (header) {
        const rageTag = document.createElement("span");
        rageTag.className = "vce-rage-tag";
        rageTag.textContent = "RAGE";
        header.appendChild(rageTag);
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
    // This will be implemented via libWrapper on the roll builder
    // or via a pre-roll hook when available
    Hooks.once("ready", () => {
      if (typeof libWrapper !== "undefined") {
        // TODO: Wrap roll builder to add Favor when target HP < max
        this._log("Bloodthirsty: libWrapper available, will wrap roll builder (TODO)");
      }
    });
  }
};
