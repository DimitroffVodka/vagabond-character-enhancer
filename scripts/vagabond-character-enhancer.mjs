/**
 * Vagabond Character Enhancer
 * Automates ancestry traits, class features, and perks for the Vagabond RPG system.
 */

import { MODULE_ID, log, getFeatures } from "./utils.mjs";
export { MODULE_ID };

// Module-global context for passing actor through wrapped call chains.
// Set before calling a wrapped method, cleared after. Used by Climax
// to pass the actor to buildAndEvaluateD20WithRollData (which only
// receives rollData, not the actor).
let _currentRollActor = null;

// Hunter's Mark multi-d20 count. Set by HunterFeatures.onPreRollAttack or
// onPreRollSave, consumed by the buildAndEvaluateD20 patches below.
// 0 = normal roll, 2 = 2d20kh, 3 = 3d20kh (Lethal Precision).
import { _hunterMarkDice, resetHunterMarkDice } from "./class-features/hunter.mjs";

// Save source actor ID. Set by the handleSaveRoll patch so that onPreRollSave
// can check whether the save was provoked by a specific actor (e.g., for Overwatch).
export let _saveSourceActorId = null;

// Damage source actor ID. Set by handleSaveRoll / handleApplyDirectDamage patches
// so that calculateFinalDamage handlers (Apex Predator) know who dealt the damage.
export let _damageSourceActorId = null;

import { FeatureDetector } from "./feature-detector.mjs";
import { BarbarianFeatures } from "./class-features/barbarian.mjs";
import { BardFeatures } from "./class-features/bard.mjs";
import { DancerFeatures } from "./class-features/dancer.mjs";
import { AlchemistFeatures } from "./class-features/alchemist.mjs";
import { DruidFeatures } from "./class-features/druid.mjs";
import { FighterFeatures } from "./class-features/fighter.mjs";
import { GunslingerFeatures } from "./class-features/gunslinger.mjs";
import { HunterFeatures } from "./class-features/hunter.mjs";
import { LuminaryFeatures } from "./class-features/luminary.mjs";
import { MagusFeatures } from "./class-features/magus.mjs";
import { MerchantFeatures } from "./class-features/merchant.mjs";
import { PugilistFeatures } from "./class-features/pugilist.mjs";
import { RevelatorFeatures } from "./class-features/revelator.mjs";
import { RogueFeatures } from "./class-features/rogue.mjs";
import { SorcererFeatures } from "./class-features/sorcerer.mjs";
import { VanguardFeatures } from "./class-features/vanguard.mjs";
import { WitchFeatures } from "./class-features/witch.mjs";
import { WizardFeatures } from "./class-features/wizard.mjs";
import { PolymorphManager } from "./polymorph/polymorph-manager.mjs";
import { AuraManager } from "./aura/aura-manager.mjs";
import { FocusManager } from "./focus/focus-manager.mjs";
import { FeatureFxConfig } from "./focus/feature-fx-config.mjs";
import { PolymorphSheet } from "./polymorph/polymorph-sheet.mjs";
import { BeastCache } from "./polymorph/beast-cache.mjs";
import { populateBeasts } from "./polymorph/populate-beasts.mjs";

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

  game.settings.register(MODULE_ID, "alchemistCookbook", {
    name: "Alchemist Cookbook",
    hint: "Enable crafting UI for Alchemists — adds right-click cookbook on Alchemy Tools and alchemical combat hooks.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  // Hidden setting for feature FX configuration data
  game.settings.register(MODULE_ID, "featureFxConfig", {
    scope: "world",
    config: false,
    type: Object,
    default: {}
  });

  // Settings menu button for Feature FX Config
  game.settings.registerMenu(MODULE_ID, "featureFxConfigMenu", {
    name: "Feature FX Config",
    label: "Configure Feature FX",
    hint: "Configure per-class-feature Sequencer animations (requires Sequencer + JB2A).",
    icon: "fas fa-wand-magic-sparkles",
    type: FeatureFxConfig,
    restricted: true
  });

  // Hidden setting for one-time flag migration tracking
  game.settings.register(MODULE_ID, "alchemyFlagsMigrated", {
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });

  console.log(`${MODULE_ID} | Initialized.`);
});

/* -------------------------------------------- */
/*  Ready                                       */
/* -------------------------------------------- */

Hooks.once("ready", async () => {
  try {
    const { VagabondDamageHelper } = await import("/systems/vagabond/module/helpers/damage-helper.mjs");

    // --- calculateFinalDamage: Rage DR + Tempest Within + Apex Predator ---
    const origCalcFinal = VagabondDamageHelper.calculateFinalDamage;
    VagabondDamageHelper.calculateFinalDamage = function (actor, damage, damageType, attackingWeapon = null, sneakDice = 0) {
      let result = origCalcFinal.call(this, actor, damage, damageType, attackingWeapon, sneakDice);
      const features = getFeatures(actor);

      // Apex Predator: check if this target is marked by the hunter dealing the damage
      const apexCtx = { actor, result, damage, damageType, damageSourceActorId: _damageSourceActorId };
      HunterFeatures.onCalculateFinalDamage(apexCtx);
      result = apexCtx.result;

      const needsRageDR = actor.system?.incomingDamageReductionPerDie > 0
        && actor.statuses?.has("berserk")
        && VagabondDamageHelper._isLightOrNoArmor(actor);
      const needsTempest = features?.druid_tempestWithin
        && ["cold", "fire", "shock"].includes(damageType?.toLowerCase());
      if (!needsRageDR && !needsTempest) return result;

      // Count dice (shared logic — not class-specific)
      let numDice = 0;
      const formula = attackingWeapon?.system?.currentDamage
        || attackingWeapon?.system?.damageAmount || "";
      numDice = VagabondDamageHelper._countDiceInFormula(formula);
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

      const ctx = { actor, result, numDice, damageType, features, needsRageDR };
      BarbarianFeatures.onCalculateFinalDamage(ctx);
      DruidFeatures.onCalculateFinalDamage(ctx);
      return ctx.result;
    };
    console.log(`${MODULE_ID} | Patched calculateFinalDamage.`);

    // --- shouldRollDamage: Force auto-roll for consumable weapons ---
    const origShouldRoll = VagabondDamageHelper.shouldRollDamage;
    VagabondDamageHelper.shouldRollDamage = function (isHit) {
      if (VagabondDamageHelper._vceForceRollDamage) {
        VagabondDamageHelper._vceForceRollDamage = false;
        return true;
      }
      return origShouldRoll.call(this, isHit);
    };
    console.log(`${MODULE_ID} | Patched shouldRollDamage.`);

    // --- rollAttack: Dispatch to class handlers ---
    const itemModule = await import("/systems/vagabond/module/documents/item.mjs");
    const VagabondItem = itemModule.default || Object.values(itemModule).find(v => v?.prototype?.rollAttack);
    if (VagabondItem?.prototype?.rollAttack) {
      const origRollAttack = VagabondItem.prototype.rollAttack;
      VagabondItem.prototype.rollAttack = async function (actor, favorHinder = "none") {
        const ctx = {
          item: this, actor, features: getFeatures(actor), favorHinder,
          VagabondDamageHelper
        };

        // Pre-roll handlers (order matters)
        await BarbarianFeatures.onPreRollAttack(ctx);   // auto-berserk
        BardFeatures.onPreRollAttack(ctx);               // Virtuoso Valor
        FighterFeatures.onPreRollAttack(ctx);             // Momentum
        await GunslingerFeatures.onPreRollAttack(ctx);   // Quick Draw + Deadeye
        await HunterFeatures.onPreRollAttack(ctx);       // Hunter's Mark 2d20kh/3d20kh
        RevelatorFeatures.onPreRollAttack(ctx);           // Holy Diver favor
        BarbarianFeatures.onPreRollAttackBloodthirsty(ctx); // Bloodthirsty
        AlchemistFeatures.onPreRollAttack(ctx);           // Consumable weapon flag

        // Stash actor for Climax/Choreographer in buildAndEvaluateD20WithRollData
        _currentRollActor = actor;
        try {
          const result = await origRollAttack.call(this, actor, ctx.favorHinder);
          _currentRollActor = null;

          // Post-roll handlers
          ctx.rollResult = result;
          await GunslingerFeatures.onPostRollAttack(ctx);
          await HunterFeatures.onPostRollAttack(ctx);

          return result;
        } catch (e) {
          _currentRollActor = null;
          VagabondDamageHelper._vceForceRollDamage = false;
          throw e;
        }
      };
      console.log(`${MODULE_ID} | Patched rollAttack.`);
    }

    // --- rollDamage: Dispatch to Gunslinger ---
    if (VagabondItem?.prototype?.rollDamage) {
      const origRollDamage = VagabondItem.prototype.rollDamage;
      VagabondItem.prototype.rollDamage = async function (actor, isCritical = false, statKey = null) {
        const ctx = { item: this, actor, features: getFeatures(actor), isCritical };
        GunslingerFeatures.onPreRollDamage(ctx);
        try {
          return await origRollDamage.call(this, actor, isCritical, statKey);
        } finally {
          if (ctx.origCanExplode !== undefined) {
            this.system.canExplode = ctx.origCanExplode;
            this.system.explodeValues = ctx.origExplodeValues;
          }
          if (ctx.origDamage !== undefined) {
            this.system.currentDamage = ctx.origDamage;
          }
          this._vceRangedCrit = false;
        }
      };
      console.log(`${MODULE_ID} | Patched rollDamage.`);
    }

    // --- item.roll: Dispatch to Alchemist + Bard + Luminary ---
    if (VagabondItem?.prototype?.roll) {
      const origItemRoll = VagabondItem.prototype.roll;
      VagabondItem.prototype.roll = async function (event, targetsAtRollTime = []) {
        const ctx = { item: this, actor: this.actor, event, targets: targetsAtRollTime, handled: false };

        // Alchemical weapon redirect
        await AlchemistFeatures.onPreItemRoll(ctx);
        if (ctx.handled) return ctx.result;

        // Inspiration healing
        await BardFeatures.onPreItemRoll(ctx);

        // Radiant Healer explosion tracking
        await LuminaryFeatures.onPreItemRoll(ctx);

        try {
          const result = await origItemRoll.call(this, event, targetsAtRollTime);
          return result;
        } finally {
          if (ctx._bardOrigFormula !== undefined) {
            this.system.formula = ctx._bardOrigFormula;
          }
        }
      };
      console.log(`${MODULE_ID} | Patched item.roll.`);
    }

    // --- buildAndEvaluateD20: Dispatch to Bard + Dancer + Hunter ---
    const { VagabondRollBuilder } = await import("/systems/vagabond/module/helpers/roll-builder.mjs");
    const origBuildD20 = VagabondRollBuilder.buildAndEvaluateD20;
    VagabondRollBuilder.buildAndEvaluateD20 = async function (actor, favorHinder, baseFormula = null) {
      const ctx = { actor, favorHinder };
      BardFeatures.onPreBuildD20(ctx);
      DancerFeatures.onPreBuildD20(ctx);
      // Hunter's Mark (Overwatch): override base formula for saves
      const effectiveFormula = _hunterMarkDice > 1 ? `${_hunterMarkDice}d20kh` : baseFormula;
      resetHunterMarkDice();
      return origBuildD20.call(this, actor, ctx.favorHinder, effectiveFormula);
    };
    console.log(`${MODULE_ID} | Patched buildAndEvaluateD20.`);

    // --- buildAndEvaluateD20WithConditionalHinder: Dispatch to Bard + Hunter ---
    const origBuildD20Conditional = VagabondRollBuilder.buildAndEvaluateD20WithConditionalHinder;
    VagabondRollBuilder.buildAndEvaluateD20WithConditionalHinder = async function (actor, effectiveFavorHinder, isConditionallyHindered, baseFormula = null) {
      const ctx = { actor, effectiveFavorHinder };
      BardFeatures.onPreBuildD20Conditional(ctx);
      // Hunter's Mark (Overwatch): override base formula for conditional saves
      const effectiveFormula = _hunterMarkDice > 1 ? `${_hunterMarkDice}d20kh` : baseFormula;
      resetHunterMarkDice();
      return origBuildD20Conditional.call(this, actor, ctx.effectiveFavorHinder, isConditionallyHindered, effectiveFormula);
    };
    console.log(`${MODULE_ID} | Patched buildAndEvaluateD20WithConditionalHinder.`);

    // --- evaluateRoll: Dispatch to Bard (Climax) ---
    const origEvaluateRoll = VagabondRollBuilder.evaluateRoll;
    VagabondRollBuilder.evaluateRoll = async function (formula, actor, favorHinder) {
      const roll = await origEvaluateRoll.call(this, formula, actor, favorHinder);
      const ctx = { actor, favorHinder, roll, VagabondDamageHelper };
      await BardFeatures.onPostEvaluateRoll(ctx);
      return ctx.roll;
    };
    console.log(`${MODULE_ID} | Patched evaluateRoll.`);

    // --- buildAndEvaluateD20WithRollData: Dispatch to Bard + Dancer + Hunter ---
    const origBuildD20WithRollData = VagabondRollBuilder.buildAndEvaluateD20WithRollData;
    VagabondRollBuilder.buildAndEvaluateD20WithRollData = async function (rollData, favorHinder, baseFormula = null) {
      const ctx = { currentRollActor: _currentRollActor, favorHinder, VagabondDamageHelper };
      BardFeatures.onPreBuildD20WithRollData(ctx);
      DancerFeatures.onPreBuildD20WithRollData(ctx);
      // Hunter's Mark: override base formula with multi-d20 keep highest
      const effectiveFormula = _hunterMarkDice > 1 ? `${_hunterMarkDice}d20kh` : baseFormula;
      resetHunterMarkDice();
      const roll = await origBuildD20WithRollData.call(this, rollData, ctx.favorHinder, effectiveFormula);
      ctx.roll = roll;
      await BardFeatures.onPostBuildD20WithRollData(ctx);
      return roll;
    };
    console.log(`${MODULE_ID} | Patched buildAndEvaluateD20WithRollData.`);

    // --- handleApplyRestorative: Dispatch to Bard + Luminary ---
    const origHandleRestorative = VagabondDamageHelper.handleApplyRestorative;
    VagabondDamageHelper.handleApplyRestorative = async function (button) {
      const ctx = {
        button,
        damageType: button.dataset.damageType?.toLowerCase(),
        actorId: button.dataset.actorId,
        itemId: button.dataset.itemId
      };
      await BardFeatures.onPreHandleRestorative(ctx);
      await LuminaryFeatures.onPreHandleRestorative(ctx);
      return origHandleRestorative.call(this, button);
    };
    console.log(`${MODULE_ID} | Patched handleApplyRestorative.`);

    // --- handleSaveRoll / handleSaveReminderRoll: Track save + damage source actor ---
    // Wraps the system's save-roll entry points to capture the attacker's actor ID
    // before _rollSave and calculateFinalDamage fire, so Overwatch and Apex Predator
    // can check whether the effect was provoked by / damage dealt by a specific actor.
    const origHandleSaveRoll = VagabondDamageHelper.handleSaveRoll;
    VagabondDamageHelper.handleSaveRoll = async function (button, event = null) {
      _saveSourceActorId = button.dataset.actorId || null;
      _damageSourceActorId = button.dataset.actorId || null;
      try { return await origHandleSaveRoll.call(this, button, event); }
      finally { _saveSourceActorId = null; _damageSourceActorId = null; }
    };
    const origHandleSaveReminderRoll = VagabondDamageHelper.handleSaveReminderRoll;
    VagabondDamageHelper.handleSaveReminderRoll = async function (button, event = null) {
      _saveSourceActorId = button.dataset.actorId || null;
      _damageSourceActorId = button.dataset.actorId || null;
      try { return await origHandleSaveReminderRoll.call(this, button, event); }
      finally { _saveSourceActorId = null; _damageSourceActorId = null; }
    };
    console.log(`${MODULE_ID} | Patched handleSaveRoll + handleSaveReminderRoll.`);

    // --- handleApplyDirect: Track damage source actor for Apex Predator ---
    const origHandleApplyDirect = VagabondDamageHelper.handleApplyDirect;
    VagabondDamageHelper.handleApplyDirect = async function (button) {
      _damageSourceActorId = button.dataset.actorId || null;
      try { return await origHandleApplyDirect.call(this, button); }
      finally { _damageSourceActorId = null; }
    };
    console.log(`${MODULE_ID} | Patched handleApplyDirect.`);

    // --- _rollSave: Dispatch to Bard + Dancer ---
    const origRollSave = VagabondDamageHelper._rollSave;
    VagabondDamageHelper._rollSave = async function (actor, saveType, isHindered, shiftKey = false, ctrlKey = false, attackerModifier = 'none') {
      const ctx = {
        actor, saveType, isHindered, ctrlKey, attackerModifier,
        saveSourceActorId: _saveSourceActorId,
        features: getFeatures(actor),
        needRestore: false, origFH: null, rollBuilderPatched: false
      };
      BardFeatures.onPreRollSave(ctx);
      await DancerFeatures.onPreRollSave(ctx);
      HunterFeatures.onPreRollSave(ctx);
      try {
        const result = await origRollSave.call(this, actor, saveType, ctx.isHindered, shiftKey, ctx.ctrlKey, ctx.attackerModifier);
        if (ctx.needRestore) actor.system.favorHinder = ctx.origFH;
        if (ctx.rollBuilderPatched) {
          const { VagabondRollBuilder } = await import("/systems/vagabond/module/helpers/roll-builder.mjs");
          VagabondRollBuilder.buildAndEvaluateD20WithConditionalHinder = ctx._origConditionalHinder;
        }
        return result;
      } catch (e) {
        if (ctx.needRestore) actor.system.favorHinder = ctx.origFH;
        if (ctx.rollBuilderPatched) {
          const { VagabondRollBuilder } = await import("/systems/vagabond/module/helpers/roll-builder.mjs");
          VagabondRollBuilder.buildAndEvaluateD20WithConditionalHinder = ctx._origConditionalHinder;
        }
        throw e;
      }
    };
    console.log(`${MODULE_ID} | Patched _rollSave.`);

    // --- RollHandler.roll: Dispatch to Bard + Dancer ---
    const { RollHandler } = await import("/systems/vagabond/module/sheets/handlers/roll-handler.mjs");
    const origRoll = RollHandler.prototype.roll;
    RollHandler.prototype.roll = async function (event, target) {
      const dataset = target.dataset;
      if (dataset.type === "save" && dataset.roll) {
        const ctx = {
          actor: this.actor, saveKey: dataset.key,
          features: getFeatures(this.actor),
          needRestore: false, origFH: null, rollPatched: false,
          event,
          stripHinder: (label) => {
            if (event.ctrlKey) {
              event = new Proxy(event, {
                get(obj, prop) {
                  if (prop === "ctrlKey") return false;
                  const val = obj[prop];
                  return typeof val === "function" ? val.bind(obj) : val;
                }
              });
            }
            if (!ctx.needRestore) ctx.origFH = ctx.actor.system.favorHinder;
            if (ctx.actor.system.favorHinder === "hinder") {
              ctx.actor.system.favorHinder = "none";
              ctx.needRestore = true;
            }
            log("Sheet", `${label}: ${ctx.saveKey} save from sheet — stripped hinder for ${ctx.actor.name}`);
          }
        };
        BardFeatures.onPreSheetRoll(ctx);
        await DancerFeatures.onPreSheetRoll(ctx);

        if (ctx.needRestore || ctx.rollPatched) {
          try {
            const result = await origRoll.call(this, event, target);
            if (ctx.needRestore) ctx.actor.system.favorHinder = ctx.origFH;
            if (ctx.rollPatched) {
              const { VagabondRollBuilder } = await import("/systems/vagabond/module/helpers/roll-builder.mjs");
              VagabondRollBuilder.buildAndEvaluateD20 = ctx._origBuildD20Ref;
            }
            return result;
          } catch (e) {
            if (ctx.needRestore) ctx.actor.system.favorHinder = ctx.origFH;
            if (ctx.rollPatched) {
              const { VagabondRollBuilder } = await import("/systems/vagabond/module/helpers/roll-builder.mjs");
              VagabondRollBuilder.buildAndEvaluateD20 = ctx._origBuildD20Ref;
            }
            throw e;
          }
        }
      }
      return origRoll.call(this, event, target);
    };
    console.log(`${MODULE_ID} | Patched RollHandler.roll.`);

    // --- SpellHandler.castSpell: Stash _currentRollActor ---
    const { SpellHandler } = await import("/systems/vagabond/module/sheets/handlers/spell-handler.mjs");
    const origCastSpell = SpellHandler.prototype.castSpell;
    SpellHandler.prototype.castSpell = async function (event, target) {
      _currentRollActor = this.actor;
      try {
        const result = await origCastSpell.call(this, event, target);
        _currentRollActor = null;
        return result;
      } catch (e) {
        _currentRollActor = null;
        throw e;
      }
    };
    console.log(`${MODULE_ID} | Patched SpellHandler.castSpell.`);

    // --- SpellHandler.toggleSpellFocus: Enforce combined focus cap + sync FX ---
    const origToggleFocus = SpellHandler.prototype.toggleSpellFocus;
    SpellHandler.prototype.toggleSpellFocus = async function (event, target) {
      const spellId = target.dataset.spellId;
      const current = this.actor.system.focus?.spellIds || [];
      const isAdding = !current.includes(spellId);

      // Block adding if combined slots are full
      if (isAdding && FocusManager.getRemainingFocusSlots(this.actor) <= 0) {
        ui.notifications.warn("No focus slots available — release a spell or feature focus first.");
        return;
      }

      await origToggleFocus.call(this, event, target);

      // Sync FX after the system updates spellIds
      FocusManager._syncFocusFX(this.actor);
    };
    console.log(`${MODULE_ID} | Patched SpellHandler.toggleSpellFocus.`);

  } catch (err) {
    console.error(`${MODULE_ID} | Failed to patch system methods:`, err);
  }

  // Migrate alchemy flags from vagabond-crawler namespace (one-time)
  await AlchemistFeatures.migrate();

  // Expose module API
  game.vagabondCharacterEnhancer = {
    detector: FeatureDetector,
    barbarian: BarbarianFeatures,
    bard: BardFeatures,
    dancer: DancerFeatures,
    druid: DruidFeatures,
    polymorph: PolymorphManager,
    alchemist: AlchemistFeatures,
    alchemy: AlchemistFeatures.api,
    focus: FocusManager,
    focusAcquire: (actor, key, label, icon) => FocusManager.acquireFeatureFocus(actor, key, label, icon),
    focusRelease: (actor, key) => FocusManager.releaseFeatureFocus(actor, key),
    focusStatus: (actor) => FocusManager.getFocusStatus(actor),
    hunterMark: (actor) => HunterFeatures.useMarkAction(actor),
    aura: (actor, spell, radius) => AuraManager.activate(actor, spell, radius),
    auraMenu: (actor) => AuraManager.showAuraMenu(actor),
    auraEnd: (actor) => AuraManager.deactivate(actor),
    layOnHands: (actor) => RevelatorFeatures.useLayOnHands(actor),
    rescan: (actor) => FeatureDetector.scan(actor),
    rescanAll: () => FeatureDetector.scanAll(),
    getFlags: (actor) => actor.getFlag(MODULE_ID, "features"),
    virtuoso: (actor) => BardFeatures.useVirtuoso(actor),
    stepUp: (actor) => DancerFeatures.performStepUp(actor),
    /** API for Vagabond Crawler: get Step Up menu data for a dancer actor */
    getStepUpData: (actor) => {
      if (!actor) return null;
      const features = actor.getFlag(MODULE_ID, "features");
      if (!features?.dancer_stepUp) return null;
      // Get ally tokens on canvas
      const allyTokens = canvas.tokens?.placeables?.filter(t => {
        if (!t.actor || t.actor.id === actor.id) return false;
        return t.actor.type === "character";
      }) ?? [];
      return {
        hasDancer: true,
        hasChoreographer: !!features.dancer_choreographer,
        hasDoubleTime: !!features.dancer_doubleTime,
        allies: allyTokens.map(t => ({
          id: t.actor.id, name: t.actor.name, img: t.actor.img,
        })),
        /** Call this to trigger Step Up from the crawler with selected ally IDs */
        useStepUp: (allyIds) => DancerFeatures._executeStepUpFromTab(actor, allyIds, features),
      };
    },
    /** API for Vagabond Crawler: get Virtuoso menu data for a bard actor */
    getVirtuosoData: (actor) => {
      if (!actor) return null;
      const features = actor.getFlag(MODULE_ID, "features");
      if (!features?.bard_virtuoso) return null;
      return {
        hasBard: true,
        hasStarstruck: !!features.bard_starstruck,
        hasClimax: !!features.bard_climax,
        buffs: [
          { key: "valor", label: "Valor", desc: "Favor on Attacks & Casts" },
          { key: "resolve", label: "Resolve", desc: "Favor on Saves" },
          { key: "inspiration", label: "Inspiration", desc: "+d6 Healing" },
        ],
        /** Call this to trigger a Virtuoso buff from the crawler */
        useVirtuoso: (buffKey) => BardFeatures._useVirtuosoFromTab(actor, buffKey),
      };
    },
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
  DancerFeatures.registerHooks();
  DruidFeatures.registerHooks();
  AlchemistFeatures.registerHooks();
  FighterFeatures.registerHooks();
  GunslingerFeatures.registerHooks();
  HunterFeatures.registerHooks();
  LuminaryFeatures.registerHooks();
  MagusFeatures.registerHooks();
  MerchantFeatures.registerHooks();
  PugilistFeatures.registerHooks();
  RevelatorFeatures.registerHooks();
  RogueFeatures.registerHooks();
  SorcererFeatures.registerHooks();
  VanguardFeatures.registerHooks();
  WitchFeatures.registerHooks();
  WizardFeatures.registerHooks();
  FocusManager.registerHooks();

  // Patch character sheet for Beast Form panel injection
  PolymorphSheet.patchSheet();

  // Initialize beast cache from compendiums
  BeastCache.initialize();
  // Expose globally for polymorph manager API (used by Vagabond Crawler)
  globalThis._vceBeastCache = BeastCache;

  // Expose populate function for GM use: game.modules.get("vagabond-character-enhancer").populateBeasts()
  const mod = game.modules.get(MODULE_ID);
  if (mod) mod.populateBeasts = populateBeasts;

  // Scan all existing characters on first load
  FeatureDetector.scanAll();

  console.log(`${MODULE_ID} | Ready.`);
});
