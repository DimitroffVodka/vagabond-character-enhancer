/**
 * Vagabond Character Enhancer
 * Automates ancestry traits, class features, and perks for the Vagabond RPG system.
 */

export const MODULE_ID = "vagabond-character-enhancer";

import { FeatureDetector } from "./feature-detector.mjs";
import { BarbarianFeatures } from "./class-features/barbarian.mjs";
import { BardFeatures } from "./class-features/bard.mjs";

/* -------------------------------------------- */
/*  Init                                        */
/* -------------------------------------------- */

Hooks.once("init", () => {
  // Register module settings
  game.settings.register(MODULE_ID, "enableClassFeatures", {
    name: "Enable Class Feature Automation",
    hint: "Automatically detect and apply class feature effects when a class is added to a character.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "enablePerkFeatures", {
    name: "Enable Perk Automation",
    hint: "Automatically detect and apply perk effects.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "debugMode", {
    name: "Debug Mode",
    hint: "Log feature detection and effect management to the console.",
    scope: "client",
    config: true,
    type: Boolean,
    default: false
  });

  console.log(`${MODULE_ID} | Initialized.`);
});

/* -------------------------------------------- */
/*  Ready                                       */
/* -------------------------------------------- */

Hooks.once("ready", async () => {
  // Patch system's calculateFinalDamage to fix Rage DR dice counting.
  // The system reads attackingWeapon.system.damageAmount (often empty).
  // We fix it to read currentDamage instead, and fall back to counting
  // dice from the most recent damage chat message when weapon is null.
  try {
    const { VagabondDamageHelper } = await import("/systems/vagabond/module/helpers/damage-helper.mjs");
    const origCalcFinal = VagabondDamageHelper.calculateFinalDamage;

    VagabondDamageHelper.calculateFinalDamage = function (actor, damage, damageType, attackingWeapon = null, sneakDice = 0) {
      const result = origCalcFinal.call(this, actor, damage, damageType, attackingWeapon, sneakDice);

      // Only intervene for berserk barbarians with light/no armor
      const reductionPerDie = actor.system?.incomingDamageReductionPerDie || 0;
      if (reductionPerDie <= 0 || !actor.statuses?.has("berserk")) return result;
      if (!VagabondDamageHelper._isLightOrNoArmor(actor)) return result;

      // Count dice from currentDamage (the field the system forgot to check)
      let numDice = 0;
      const formula = attackingWeapon?.system?.currentDamage
        || attackingWeapon?.system?.damageAmount || "";
      numDice = VagabondDamageHelper._countDiceInFormula(formula);

      // Fallback for NPC attacks (no weapon item): scan recent chat for dice count
      if (numDice === 0) {
        const recent = game.messages.contents.slice(-5);
        for (let i = recent.length - 1; i >= 0; i--) {
          const rolls = recent[i].rolls;
          if (!rolls?.length) continue;
          for (const roll of rolls) {
            for (const term of (roll.terms || [])) {
              if (term.constructor?.name === "Die") {
                numDice += term.results?.length || term.number || 0;
              }
            }
          }
          if (numDice > 0) break;
        }
      }

      if (numDice <= 0) return result;

      // The original applied 0 DR (damageAmount was empty). Apply the real DR now.
      const rageDR = reductionPerDie * numDice;
      if (game.settings.get(MODULE_ID, "debugMode")) {
        console.log(`${MODULE_ID} | Rage DR: ${reductionPerDie} × ${numDice} dice = ${rageDR} reduction`);
      }
      return Math.max(0, result - rageDR);
    };

    console.log(`${MODULE_ID} | Patched calculateFinalDamage for Rage DR.`);

    // --- Bloodthirsty: Favor on attacks vs wounded targets ---
    // Wrap item.rollAttack to upgrade favorHinder when attacker has Bloodthirsty
    // and any target is missing HP.
    const itemModule = await import("/systems/vagabond/module/documents/item.mjs");
    const VagabondItem = itemModule.default || Object.values(itemModule).find(v => v?.prototype?.rollAttack);
    if (VagabondItem?.prototype?.rollAttack) {
      const origRollAttack = VagabondItem.prototype.rollAttack;
      VagabondItem.prototype.rollAttack = async function (actor, favorHinder = "none") {
        const features = actor.getFlag?.(MODULE_ID, "features");

        // Rage: auto-apply Berserk before the attack roll so die upsizing
        // and exploding are active when damage is rolled on this same card.
        // This replaces the preCreateChatMessage approach which was too late.
        if (features?.barbarian_rage && !actor.statuses?.has("berserk")) {
          const equippedArmor = actor.items.filter(
            i => i.type === "equipment" && i.system.equipmentType === "armor" && i.system.equipped
          );
          const isLightOrNone = equippedArmor.length === 0 ||
            equippedArmor.every(a => (a.system.armorType?.toLowerCase() ?? "") === "light" || (a.system.armorType?.toLowerCase() ?? "") === "");
          if (isLightOrNone) {
            await actor.toggleStatusEffect("berserk", { active: true });
            // Wait briefly for companion AE creation to complete
            await new Promise(r => setTimeout(r, 50));
            if (game.settings.get(MODULE_ID, "debugMode")) {
              console.log(`${MODULE_ID} | Rage: auto-applied Berserk before attack roll`);
            }
          }
        }

        // Virtuoso: Valor grants favor on attacks
        const virtuosoBuff = actor.effects?.find(e => e.getFlag(MODULE_ID, "virtuosoBuff"));
        if (virtuosoBuff) {
          const buffType = virtuosoBuff.getFlag(MODULE_ID, "virtuosoBuff");
          if (buffType === "valor" && favorHinder !== "favor") {
            if (favorHinder === "hinder") favorHinder = "none";
            else favorHinder = "favor";
            if (game.settings.get(MODULE_ID, "debugMode")) {
              console.log(`${MODULE_ID} | Virtuoso Valor: upgraded to ${favorHinder}`);
            }
          }
        }

        // Bloodthirsty: Favor on attacks against wounded targets
        if (features?.barbarian_bloodthirsty && favorHinder !== "favor") {
          // Check if any current target is missing HP
          const targets = game.user.targets;
          let hasWoundedTarget = false;
          for (const token of targets) {
            const tActor = token.actor;
            if (!tActor) continue;
            const hp = tActor.system.health;
            if (hp && hp.value < hp.max) {
              hasWoundedTarget = true;
              break;
            }
          }
          if (hasWoundedTarget) {
            if (favorHinder === "hinder") favorHinder = "none";
            else favorHinder = "favor";
            if (game.settings.get(MODULE_ID, "debugMode")) {
              console.log(`${MODULE_ID} | Bloodthirsty: upgraded to ${favorHinder} (wounded target)`);
            }
          }
        }
        return origRollAttack.call(this, actor, favorHinder);
      };
      console.log(`${MODULE_ID} | Patched rollAttack for Bloodthirsty.`);
    }

    // --- Virtuoso: Apply favor from Virtuoso buff, combining with system state ---
    // Monkey-patch buildAndEvaluateD20 to check for Virtuoso buff flags on the actor.
    // This properly combines with existing favor/hinder (e.g., flanking hinder + Virtuoso
    // favor = cancel to "none") instead of overriding the system's favorHinder field.
    const { VagabondRollBuilder } = await import("/systems/vagabond/module/helpers/roll-builder.mjs");
    const origBuildD20 = VagabondRollBuilder.buildAndEvaluateD20;
    VagabondRollBuilder.buildAndEvaluateD20 = async function (actor, favorHinder, baseFormula = null) {
      // Check if actor has a Virtuoso Valor or Resolve buff
      const virtuosoBuff = actor.effects?.find(e => e.getFlag(MODULE_ID, "virtuosoBuff"));
      if (virtuosoBuff) {
        const buffType = virtuosoBuff.getFlag(MODULE_ID, "virtuosoBuff");
        if (buffType === "valor" || buffType === "resolve") {
          // Combine Virtuoso favor with existing state:
          // favor + favor = favor, none + favor = favor, hinder + favor = none (cancel)
          if (favorHinder === "hinder") favorHinder = "none";
          else favorHinder = "favor";
          if (game.settings.get(MODULE_ID, "debugMode")) {
            console.log(`${MODULE_ID} | Virtuoso: ${buffType} applied — effective favorHinder: ${favorHinder}`);
          }
        }
      }
      return origBuildD20.call(this, actor, favorHinder, baseFormula);
    };
    console.log(`${MODULE_ID} | Patched buildAndEvaluateD20 for Virtuoso.`);
  } catch (err) {
    console.error(`${MODULE_ID} | Failed to patch system methods:`, err);
  }

  // --- Berserk status: enforce "Can't be Frightened" for ALL berserk characters ---
  // System config defines this rule but doesn't enforce it mechanically.
  Hooks.on("createActiveEffect", async (effect, options, userId) => {
    if (!game.user.isGM) return;
    if (!effect.statuses?.has("berserk")) return;
    const actor = effect.parent;
    if (!actor) return;

    // Don't create duplicates
    if (actor.effects.find(e => e.getFlag(MODULE_ID, "berserkFrightImmune"))) return;

    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: "Berserk (Frighten Immune)",
      img: "icons/svg/terror.svg",
      flags: { [MODULE_ID]: { managed: true, berserkFrightImmune: true } },
      changes: [
        { key: "system.statusImmunities", mode: 2, value: "frightened" }
      ],
      disabled: false,
      transfer: false
    }]);
  });

  Hooks.on("deleteActiveEffect", async (effect, options, userId) => {
    if (!game.user.isGM) return;
    if (!effect.statuses?.has("berserk")) return;
    const actor = effect.parent;
    if (!actor) return;

    const frightImmune = actor.effects.find(e => e.getFlag(MODULE_ID, "berserkFrightImmune"));
    if (frightImmune) await frightImmune.delete();
  });

  // Expose module API
  game.vagabondCharacterEnhancer = {
    detector: FeatureDetector,
    barbarian: BarbarianFeatures,
    bard: BardFeatures,
    rescan: (actor) => FeatureDetector.scan(actor),
    rescanAll: () => FeatureDetector.scanAll(),
    getFlags: (actor) => actor.getFlag(MODULE_ID, "features"),
    // Virtuoso action — call from macro or console:
    //   game.vagabondCharacterEnhancer.virtuoso(game.actors.get("bardActorId"))
    virtuoso: (actor) => BardFeatures.useVirtuoso(actor),
    debug: (actor) => {
      if (!actor) {
        console.warn(`${MODULE_ID} | debug: No actor provided. Usage: game.vagabondCharacterEnhancer.debug(game.actors.get("id"))`);
        return;
      }
      const flags = actor.getFlag(MODULE_ID, "features");
      const managed = actor.effects.filter(e => e.getFlag(MODULE_ID, "managed"));
      console.log(`${MODULE_ID} | Actor: ${actor.name}`);
      console.log(`${MODULE_ID} | Features:`, flags);
      console.log(`${MODULE_ID} | Managed Effects:`, managed.map(e => e.name));
    }
  };

  // Register feature detection hooks
  FeatureDetector.registerHooks();

  // Register class feature runtime hooks
  BarbarianFeatures.registerHooks();
  BardFeatures.registerHooks();

  // Scan all existing characters on first load
  FeatureDetector.scanAll();

  console.log(`${MODULE_ID} | Ready.`);
});
