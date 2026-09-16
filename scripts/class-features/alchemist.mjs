/**
 * Alchemist Class Features
 * Registry entries + runtime hooks for all Alchemist features.
 */

import { MODULE_ID, log } from "../utils.mjs";
import { AlchemyCookbook } from "../alchemy/alchemy-cookbook.mjs";
import {
  registerMaterialsHook, registerCountdownDamageHook, registerEffectExpirationHook,
  registerCountdownLinkedAEHook, registerOilBonusDamageHook, registerAlchemicalAttackHook,
  registerEurekaHook, registerConsumableUseHook, populateAlchemicalFolder, useConsumable,
  getAlchemistData, craftItem, migrateAlchemyFlags
} from "../alchemy/alchemy-helpers.mjs";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

export const ALCHEMIST_REGISTRY = {
  // L1: Alchemy
  // You can attack with alchemical items using Craft.
  // Formulae: Choose 4 alchemical items with a value no higher than (your Alchemist
  // Level x 50s). You only need to provide 5s of materials to Craft these items and
  // have Alchemy Tools equipped. You learn to Craft 1 other alchemical item this way
  // every 2 Levels in this Class hereafter.
  "alchemy": {
    class: "alchemist",
    level: 1,
    flag: "alchemist_alchemy",
    description: "Attack with alchemical items using Craft. Choose 4 formulae (value up to Level x 50s), 5s materials + Alchemy Tools to Craft. Learn 1 more every 2 levels."
  },

  // L1: Catalyze
  // You gain the Deft Hands Perk, and you can Craft alchemical items with the Use Action.
  // Grants Perk: Deft Hands — You can skip your Move to take the Use Action.
  "catalyze": {
    class: "alchemist",
    level: 1,
    flag: "alchemist_catalyze",
    description: "Gain the Deft Hands Perk. Can Craft alchemical items with the Use Action."
  },

  // L2: Eureka
  // You gain a Studied die when you Crit on a Craft Check.
  "eureka": {
    class: "alchemist",
    level: 2,
    flag: "alchemist_eureka",
    description: "Gain a Studied die when you Crit on a Craft Check."
  },

  // L4: Potency
  // The damage and healing dice of your alchemical items can explode.
  "potency": {
    class: "alchemist",
    level: 4,
    flag: "alchemist_potency",
    description: "The damage and healing dice of your alchemical items can explode."
  },

  // L6: Mix
  // You can take the Use Action to combine two alchemical items together, causing
  // their effects to both occur when you Use the combined item. This combined item
  // lasts for the Round, then goes inert.
  "mix": {
    class: "alchemist",
    level: 6,
    flag: "alchemist_mix",
    description: "Use Action to combine two alchemical items. Both effects occur when Used. Lasts for the Round."
  },

  // L8: Big Bang
  // You gain a d6 bonus to the damage and healing of your alchemical items, and
  // they can explode on a roll of their two highest values.
  "big bang": {
    class: "alchemist",
    level: 8,
    flag: "alchemist_bigBang",
    description: "d6 bonus to alchemical damage/healing. Can explode on their two highest values."
  },

  // L10: Prima Materia
  // Once per Day, you can use your Action or skip your Move to Craft an alchemical
  // item with a value as high as 10g without materials.
  "prima materia": {
    class: "alchemist",
    level: 10,
    flag: "alchemist_primaMateria",
    description: "Once per Day, Craft an alchemical item worth up to 10g without materials (Action or skip Move)."
  }
};

/* -------------------------------------------- */
/*  Alchemist Runtime Hooks                     */
/* -------------------------------------------- */

export const AlchemistFeatures = {

  /* -------------------------------------------- */
  /*  Handler Methods (called from main dispatcher) */
  /* -------------------------------------------- */

  /**
   * Consumable weapon flag: Force auto-roll damage for consumable weapons.
   * Called from rollAttack dispatcher.
   */
  onPreRollAttack(ctx) {
    const isConsumableWeapon = ctx.item.system?.isConsumable
      && ctx.item.system?.equipmentType === "weapon";
    if (isConsumableWeapon) {
      ctx.VagabondDamageHelper._vceForceRollDamage = true;
    }
  },

  /**
   * Alchemical weapon redirect: Full attack flow for alchemical weapons.
   * Called from item.roll dispatcher.
   */
  async onPreItemRoll(ctx) {
    const ALCHEMICAL_WEAPON_TYPES = new Set(["acid", "explosive", "poison"]);
    const alcType = (ctx.item.system.alchemicalType ?? "").toLowerCase();
    const isAlchemicalWeapon = ctx.item.type === "equipment"
      && ctx.item.system.equipmentType === "weapon"
      && (ALCHEMICAL_WEAPON_TYPES.has(alcType) || ctx.item.name?.toLowerCase().includes("holy water"));
    if (!isAlchemicalWeapon) return;

    const actor = ctx.item.actor;
    if (!actor) return;

    try {
      const { VagabondChatCard } = game.vagabond.api;
      const targets = Array.from(game.user.targets).map(t => ({
        tokenId: t.id, sceneId: t.scene.id,
        actorId: t.actor?.id, actorName: t.name, actorImg: t.document.texture.src,
      }));
      const favorHinder = actor.system?.favorHinder || "none";
      const attackResult = await ctx.item.rollAttack(actor, favorHinder);
      if (!attackResult) { ctx.handled = true; ctx.result = undefined; return; }
      if (attackResult.isCritical && attackResult.weaponSkill?.stat) {
        attackResult.critStatBonus = actor.getRollData().stats?.[attackResult.weaponSkill.stat]?.value || 0;
      }
      let damageRoll = null;
      const isHit = attackResult.isHit ?? false;
      if (isHit || attackResult.isCritical) {
        damageRoll = await ctx.item.rollDamage(actor, attackResult.isCritical, attackResult.weaponSkill?.stat ?? null,
          targets, null, attackResult.weaponSkillKey);
      }
      await VagabondChatCard.weaponAttack(actor, ctx.item, attackResult, damageRoll, targets);
      await ctx.item.handleConsumption?.();
      ctx.handled = true;
      ctx.result = attackResult.roll;
    } catch (e) {
      console.error(`${MODULE_ID} | Alchemical weapon attack failed:`, e);
      ui.notifications.error("Alchemical attack failed — check console.");
      ctx.handled = true;
      ctx.result = undefined;
    }
  },

  /** Expose API for crawl strip and macros */
  api: {
    cookbook: AlchemyCookbook,
    getAlchemistData,
    craftItem,
    useConsumable,
    populateAlchemicalFolder
  },

  /** One-time flag migration from vagabond-crawler namespace */
  async migrate() {
    await migrateAlchemyFlags();
  },

  registerHooks() {
    if (!game.settings.get(MODULE_ID, "alchemistCookbook")) return;

    // Cookbook UI (right-click on Alchemy Tools, context menus)
    AlchemyCookbook.init();

    // Core alchemy hooks
    registerMaterialsHook();
    registerCountdownDamageHook();
    registerEffectExpirationHook();
    registerCountdownLinkedAEHook();
    registerOilBonusDamageHook();
    registerAlchemicalAttackHook();
    registerEurekaHook();
    // Consumable effects (potions, antitoxin) apply from the normal Use flow via
    // registerConsumableUseHook. (A GM right-click shortcut used to live here; it
    // keyed on a sheet class and an equipmentType the system never had, so it
    // never fired.)
    registerConsumableUseHook();

    log("Alchemist", "Cookbook hooks registered.");
  }
};
