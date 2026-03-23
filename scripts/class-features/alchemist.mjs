/**
 * Alchemist Class Features
 * Registry entries + runtime hooks for all Alchemist features.
 */

import { MODULE_ID } from "../vagabond-character-enhancer.mjs";
import { AlchemyCookbook } from "../alchemy/alchemy-cookbook.mjs";
import {
  registerMaterialsHook, registerCountdownDamageHook, registerEffectExpirationHook,
  registerCountdownLinkedAEHook, registerOilBonusDamageHook, registerAlchemicalAttackHook,
  registerEurekaHook, registerConsumableUseHook, populateAlchemicalFolder, useConsumable,
  getConsumableEffect, getAlchemistData, craftItem, migrateAlchemyFlags
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
    registerConsumableUseHook();

    // Right-click "Use" on consumable items (potions, antitoxin)
    Hooks.on("renderApplicationV2", (app, html) => {
      if (!game.user.isGM) return;
      const el = html instanceof jQuery ? html[0] : html;
      if (!el?.classList?.contains("vagabond-actor-sheet")) return;

      el.querySelectorAll('.item-list .item, [data-item-id]').forEach(row => {
        row.addEventListener("contextmenu", async (ev) => {
          const itemId = row.dataset.itemId || row.closest("[data-item-id]")?.dataset.itemId;
          if (!itemId) return;
          const actor = app.actor || app.document;
          if (!actor) return;
          const actorItem = actor.items.get(itemId);
          if (!actorItem) return;
          if (actorItem.type !== "equipment" || actorItem.system.equipmentType !== "consumable") return;
          const effect = getConsumableEffect(actorItem.name);
          if (!effect) return;
          ev.preventDefault();
          ev.stopPropagation();
          await useConsumable(actor, actorItem);
        });
      });
    });

    console.log(`${MODULE_ID} | Alchemist Cookbook hooks registered.`);
  }
};
