/**
 * Vagabond Character Enhancer
 * Automates ancestry traits, class features, and perks for the Vagabond RPG system.
 */

import { MODULE_ID, log, getFeatures, combineFavor } from "./utils.mjs";
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

// Save source attack type. Set by handleSaveRoll patch so Spell Surge can check
// if the save was provoked by a Cast (vs melee/ranged).
export let _saveSourceAttackType = null;

// Direct damage source attack type. Set by handleApplyDirect patch so
// calculateFinalDamage can bypass armor for cast attacks.
export let _directSourceAttackType = null;

// Spell item ID for the current apply call. Set by handleApplyDirect /
// handleSaveRoll / handleApplySaveDamage so processCausedStatuses can look up
// whether the cast paid for Fx and gate effects accordingly.
let _currentApplySpellId = null;

// Cast-time useFx tracking. Keyed by `${actorId}:${spellId}`. Value is the
// boolean useFx state at the moment castSpell ran. Entries auto-expire after
// 5 minutes — long enough for a normal apply flow but bounded so stale records
// don't gate later casts.
const _castUseFxBySpell = new Map();
function _recordCastUseFx(actorId, spellId, useFx) {
  if (!actorId || !spellId) return;
  const key = `${actorId}:${spellId}`;
  _castUseFxBySpell.set(key, useFx);
  setTimeout(() => _castUseFxBySpell.delete(key), 5 * 60_000);
}
function _statusEntryMatches(a, b) {
  if (!a || !b || a.statusId !== b.statusId) return false;
  return (a.duration ?? null) === (b.duration ?? null)
    && (a.dieFormula ?? null) === (b.dieFormula ?? null);
}
function _filterStatusesUseFxOff(statuses, spell) {
  if (!Array.isArray(statuses) || !spell) return statuses;
  const normal = spell.system?.causedStatuses ?? [];
  const crit = spell.system?.critCausedStatuses ?? [];
  if (normal.length === 0) return statuses;
  return statuses.filter(s => {
    if (crit.some(c => _statusEntryMatches(c, s))) return true;       // crit-specific override → keep
    if (normal.some(n => _statusEntryMatches(n, s))) return false;    // normal Fx entry → gated
    return true;                                                       // coating / passive / NPC action → keep
  });
}

// Range hinder. Set by rollAttack patch when RangeValidator applies hinder
// (e.g. Thrown at Far range), consumed by buildAndEvaluateD20WithRollData.
let _rangeFavorHinder = "none";

// Brawl intent state. Set by rollWeapon patch, consumed by renderChatMessage.
import { BrawlIntent, setBrawlIntent, resetBrawlIntent } from "./brawl/brawl-intent.mjs";

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
import { MonkFeatures } from "./class-features/monk.mjs";
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
import { GoldSinkSheet, buyFavoriteItem } from "./merchant/gold-sink-sheet.mjs";
import { BeastCache } from "./polymorph/beast-cache.mjs";
import { populateBeasts } from "./polymorph/populate-beasts.mjs";
import { DrakenFeatures } from "./ancestry-features/draken.mjs";
import { ImbueManager } from "./spell-features/imbue-manager.mjs";
import { BlessManager } from "./spell-features/bless-manager.mjs";
import { WardManager } from "./spell-features/ward-manager.mjs";
import { EffectOnlyHandler } from "./spell-features/effect-only-handler.mjs";
import { SummonerFeatures } from "./class-features/summoner.mjs";
import { FamiliarFeatures } from "./perk-features/familiar.mjs";
import { registerSocketRelay } from "./socket-relay.mjs";
import { RangeValidator } from "./range-validator.mjs";
import { patchedHandleSaveRoll, patchedHandleSaveReminderRoll } from "./companion/save-routing-patch.mjs";
import { CompanionManagerTab } from "./companion/companion-manager-tab.mjs";
import { CompanionTerminationManager } from "./companion/companion-termination.mjs";
import { GatherCompanions } from "./companion/gather-companions.mjs";
// Phase 2 spell adapters
import { BeastSpell } from "./spell-features/beast-spell.mjs";
import { RaiseSpell } from "./spell-features/raise-spell.mjs";
import { AnimateSpell } from "./spell-features/animate-spell.mjs";
// Phase 2 perk adapters
import { AnimalCompanion } from "./perk-features/animal-companion.mjs";
import { ReanimatorPerk } from "./perk-features/reanimator.mjs";
import { ConjurerPerk } from "./perk-features/conjurer.mjs";
import { RaisePerks } from "./perk-features/raise-perks.mjs";

/* -------------------------------------------- */
/*  Chat Context Menu (must register at top      */
/*  level before ChatLog renders)                */
/* -------------------------------------------- */

Hooks.on("getChatMessageContextOptions", (app, options) => {
  const hasRolls = (li) => {
    const msg = game.messages.get(li.dataset.messageId);
    return msg?.rolls?.length > 0;
  };

  options.push(
    {
      name: "Apply Damage",
      icon: '<i class="fas fa-heart-crack"></i>',
      condition: (li) => game.user.isGM && hasRolls(li),
      callback: (li) => _applyRollToTargets(li, "damage")
    },
    {
      name: "Apply Half Damage",
      icon: '<i class="fas fa-shield-halved"></i>',
      condition: (li) => game.user.isGM && hasRolls(li),
      callback: (li) => _applyRollToTargets(li, "half")
    },
    {
      name: "Apply Healing",
      icon: '<i class="fas fa-heart-pulse"></i>',
      condition: (li) => game.user.isGM && hasRolls(li),
      callback: (li) => _applyRollToTargets(li, "healing")
    }
  );
});

/* -------------------------------------------- */
/*  NPC Sheet Header — Set Save Controller btn  */
/* -------------------------------------------- */

Hooks.on("getHeaderControlsActorSheetV2", (app, controls) => {
  const actor = app.document;
  // Show on NPC and character actors. Character-type hirelings need routing
  // too — per RAW, their saves use the hiring Hero's Leadership Skill.
  if (!actor || (actor.type !== "npc" && actor.type !== "character")) return;
  controls.unshift({
    icon: "fas fa-people-arrows",
    action: "vce-set-save-controller",
    label: "Set Save Controller\u2026",
    onClick: async () => {
      const { ControllerDialog } = await import("./companion/controller-dialog.mjs");
      new ControllerDialog(actor).render(true);
    }
  });
});

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

  game.settings.register(MODULE_ID, "enforceWeaponRange", {
    name: "Enforce Weapon Range",
    hint: "Block attacks on out-of-range targets. Auto-applies Hinder for Ranged weapons at Close range and Thrown weapons at Far range. Respects Akimbo Trigger perk.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
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

  game.settings.register(MODULE_ID, "goldSinkSellRatio", {
    name: "Gold Sink Sell Ratio (%)",
    hint: "Percentage of base cost that items sell for in the Merchant Gold Sink tab. Default 100%.",
    scope: "world",
    config: true,
    type: Number,
    range: { min: 0, max: 100, step: 5 },
    default: 100
  });

  console.log(`${MODULE_ID} | Initialized.`);
});

/* -------------------------------------------- */
/*  Ready                                       */
/* -------------------------------------------- */

Hooks.once("ready", async () => {
  try {
    const { VagabondDamageHelper } = await import("/systems/vagabond/module/helpers/damage-helper.mjs");

    // Route friendly NPC saves through their controller PC.
    // Flag schema: scripts/companion/save-routing.mjs
    // Patch body:  scripts/companion/save-routing-patch.mjs
    // NOTE: Must run before the handleSaveRoll wrapper below (~line 807),
    // which captures this assignment as its `origHandleSaveRoll`.
    // Do not reorder without also updating that wrapper.
    CONFIG.VAGABOND = CONFIG.VAGABOND || {};
    CONFIG.VAGABOND._damageHelper = VagabondDamageHelper;
    VagabondDamageHelper.handleSaveRoll = patchedHandleSaveRoll;
    VagabondDamageHelper.handleSaveReminderRoll = patchedHandleSaveReminderRoll;
    log("save-routing", "patched handleSaveRoll + handleSaveReminderRoll");

    // --- calculateFinalDamage: Cast armor bypass + Rage DR + Tempest Within + Apex Predator ---
    const origCalcFinal = VagabondDamageHelper.calculateFinalDamage;
    VagabondDamageHelper.calculateFinalDamage = function (actor, damage, damageType, attackingWeapon = null, sneakDice = 0) {
      // Draconic Resilience: halve matching damage before armor/immune/weak
      const drakenType = actor.getFlag?.(MODULE_ID, "draken_draconicResilienceType");
      if (drakenType && damageType?.toLowerCase() === drakenType) {
        const original = damage;
        damage = Math.floor(damage / 2);
        const reduction = original - damage;
        log("Draken", `Draconic Resilience (${drakenType}): ${original} → ${damage} (−${reduction})`);
        const typeLabel = drakenType.charAt(0).toUpperCase() + drakenType.slice(1);
        ChatMessage.create({
          content: `<div class="vagabond-chat-card-v2" data-card-type="apply-result">
            <div class="card-body"><section class="content-body">
              <div class="card-description" style="text-align:center;">
                <strong>${actor.name}</strong> — <em>Draconic Resilience (${typeLabel})</em><br>
                ${typeLabel} damage halved: ${original} → ${damage} (−${reduction})
              </div>
            </section></div>
          </div>`,
          speaker: ChatMessage.getSpeaker({ actor })
        });
      }

      let result = origCalcFinal.call(this, actor, damage, damageType, attackingWeapon, sneakDice);

      // Silver weakness fix: the system skips metal checks for typeless ("-") damage.
      // If the weapon is silvered and the target is weak to silver, bypass armor.
      // (Extra weakness die is added in the rollDamage pre-hook, not here.)
      if (damageType === "-" && attackingWeapon?.system?.metal) {
        const weaponMetal = attackingWeapon.system.metal;
        const weaknesses = actor.system?.weaknesses || [];
        if (weaknesses.includes(weaponMetal)) {
          result = damage; // Bypass armor: restore full damage
          log("Bless", `Silver weakness on ${actor.name}: armor bypassed (${weaponMetal})`);
        }
      }

      // Cast attacks bypass armor unless target wears Orichalcum
      // ('cast' = player spells; 'castClose'/'castRanged' = NPC actions before normalization)
      const origAttackType = _directSourceAttackType || _saveSourceAttackType;
      if (origAttackType?.startsWith('cast')) {
        const equippedArmor = actor.items?.find(i => {
          const isArmor = (i.type === 'armor') ||
            (i.type === 'equipment' && i.system.equipmentType === 'armor');
          return isArmor && i.system.equipped;
        });
        if (!equippedArmor || equippedArmor.system.metal !== 'orichalcum') {
          const armorRating = actor.system.armor || 0;
          result = Math.min(result + armorRating, damage); // Add back subtracted armor
        }
      }

      // Sneak Attack: armor penetration (reduce armor by sneak dice count)
      const sneakCtx = { actor, result, damage };
      RogueFeatures.onCalculateFinalDamage(sneakCtx);
      result = sneakCtx.result;

      const features = getFeatures(actor);

      // Indestructible (Vanguard L10): Immune to attack damage while not
      // Incapacitated and Armor >= 1. Only negates melee/ranged attack damage —
      // cast (spell) damage and environmental damage still applies.
      if (features?.vanguard_indestructible) {
        const atkType = _directSourceAttackType || _saveSourceAttackType;
        const isMeleeOrRanged = atkType === "melee" || atkType === "ranged";
        if (isMeleeOrRanged) {
          const armor = actor.system?.armor ?? 0;
          const isIncapacitated = actor.statuses?.has("incapacitated")
            || actor.statuses?.has("unconscious")
            || actor.statuses?.has("paralyzed");
          if (!isIncapacitated && armor >= 1) {
            log("Vanguard", `Indestructible: ${actor.name} immune to ${atkType} damage (Armor ${armor})`);
            ChatMessage.create({
              content: `<div class="vagabond-chat-card-v2" data-card-type="indestructible">
                <div class="card-body"><section class="content-body">
                  <div class="card-description" style="text-align:center;">
                    <i class="fas fa-shield-halved"></i> <strong>${actor.name}</strong> — <em>Indestructible</em><br>
                    Immune to attack damage! (Armor: ${armor})
                  </div>
                </section></div>
              </div>`,
              speaker: ChatMessage.getSpeaker({ actor })
            });
            return 0;
          }
        }
      }

      // Apex Predator: check if this target is marked by the hunter dealing the damage
      const apexCtx = { actor, result, damage, damageType, damageSourceActorId: _damageSourceActorId };
      HunterFeatures.onCalculateFinalDamage(apexCtx);
      result = apexCtx.result;

      // Widdershins: hex target is Weak to witch's damage (bypass armor, not immunity)
      const widdCtx = { actor, result, damage, damageType, damageSourceActorId: _damageSourceActorId };
      WitchFeatures.onCalculateFinalDamage(widdCtx);
      result = widdCtx.result;

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


    // --- _getDamageSourceDieSize: Fix weakness die not accounting for weapon skill die size bonus ---
    // System bug: for weapons, _getDamageSourceDieSize returns the raw formula die size without
    // adding rangedDamageDieSizeBonus / meleeDamageDieSizeBonus etc. This means the silver weakness
    // extra die ignores Marksmanship and similar perks. Spells correctly add spellDamageDieSizeBonus.
    const origGetDamageSourceDieSize = VagabondDamageHelper._getDamageSourceDieSize;
    VagabondDamageHelper._getDamageSourceDieSize = function (sourceItem, actionIdx, sourceActor) {
      const baseSize = origGetDamageSourceDieSize.call(this, sourceItem, actionIdx, sourceActor);
      // Only fix weapon items (spells are already handled correctly by the system)
      if (sourceItem && sourceItem.type !== "spell" && sourceActor?.type === "character") {
        const skillKey = sourceItem.system?.weaponSkill;
        if (skillKey) {
          const bonus = sourceActor.system[`${skillKey}DamageDieSizeBonus`] || 0;
          if (bonus) {
            log("Silver", `_getDamageSourceDieSize: d${baseSize}→d${baseSize + bonus} (${skillKey} bonus +${bonus})`);
            return baseSize + bonus;
          }
        }
      }
      return baseSize;
    };
    console.log(`${MODULE_ID} | Patched _getDamageSourceDieSize (weakness die size fix).`);

    // --- _removeHighestDie: Evasive / Impetus remove 2 dice instead of 1 ---
    // The system's _removeHighestDie always removes exactly 1 highest die on a
    // passed Dodge save. Dancer Evasive (L2) and Monk Impetus (L4) upgrade this
    // to 2 dice. We patch the method to remove N dice based on a module-level
    // flag set by the handleSaveRoll wrapper.
    const origRemoveHighestDie = VagabondDamageHelper._removeHighestDie;
    VagabondDamageHelper._removeHighestDie = function (rollTermsData) {
      const count = VagabondDamageHelper._vceRemoveDiceCount || 1;
      if (count <= 1) return origRemoveHighestDie.call(this, rollTermsData);

      // Remove N highest dice
      let total = rollTermsData.total;
      const allResults = [];
      for (const term of rollTermsData.terms) {
        if (term.type === "Die" && term.results) {
          for (const result of term.results) {
            allResults.push(result.result);
          }
        }
      }

      // If dice count <= remove count, save completely negates damage
      if (allResults.length <= count) return 0;

      // Sort descending and remove the N highest
      allResults.sort((a, b) => b - a);
      let reduction = 0;
      for (let i = 0; i < count; i++) {
        reduction += allResults[i];
      }
      return Math.max(0, total - reduction);
    };
    console.log(`${MODULE_ID} | Patched _removeHighestDie.`);

    // Silver weakness: extra die is added in item.rollDamage() pre-hook (Crawler + auto-roll).
    // Armor bypass is in calculateFinalDamage. No rollDamageFromButton patch needed.

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

        // Stash current targets on the weapon for rollDamage to use
        // (game.user.targets may be cleared by the time rollDamage fires on hit)
        this._vceAttackTargets = Array.from(game.user.targets);

        // Imbue: force-auto-roll is deferred to ImbueManager.onPostRollAttack
        // (hit path) so we don't auto-roll damage on a miss.

        // Force auto-roll damage for Monk Finesse attacks so die escalation
        // goes through our patched item.rollDamage() instead of rollDamageFromButton()
        if (this.system?.weaponSkill === "finesse" && getFeatures(actor)?.monk_martialArts) {
          VagabondDamageHelper._vceForceRollDamage = true;
        }

        // Brawl/Shield intent dialog — show BEFORE the roll so Favor from
        // Shove/Grapple intent (Bully, Beefy) can modify the attack.
        // This runs at the item.rollAttack level so it works from BOTH the
        // character sheet AND the vagabond-crawler action strip.
        const isBrawlOrShield = this.system?.properties?.some(p =>
          ["brawl", "shield"].includes(p.toLowerCase()));
        if (isBrawlOrShield) {
          const { TargetHelper } = await import("/systems/vagabond/module/helpers/target-helper.mjs");
          const targetsAtRollTime = TargetHelper.captureCurrentTargets();
          if (targetsAtRollTime.length > 0) {
            const dialogResult = await BrawlIntent.showIntentDialog(actor, this, targetsAtRollTime, ctx.features);
            if (dialogResult === null) return null; // cancelled
            setBrawlIntent({ ...dialogResult, targetsAtRollTime });
          }
        }

        // Pre-roll handlers (order matters)
        // Range validation FIRST — blocks attack if target is out of range
        if (RangeValidator.onPreRollAttack(ctx)) return null;

        await BarbarianFeatures.onPreRollAttack(ctx);   // auto-berserk
        BardFeatures.onPreRollAttack(ctx);               // Virtuoso Valor
        FighterFeatures.onPreRollAttack(ctx);             // Momentum
        await GunslingerFeatures.onPreRollAttack(ctx);   // Quick Draw + Deadeye
        await HunterFeatures.onPreRollAttack(ctx);       // Hunter's Mark 2d20kh/3d20kh
        RevelatorFeatures.onPreRollAttack(ctx);           // Holy Diver favor
        BarbarianFeatures.onPreRollAttackBloodthirsty(ctx); // Bloodthirsty
        AlchemistFeatures.onPreRollAttack(ctx);           // Consumable weapon flag
        await MonkFeatures.onPreRollAttack(ctx);            // Martial Arts: Keen/Cleave
        BrawlIntent.onPreRollAttack(ctx);                 // Bully Favor for Grapple/Shove

        // Hireling routing: if the wielder is flagged as a hireling, the attack
        // d20 + difficulty must use the hiring Hero's Leadership Skill per RAW
        // (Core Rulebook — Bestiary: "Use the Hero's Leadership Skill for any
        // Checks and Saves the Hireling makes that Round"). The weapon and its
        // damage/properties still belong to the hireling — only the skill roll
        // is substituted. See scripts/companion/save-routing.mjs for flag schema.
        let _vceHirelingRoutingRestore = null;
        try {
          const ctrlId = actor?.getFlag?.(MODULE_ID, "controllerActorId");
          const ctrlType = actor?.getFlag?.(MODULE_ID, "controllerType");
          if (ctrlId && ctrlType === "hireling") {
            const controller = game.actors.get(ctrlId);
            if (controller) {
              const origWeaponSkill = this.system.weaponSkill;
              this.system.weaponSkill = "leadership";
              _vceHirelingRoutingRestore = () => {
                this.system.weaponSkill = origWeaponSkill;
              };
              actor = controller; // swap actor for origRollAttack's rollData lookup
            }
          }
        } catch (e) {
          log("save-routing", "Hireling attack routing pre-check failed", e);
        }

        // Stash actor for Climax/Choreographer in buildAndEvaluateD20WithRollData
        _currentRollActor = actor;
        // Pass range/pre-roll hinder through to buildAndEvaluateD20WithRollData
        // since the system's rollAttack ignores the favorHinder parameter
        _rangeFavorHinder = ctx.favorHinder;
        try {
          const result = await origRollAttack.call(this, actor);
          _currentRollActor = null;
          _rangeFavorHinder = "none";
          if (_vceHirelingRoutingRestore) { _vceHirelingRoutingRestore(); _vceHirelingRoutingRestore = null; }

          // Post-roll handlers
          ctx.rollResult = result;
          await GunslingerFeatures.onPostRollAttack(ctx);
          await HunterFeatures.onPostRollAttack(ctx);
          RogueFeatures.onPostRollAttack(ctx);              // Sneak Attack: stash dice on item
          if (this._vceSneakAttack) VagabondDamageHelper._vceForceRollDamage = true; // Force auto-roll for sneak dice
          await BrawlIntent.onPostRollAttack(ctx);        // Auto-execute Grapple/Shove on hit
          await MonkFeatures.onPostRollAttack(ctx);         // Martial Arts: Keen cleanup
          await ImbueManager.onPostRollAttack(ctx);        // Consume imbue after attack

          return result;
        } catch (e) {
          _currentRollActor = null;
          _rangeFavorHinder = "none";
          VagabondDamageHelper._vceForceRollDamage = false;
          if (_vceHirelingRoutingRestore) { _vceHirelingRoutingRestore(); _vceHirelingRoutingRestore = null; }
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
        await MonkFeatures.onPreRollDamage(ctx);           // Martial Arts: die escalation
        RogueFeatures.onPreRollDamage(ctx);                // Sneak Attack: inject d4s

        // Silver/metal weakness: add extra die if the targeted enemy is weak to weapon's metal.
        // item.rollDamage() never checks weakness — it's only checked in rollDamageFromButton
        // and handleApplyDirect. We add the die here so it's visible in the roll.
        // Also flag the item so handleApplyDirect doesn't double-add.
        let silverOrigDamage;
        if (this.system?.metal && this.system.metal !== "none" && this.system.metal !== "common") {
          const targets = this._vceAttackTargets || Array.from(game.user.targets);
          const hasWeakTarget = targets.some(t =>
            t.actor?.system?.weaknesses?.includes(this.system.metal)
          );
          if (hasWeakTarget) {
            const formula = this.system.currentDamage || "d6";
            const baseDieSize = VagabondDamageHelper._extractDieSize?.(formula) || 6;
            // Account for weapon skill die size bonus (e.g. Marksmanship +2 for ranged)
            const skillKey = this.system?.weaponSkill;
            const dieSizeBonus = skillKey ? (actor.system[`${skillKey}DamageDieSizeBonus`] || 0) : 0;
            const dieSize = baseDieSize + dieSizeBonus;
            silverOrigDamage = this.system.currentDamage;
            this.system.currentDamage = `${formula} + 1d${dieSize}`;
            if (dieSizeBonus) log("Silver", `Weakness die upgraded d${baseDieSize}→d${dieSize} (${skillKey}DamageDieSizeBonus +${dieSizeBonus})`);
          }
        }

        // Imbue: add spell damage dice + spell-specific damage bonuses to the
        // weapon formula so they roll together as a single damage instance
        // (armor applied once). The spell's damage type is surfaced on the chat
        // card by ImbueManager's createChatMessage hook for visibility; weakness
        // vs the spell's type is also pre-rolled here when applicable.
        let imbueOrigDamage;
        const imbue = actor.getFlag(MODULE_ID, "imbue");
        if (imbue && imbue.damageDice > 0 && this.id === imbue.weaponId) {
          const formula = this.system.currentDamage || "d6";
          const dieSize = imbue.dieSize || 6;
          let addition = `${imbue.damageDice}d${dieSize}`;

          const spellFlat = actor.system?.universalSpellDamageBonus || 0;
          let spellDice = actor.system?.universalSpellDamageDice || "";
          if (Array.isArray(spellDice)) spellDice = spellDice.filter(d => !!d).join(" + ");
          if (spellFlat !== 0) addition += ` + ${spellFlat}`;
          if (typeof spellDice === "string" && spellDice.trim() !== "") addition += ` + ${spellDice}`;

          // Pre-roll a weakness die if all targets are weak to the spell's damage type
          // (but NOT already weak to the weapon's type — that case is covered by the
          // system's own weakness handling at apply time).
          const spellType = (imbue.damageType || "-").toLowerCase();
          const weaponType = (this.system?.currentDamageType || "physical").toLowerCase();
          if (spellType !== "-" && spellType !== weaponType) {
            const targets = this._vceAttackTargets || Array.from(game.user.targets);
            const targetActors = targets.map(t => t.actor).filter(Boolean);
            const allWeakToSpellType = targetActors.length > 0
              && targetActors.every(a => (a.system?.weaknesses || []).includes(spellType));
            const anyWeakToWeaponType = targetActors.some(a =>
              (a.system?.weaknesses || []).includes(weaponType)
              || (this.system?.metal && (a.system?.weaknesses || []).includes(this.system.metal)));
            if (allWeakToSpellType && !anyWeakToWeaponType) {
              addition += ` + 1d${dieSize}`;
              this._vceImbueWeaknessPreRolled = true;
            }
          }

          imbueOrigDamage = this.system.currentDamage;
          this.system.currentDamage = `${formula} + ${addition}`;
          log("Imbue", `${actor.name}: +${addition} (${imbue.spellName}) added to ${formula}`);
        }

        // Exalt: +1 per damage die (+2 vs Undead/Hellspawn) — added to roll formula.
        // Runs AFTER silver so its bonus die is counted.
        let exaltOrigDamage;
        const focusedIds = actor.system?.focus?.spellIds || [];
        const hasExaltAura = !!actor.effects.find(e => e.getFlag(MODULE_ID, "auraSpell") === "Exalt");
        const hasExaltFocus = focusedIds.some(id => actor.items.get(id)?.name?.toLowerCase() === "exalt");
        if (hasExaltAura || hasExaltFocus) {
          const formula = this.system.currentDamage || "d6";
          const numDice = VagabondDamageHelper._countDiceInFormula(formula);
          if (numDice > 0) {
            // Check if any target is Undead or Hellspawn
            const targets = this._vceAttackTargets || Array.from(game.user.targets);
            const isDoubled = targets.some(t => {
              const bt = t.actor?.system?.beingType || "";
              return ["Undead", "Hellspawn"].includes(bt);
            });
            const bonusPerDie = isDoubled ? 2 : 1;
            const exaltBonus = numDice * bonusPerDie;
            exaltOrigDamage = this.system.currentDamage;
            this.system.currentDamage = `${formula} + ${exaltBonus}`;
            log("Exalt", `${actor.name}: +${bonusPerDie} × ${numDice} dice = +${exaltBonus} added to ${formula}${isDoubled ? " (vs Undead/Hellspawn)" : ""}`);
          }
        }

        try {
          const damageRoll = await origRollDamage.call(this, actor, isCritical, statKey);
          // Flag the roll as weakness-pre-rolled so handleApplyDirect doesn't add another die
          if ((silverOrigDamage !== undefined || this._vceImbueWeaknessPreRolled) && damageRoll) {
            damageRoll._weaknessPreRolled = true;
          }
          // Sneak Attack: post-roll cleanup + chat notification
          RogueFeatures.onPostRollDamage(ctx);
          return damageRoll;
        } finally {
          // Restore in reverse order of application (last applied = first restored)
          // Restore Exalt-modified damage
          if (exaltOrigDamage !== undefined) {
            this.system.currentDamage = exaltOrigDamage;
          }
          // Restore imbue-modified damage
          if (imbueOrigDamage !== undefined) {
            this.system.currentDamage = imbueOrigDamage;
          }
          this._vceImbueWeaknessPreRolled = false;
          // Restore silver-modified damage
          if (silverOrigDamage !== undefined) {
            this.system.currentDamage = silverOrigDamage;
          }
          // Restore Sneak Attack-modified damage
          if (ctx.sneakOrigDamage !== undefined) {
            this.system.currentDamage = ctx.sneakOrigDamage;
          }
          if (ctx.origCanExplode !== undefined) {
            this.system.canExplode = ctx.origCanExplode;
            this.system.explodeValues = ctx.origExplodeValues;
          }
          if (ctx.origDamage !== undefined) {
            this.system.currentDamage = ctx.origDamage;
          }
          this._vceRangedCrit = false;
          delete this._vceAttackTargets;
        }
      };
      console.log(`${MODULE_ID} | Patched rollDamage.`);
    }

    // --- item.roll: Dispatch to Alchemist + Bard ---
    if (VagabondItem?.prototype?.roll) {
      const origItemRoll = VagabondItem.prototype.roll;
      VagabondItem.prototype.roll = async function (event, targetsAtRollTime = []) {
        const ctx = { item: this, actor: this.actor, event, targets: targetsAtRollTime, handled: false };

        // Alchemical weapon redirect
        await AlchemistFeatures.onPreItemRoll(ctx);
        if (ctx.handled) return ctx.result;

        // Inspiration healing
        await BardFeatures.onPreItemRoll(ctx);

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
      // Apply range hinder (e.g. Thrown at Far range) from rollAttack pre-roll handlers
      if (_rangeFavorHinder !== "none") {
        favorHinder = combineFavor(favorHinder, _rangeFavorHinder);
      }
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

      // Snapshot target HP before healing for Overheal/Ever-Cure detection
      const preHealHP = new Map();
      const targetActors = [];
      if (ctx.damageType === "healing") {
        const storedTargets = VagabondDamageHelper._getTargetsFromButton(button);
        const tokens = VagabondDamageHelper._resolveStoredTargets(storedTargets);
        for (const token of tokens) {
          if (token.actor) {
            preHealHP.set(token.actor.id, token.actor.system?.health?.value ?? 0);
            targetActors.push(token.actor);
          }
        }
      }

      const result = await origHandleRestorative.call(this, button);

      // Post-heal: trigger Overheal + Ever-Cure
      if (targetActors.length > 0) {
        await LuminaryFeatures.onPostHandleRestorative(ctx, preHealHP, targetActors);
      }

      return result;
    };
    console.log(`${MODULE_ID} | Patched handleApplyRestorative.`);

    // --- handleSaveRoll / handleSaveReminderRoll: Track save + damage source actor ---
    // Wraps the system's save-roll entry points to capture the attacker's actor ID
    // before _rollSave and calculateFinalDamage fire, so Overwatch and Apex Predator
    // can check whether the effect was provoked by / damage dealt by a specific actor.
    // NOTE: Layers on top of patchedHandleSaveRoll (installed ~line 250). The
    // `origHandleSaveRoll` captured here is VCE's save-routing patch, not the
    // raw system method. Keep install order: save-routing first, this wrapper second.
    const origHandleSaveRoll = VagabondDamageHelper.handleSaveRoll;
    VagabondDamageHelper.handleSaveRoll = async function (button, event = null) {
      _saveSourceActorId = button.dataset.actorId || null;
      _damageSourceActorId = button.dataset.actorId || null;
      _saveSourceAttackType = button.dataset.attackType || null;
      _currentApplySpellId = button.dataset.itemId || null;
      const saveSourceActor = game.actors.get(button.dataset.actorId);
      const saveActionIdx = button.dataset.actionIndex;
      const saveAction = (saveActionIdx !== '' && saveActionIdx != null)
        ? saveSourceActor?.system?.actions?.[parseInt(saveActionIdx)] : null;
      if (saveAction?.attackType?.startsWith('cast')) _saveSourceAttackType = saveAction.attackType;

      // Evasive / Impetus: set remove-dice count for Reflex saves
      // Check ALL targets for the feature (single-target saves are most common)
      const saveType = button.dataset.saveType;
      if (saveType === "reflex") {
        try {
          const targetsRaw = button.dataset.targets;
          if (targetsRaw) {
            const targetsData = JSON.parse(targetsRaw);
            for (const t of targetsData) {
              const targetActor = t.actorId ? game.actors.get(t.actorId) : null;
              if (!targetActor) continue;
              const feats = targetActor.getFlag(MODULE_ID, "features");
              if (feats?.monk_impetus || feats?.dancer_evasive || feats?.rogue_evasive) {
                VagabondDamageHelper._vceRemoveDiceCount = 2;
                break;
              }
            }
          }
        } catch (e) { /* Don't crash the save flow */ }
      }

      // Bless d4: apply BEFORE origHandleSaveRoll reads the difficulty
      const _blessContexts = [];
      try {
        const targetsRaw = button.dataset.targets;
        if (targetsRaw) {
          const targetsData = JSON.parse(targetsRaw);
          for (const t of targetsData) {
            const targetActor = t.actorId ? game.actors.get(t.actorId) : null;
            if (!targetActor) continue;
            const ctx = { actor: targetActor, saveType };
            await BlessManager.onPreRollSave(ctx);
            if (ctx._blessApplied) _blessContexts.push(ctx);
          }
        }
      } catch (e) { /* Don't let Bless code crash the save flow */ }

      try {
        // Fix Cleave save path: all targets take half damage (RAW: "half damage to two targets")
        const cleaveSaveSource = game.actors.get(button.dataset.actorId);
        const cleaveSaveItem = cleaveSaveSource?.items.get(button.dataset.itemId);
        const hasCleaveS = cleaveSaveItem?.system?.properties?.includes('Cleave');
        let cleaveSaveTargets;
        try { cleaveSaveTargets = JSON.parse((button.dataset.targets || '[]').replace(/&quot;/g, '"')); } catch { cleaveSaveTargets = []; }

        if (hasCleaveS && cleaveSaveTargets.length > 1) {
          const fullDmg = parseInt(button.dataset.damageAmount);
          const halfDmg = Math.floor(fullDmg / 2);

          // Copy dataset explicitly (DOMStringMap spread can be unreliable)
          const baseSaveData = {};
          for (const key in button.dataset) baseSaveData[key] = button.dataset[key];

          // Cleave = "half damage to two targets" — all targets get half.
          // Odd damage: first target gets ceil, rest get floor (e.g., 7 → 4 + 3)
          // Minimum 1 damage per target (1 damage Cleave = 1 to each)
          const ceilHalfS = Math.max(1, Math.ceil(fullDmg / 2));
          const floorHalfS = Math.max(1, Math.floor(fullDmg / 2));

          // First target: ceiling half
          const firstSaveMock = { dataset: { ...baseSaveData, targets: JSON.stringify([cleaveSaveTargets[0]]), damageAmount: String(ceilHalfS) } };
          await origHandleSaveRoll.call(this, firstSaveMock, event);

          // Remaining targets: floor half
          for (let i = 1; i < cleaveSaveTargets.length; i++) {
            const mock = { dataset: { ...baseSaveData, targets: JSON.stringify([cleaveSaveTargets[i]]), damageAmount: String(floorHalfS) } };
            await origHandleSaveRoll.call(this, mock, event);
          }
          log("Cleave", `Save path: ${ceilHalfS} to first, ${floorHalfS} to ${cleaveSaveTargets.length - 1} others`);
          return;
        }

        // Ward: snapshot HP before damage for accurate heal-back capping
        try { WardManager.snapshotHP(button); } catch (e) { /* ignore */ }

        await origHandleSaveRoll.call(this, button, event);

        // Ward: prompt caster for reactive damage reduction AFTER save resolves and damage applies
        try { await WardManager.onPostDamage(button); } catch (e) { /* Don't crash save flow */ }
        return;
      } finally {
        for (const ctx of _blessContexts) await BlessManager.onPostRollSave(ctx);
        _saveSourceActorId = null; _damageSourceActorId = null; _saveSourceAttackType = null;
        _currentApplySpellId = null;
        VagabondDamageHelper._vceRemoveDiceCount = 0;
      }
    };
    const origHandleSaveReminderRoll = VagabondDamageHelper.handleSaveReminderRoll;
    VagabondDamageHelper.handleSaveReminderRoll = async function (button, event = null) {
      _saveSourceActorId = button.dataset.actorId || null;
      _damageSourceActorId = button.dataset.actorId || null;
      _saveSourceAttackType = button.dataset.attackType || null;
      _currentApplySpellId = button.dataset.itemId || null;
      const saveReminderActor = game.actors.get(button.dataset.actorId);
      const saveReminderIdx = button.dataset.actionIndex;
      const saveReminderAction = (saveReminderIdx !== '' && saveReminderIdx != null)
        ? saveReminderActor?.system?.actions?.[parseInt(saveReminderIdx)] : null;
      if (saveReminderAction?.attackType?.startsWith('cast')) _saveSourceAttackType = saveReminderAction.attackType;
      try { return await origHandleSaveReminderRoll.call(this, button, event); }
      finally { _saveSourceActorId = null; _damageSourceActorId = null; _saveSourceAttackType = null; _currentApplySpellId = null; }
    };
    console.log(`${MODULE_ID} | Patched handleSaveRoll + handleSaveReminderRoll.`);

    // --- handleApplySaveDamage: Track deferred-save apply context for Fx gating ---
    const origHandleApplySaveDamage = VagabondDamageHelper.handleApplySaveDamage;
    VagabondDamageHelper.handleApplySaveDamage = async function (button) {
      _damageSourceActorId = button.dataset.sourceActorId || null;
      _currentApplySpellId = button.dataset.sourceItemId || null;
      try { return await origHandleApplySaveDamage.call(this, button); }
      finally { _damageSourceActorId = null; _currentApplySpellId = null; }
    };
    console.log(`${MODULE_ID} | Patched handleApplySaveDamage.`);

    // --- StatusHelper.processCausedStatuses: Gate spell Effects when useFx was off ---
    // The system reads spell.causedStatuses unconditionally when applying damage —
    // so a spell cast without paying the +1 Mana Fx surcharge still fires its Effect.
    // We intercept here and strip normal Fx entries for the active cast, keeping
    // crit-specific overrides so a crit without Fx still triggers the crit effect.
    const { StatusHelper } = await import("/systems/vagabond/module/helpers/status-helper.mjs");
    const origProcessCausedStatuses = StatusHelper.processCausedStatuses;
    StatusHelper.processCausedStatuses = async function (targetActor, statuses, damageWasBlocked, sourceName = '', options = {}) {
      const sourceActorId = _damageSourceActorId || _saveSourceActorId;
      const spellId = _currentApplySpellId;
      if (sourceActorId && spellId) {
        const key = `${sourceActorId}:${spellId}`;
        const useFx = _castUseFxBySpell.get(key);
        if (useFx === false) {
          const spell = game.actors.get(sourceActorId)?.items.get(spellId);
          if (spell?.type === "spell") {
            const before = statuses?.length ?? 0;
            statuses = _filterStatusesUseFxOff(statuses, spell);
            const after = statuses?.length ?? 0;
            if (before !== after) log("Spell Fx", `Gated ${before - after} Effect status(es) for ${spell.name} — cast without Fx`);
          }
        }
      }
      return origProcessCausedStatuses.call(this, targetActor, statuses, damageWasBlocked, sourceName, options);
    };
    console.log(`${MODULE_ID} | Patched StatusHelper.processCausedStatuses (Fx gating).`);

    // --- handleApplyDirect: Track damage source + fix Cleave split (full/half, not even) ---
    const origHandleApplyDirect = VagabondDamageHelper.handleApplyDirect;
    VagabondDamageHelper.handleApplyDirect = async function (button) {
      _damageSourceActorId = button.dataset.actorId || null;
      _currentApplySpellId = button.dataset.itemId || null;
      // Attack-type detection priority:
      //   1. NPC action attackType (preserves unnormalized 'castClose'/'castRanged')
      //   2. button.dataset.attackType (set on save buttons, NOT on vagabond-apply-direct-button)
      //   3. Source item type === 'spell' → treat as 'cast' (covers player spell direct-apply,
      //      where the system omits data-attack-type on the apply button)
      _directSourceAttackType = button.dataset.attackType || null;
      const directSourceActor = game.actors.get(button.dataset.actorId);
      const directActionIdx = button.dataset.actionIndex;
      const directAction = (directActionIdx !== '' && directActionIdx != null)
        ? directSourceActor?.system?.actions?.[parseInt(directActionIdx)] : null;
      if (directAction?.attackType?.startsWith('cast')) {
        _directSourceAttackType = directAction.attackType;
      } else if (!_directSourceAttackType && button.dataset.itemId) {
        const directSourceItem = directSourceActor?.items.get(button.dataset.itemId);
        if (directSourceItem?.type === 'spell') _directSourceAttackType = 'cast';
      }

      try {
        // Fix Cleave: system splits evenly, RAW is full to first + half to rest
        const sourceItem = directSourceActor?.items.get(button.dataset.itemId);
        const hasCleave = sourceItem?.system?.properties?.includes('Cleave');
        let targets;
        try { targets = JSON.parse((button.dataset.targets || '[]').replace(/&quot;/g, '"')); } catch { targets = []; }

        if (hasCleave && targets.length > 1) {
          const fullDamage = parseInt(button.dataset.damageAmount);
          const halfDamage = Math.floor(fullDamage / 2);

          // Copy dataset explicitly (DOMStringMap spread can be unreliable)
          const baseData = {};
          for (const key in button.dataset) baseData[key] = button.dataset[key];

          // Cleave = "half damage to two targets" — all targets get half.
          // Odd damage: first target gets ceil, rest get floor (e.g., 7 → 4 + 3)
          // Minimum 1 damage per target (1 damage Cleave = 1 to each)
          const ceilHalf = Math.max(1, Math.ceil(fullDamage / 2));
          const floorHalf = Math.max(1, Math.floor(fullDamage / 2));

          console.warn(`${MODULE_ID} | Cleave: ceil=${ceilHalf}, floor=${floorHalf}, targets=${targets.length}`);

          // First target: ceiling half
          const firstMock = { dataset: { ...baseData, targets: JSON.stringify([targets[0]]), damageAmount: String(ceilHalf) } };
          await origHandleApplyDirect.call(this, firstMock);

          // Remaining targets: floor half
          for (let i = 1; i < targets.length; i++) {
            const mock = { dataset: { ...baseData, targets: JSON.stringify([targets[i]]), damageAmount: String(floorHalf) } };
            await origHandleApplyDirect.call(this, mock);
          }
          log("Cleave", `${sourceItem?.name}: ${ceilHalf} to first, ${floorHalf} to ${targets.length - 1} others`);
          return;
        }

        // Ward: snapshot HP before damage for accurate heal-back capping
        try { WardManager.snapshotHP(button); } catch (e) { /* ignore */ }

        await origHandleApplyDirect.call(this, button);

        // Ward: prompt caster for reactive damage reduction AFTER damage is applied
        try { await WardManager.onPostDamage(button); } catch (e) { /* Don't crash apply flow */ }
        return;
      } finally { _damageSourceActorId = null; _directSourceAttackType = null; _currentApplySpellId = null; }
    };
    console.log(`${MODULE_ID} | Patched handleApplyDirect.`);

    // --- _rollSave: Dispatch to Bard + Dancer ---
    const origRollSave = VagabondDamageHelper._rollSave;
    VagabondDamageHelper._rollSave = async function (actor, saveType, isHindered, shiftKey = false, ctrlKey = false, attackerModifier = 'none') {
      const ctx = {
        actor, saveType, isHindered, ctrlKey, attackerModifier,
        saveSourceActorId: _saveSourceActorId,
        saveSourceAttackType: _saveSourceAttackType,
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

    // --- RollHandler.rollWeapon: passthrough ---
    // NOTE: Brawl/Shield intent dialog has been moved to item.rollAttack() so it
    // works from BOTH the character sheet AND the vagabond-crawler action strip.
    // See the rollAttack patch above. Cleanup is in brawl-intent._injectButtons().
    console.log(`${MODULE_ID} | RollHandler.rollWeapon — brawl intent now handled at rollAttack level.`);

    // --- SpellHandler.castSpell: Stash _currentRollActor + Imbue delivery bypass ---
    const { SpellHandler } = await import("/systems/vagabond/module/sheets/handlers/spell-handler.mjs");
    const origCastSpell = SpellHandler.prototype.castSpell;
    SpellHandler.prototype.castSpell = async function (event, target) {
      // Check if this cast uses Imbue delivery — if so, bypass d20/damage rolls
      const spellId = target.dataset.spellId;
      const state = this._getSpellState?.(spellId);

      // Record useFx for this cast so processCausedStatuses can gate the
      // spell's Effect at apply time. Without this, the system's apply path
      // reads spell.system.causedStatuses unconditionally and fires the Effect
      // even when the player didn't pay the +1 Mana Fx surcharge.
      if (state) _recordCastUseFx(this.actor?.id, spellId, !!state.useFx);

      if (state?.deliveryType === "imbue") {
        const spell = this.actor.items.get(spellId);
        if (spell) {
          const costs = this._calculateSpellCost(spellId);
          const handled = await ImbueManager.handleImbueCast(this.actor, spell, state, costs);
          if (handled) {
            // Reset spell state
            const defaultUseFx = spell.system.damageType === "-";
            this.spellStates[spellId] = {
              damageDice: 1,
              deliveryType: state.deliveryType,
              deliveryIncrease: 0,
              useFx: defaultUseFx
            };
            this._saveSpellStates();
            this._updateSpellDisplay(spellId);
            return;
          }
        }
      }

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

    // --- CrawlerSpellDialog._cast: Capture useFx for crawler-strip casts ---
    // The vagabond-crawler module has its own spell cast UI that bypasses
    // SpellHandler.castSpell entirely. Without this patch the Fx-gating record
    // is never written for crawler casts and the Effect always applies.
    try {
      if (game.modules.get("vagabond-crawler")?.active) {
        const crawlerMod = await import("/modules/vagabond-crawler/scripts/npc-action-menu.mjs");
        const CrawlerSpellDialog = crawlerMod?.CrawlerSpellDialog;
        if (CrawlerSpellDialog?.prototype?._cast) {
          const origCrawlerCast = CrawlerSpellDialog.prototype._cast;
          CrawlerSpellDialog.prototype._cast = async function () {
            _recordCastUseFx(this.actor?.id, this.spell?.id, !!this.spellState?.useFx);
            return await origCrawlerCast.call(this);
          };
          console.log(`${MODULE_ID} | Patched CrawlerSpellDialog._cast for Fx gating.`);
        }
      }
    } catch (e) {
      console.warn(`${MODULE_ID} | Could not patch crawler spell cast (Fx gating):`, e);
    }

    // --- SpellHandler._calculateSpellCost: Fix healing spell mana costs ---
    // Life spell (damageType "healing") has special rules:
    //   - Effect (revive) is always free — no fxCost surcharge
    //   - Healing costs 1 Mana per d6 — no free first die
    const origCalculateSpellCost = SpellHandler.prototype._calculateSpellCost;
    SpellHandler.prototype._calculateSpellCost = function (spellId) {
      const result = origCalculateSpellCost.call(this, spellId);
      const spell = this.actor.items.get(spellId);
      if (spell?.system.damageType === "healing") {
        const state = this._getSpellState(spellId);
        result.damageCost = state.damageDice;    // 1 Mana per d6, no free first die
        result.fxCost = 0;                       // Effect is always free
        result.totalCost = result.damageCost + result.deliveryBaseCost + result.deliveryIncreaseCost;
        // Re-apply spell mana cost reduction
        const spellReduction = this.actor.system.bonuses?.spellManaCostReduction || 0;
        result.totalCost = Math.max(0, result.totalCost - spellReduction);
      }
      return result;
    };
    console.log(`${MODULE_ID} | Patched SpellHandler._calculateSpellCost for healing spells.`);

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
    brawlIntent: BrawlIntent,
    aura: (actor, spell, radius) => AuraManager.activate(actor, spell, radius),
    auraMenu: (actor) => AuraManager.showAuraMenu(actor),
    auraEnd: (actor) => AuraManager.deactivate(actor),
    layOnHands: (actor) => RevelatorFeatures.useLayOnHands(actor),
    setDraconicResilience: (actor) => DrakenFeatures.promptResilienceChoice(actor),
    /** Mark a weapon item as an area attack — bypasses the single-target / range
     *  validation in RangeValidator. Use for breath weapons, cone/spray attacks,
     *  or any custom weapon that hits multiple targets in an area.
     *  Pass `false` (or omit `enabled`) to clear the flag. */
    markAreaAttack: (item, enabled = true) => {
      if (!item) return;
      return enabled
        ? item.setFlag(MODULE_ID, "areaAttack", true)
        : item.unsetFlag(MODULE_ID, "areaAttack");
    },
    imbue: ImbueManager,
    clearImbue: (actor) => ImbueManager.clearImbue(actor),
    witch: WitchFeatures,
    hex: (actor, targetId, targetName, targetImg) => WitchFeatures.applyHex(actor, targetId, targetName, targetImg),
    unhex: (actor, targetId) => WitchFeatures.removeHex(actor, targetId),
    betwixt: (actor) => WitchFeatures.useBetwixt(actor),
    summoner: SummonerFeatures,
    conjure: (actor) => SummonerFeatures.showConjureDialog(actor),
    banish: (actor) => SummonerFeatures.banishSummon(actor, "Manual"),
    /** API for Vagabond Crawler: get summon action data for a summoner actor */
    getSummonData: (actor) => {
      if (!actor) return null;
      const features = actor.getFlag(MODULE_ID, "features");
      if (!features?.summoner_creatureCodex) return null;
      const conjure = actor.getFlag(MODULE_ID, "activeConjure");
      if (!conjure) return { hasSummoner: true, hasConjure: false };
      const summonActor = game.actors.get(conjure.summonActorId);
      return {
        hasSummoner: true,
        hasConjure: true,
        summonName: conjure.summonName,
        summonImg: conjure.summonImg,
        summonHD: conjure.summonHD,
        actions: (summonActor?.system?.actions || []).map((a, i) => ({
          index: i, name: a.name, note: a.note,
          rollDamage: a.rollDamage, flatDamage: a.flatDamage,
          damageType: a.damageType, attackType: a.attackType,
          extraInfo: a.extraInfo
        })),
        abilities: summonActor?.system?.abilities || [],
        /** Call this to roll a summon action from the crawler */
        useAction: (actionIdx) => SummonerFeatures.rollSummonAction(actor, conjure, actionIdx),
        /** Call this to banish */
        useBanish: () => SummonerFeatures.banishSummon(actor, "Dismissed")
      };
    },
    familiar: FamiliarFeatures,
    conjureFamiliar: (actor) => FamiliarFeatures.showConjureDialog(actor),
    banishFamiliar: (actor) => FamiliarFeatures.banishFamiliar(actor, "Dismissed"),
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
    /** API for Vagabond Crawler: get Gold Sink favorite items for a merchant actor.
     *  Reads metadata directly from the actor flag — no dependency on shop cache. */
    getGoldSinkData: (actor) => {
      if (!actor) return null;
      const features = actor.getFlag(MODULE_ID, "features");
      if (!features?.merchant_goldSink) return null;
      const favs = actor.getFlag(MODULE_ID, "goldSinkFavorites") ?? [];
      if (!favs.length) return { hasMerchant: true, favorites: [] };
      const cur = actor.system.currency ?? { gold: 0, silver: 0, copper: 0 };
      const walletCopper = (cur.gold * 10000) + (cur.silver * 100) + cur.copper;
      const favorites = favs.map(f => {
        if (!f.uuid) return null;
        const cost = f.baseCost ?? { gold: 0, silver: 0, copper: 0 };
        const costCopper = f.costCopper ?? ((cost.gold * 10000) + (cost.silver * 100) + (cost.copper ?? 0));
        const affordable = walletCopper >= costCopper;
        const parts = [];
        if (cost.gold) parts.push(`${cost.gold}g`);
        if (cost.silver) parts.push(`${cost.silver}s`);
        if (cost.copper) parts.push(`${cost.copper}c`);
        const priceLabel = parts.join(" ") || "Free";
        return {
          uuid: f.uuid, label: f.name, img: f.img, priceLabel, affordable,
        };
      }).filter(Boolean);
      return {
        hasMerchant: true,
        favorites,
        /** Call this to buy a favorite item from the crawler */
        buyItem: (uuid) => buyFavoriteItem(actor, uuid),
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

  // Register socket relay for GM-proxied operations (token/actor create/delete)
  registerSocketRelay();

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
  MonkFeatures.registerHooks();
  PugilistFeatures.registerHooks();
  RevelatorFeatures.registerHooks();
  RogueFeatures.registerHooks();
  SorcererFeatures.registerHooks();
  VanguardFeatures.registerHooks();
  WitchFeatures.registerHooks();
  WizardFeatures.registerHooks();
  BrawlIntent.registerHooks();
  FocusManager.registerHooks();
  DrakenFeatures.registerHooks();
  ImbueManager.registerHooks();
  BlessManager.registerHooks();
  WardManager.registerHooks();
  EffectOnlyHandler.registerHooks();
  SummonerFeatures.registerHooks();
  FamiliarFeatures.registerHooks();
  CompanionManagerTab.init();
  CompanionTerminationManager.init();
  GatherCompanions.init();
  // Phase 2: spell adapters
  BeastSpell.init();
  RaiseSpell.init();
  AnimateSpell.init();
  // Phase 2: perk adapters
  AnimalCompanion.init();
  ReanimatorPerk.init();
  ConjurerPerk.init();
  RaisePerks.init();

  // ── Patch VagabondChatCard.npcAction to route flagged-companion action rolls
  //    through the controller's mana skill (Mysticism / Arcana). Mirrors the
  //    pattern used by vagabond-crawler's _fireAction. Without this, clicking
  //    an action on a companion's NPC sheet rolls the NPC's own stats instead
  //    of the controlling PC's skill check.
  //
  //    Detection order:
  //      1. actor.controllerActorId flag (v0.4.0+) with companionMeta.sourceId
  //         → route via SummonerFeatures / FamiliarFeatures
  //      2. Legacy caster-side flags (activeConjure / activeFamiliar) — same
  //         fallback the crawler uses, so pre-v0.4.0 companions still route
  //      3. No flags → call original npcAction (unflagged NPC rolls its own stats)
  try {
    const { VagabondChatCard } = globalThis.vagabond?.utils ?? {};
    if (VagabondChatCard?.npcAction && !VagabondChatCard._vceNpcActionPatched) {
      const origNpcAction = VagabondChatCard.npcAction.bind(VagabondChatCard);
      VagabondChatCard.npcAction = async function(actor, action, actionIndex, targetsAtRollTime = []) {
        try {
          if (actor?.type === "npc" && action) {
            // Path 1: companionMeta (v0.4.0+)
            const controllerId = actor.getFlag(MODULE_ID, "controllerActorId");
            const meta = actor.getFlag(MODULE_ID, "companionMeta");
            if (controllerId && meta?.sourceId) {
              const controller = game.actors.get(controllerId);
              if (controller) {
                if (meta.sourceId === "summoner") {
                  const conjure = controller.getFlag(MODULE_ID, "activeConjure")
                    ?? { summonActorId: actor.id, summonName: actor.name, summonImg: actor.img, summonHD: actor.system?.hd ?? 1, sceneId: canvas.scene?.id };
                  return await SummonerFeatures.rollSummonAction(controller, conjure, actionIndex);
                }
                if (meta.sourceId === "familiar") {
                  const familiar = controller.getFlag(MODULE_ID, "activeFamiliar")
                    ?? { summonActorId: actor.id, summonName: actor.name, summonImg: actor.img, summonHD: 1, familiarSkill: "mysticism" };
                  return await FamiliarFeatures.rollFamiliarAction(controller, familiar, actionIndex);
                }
              }
            }
            // Path 2: legacy caster-side flags (pre-v0.4.0 or externally set)
            for (const pc of game.actors) {
              if (pc.type !== "character") continue;
              const conjure = pc.getFlag(MODULE_ID, "activeConjure");
              if (conjure?.summonActorId === actor.id) {
                return await SummonerFeatures.rollSummonAction(pc, conjure, actionIndex);
              }
              const familiar = pc.getFlag(MODULE_ID, "activeFamiliar");
              if (familiar?.summonActorId === actor.id) {
                return await FamiliarFeatures.rollFamiliarAction(pc, familiar, actionIndex);
              }
            }
          }
        } catch (e) {
          log("VCE", `npcAction routing failed, falling through to system default: ${e.message}`);
        }
        // Fallback: unflagged NPCs roll via system default
        return origNpcAction(actor, action, actionIndex, targetsAtRollTime);
      };
      VagabondChatCard._vceNpcActionPatched = true;
      log("Ready", "Patched VagabondChatCard.npcAction for companion routing.");
    }
  } catch (e) {
    log("Ready", `Could not patch VagabondChatCard.npcAction: ${e.message}`);
  }

  // Patch modifyMovementCost to ignore walk difficulty for Treads Lightly
  const moveCostModel = CONFIG.RegionBehavior?.dataModels?.modifyMovementCost;
  if (moveCostModel?.prototype?._getTerrainEffects) {
    const origGetTerrainEffects = moveCostModel.prototype._getTerrainEffects;
    moveCostModel.prototype._getTerrainEffects = function(token, segment) {
      // Only nullify walk action (not fly, swim, burrow)
      if (segment.action === "walk" || segment.action === undefined) {
        const actor = token.actor;
        if (actor?.type === "character" && actor.getFlag(MODULE_ID, "features")?.perk_treadsLightly) {
          return [];
        }
      }
      return origGetTerrainEffects.call(this, token, segment);
    };
    log("Ready", "Patched modifyMovementCost for Treads Lightly.");
  }

  // Patch character sheet for Beast Form panel injection
  PolymorphSheet.patchSheet();

  // Patch character sheet for Merchant Gold Sink tab
  GoldSinkSheet.patchSheet();

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

/* -------------------------------------------- */
/*  Apply Roll to Targets (GM Context Menu)     */
/* -------------------------------------------- */

/**
 * Apply a chat message's roll total as damage or healing to all targeted tokens.
 * @param {HTMLElement} li - The chat message list item element
 * @param {"damage"|"half"|"healing"} mode
 */
async function _applyRollToTargets(li, mode) {
  const message = game.messages.get(li.dataset.messageId);
  if (!message?.rolls?.length) return;

  if (game.user.targets.size === 0) {
    ui.notifications.warn("Select a target token first.");
    return;
  }

  const total = message.rolls.reduce((sum, r) => sum + r.total, 0);
  const amount = mode === "half" ? Math.floor(total / 2) : total;

  for (const target of game.user.targets) {
    const actor = target.actor;
    if (!actor) continue;

    const currentHP = actor.system.health?.value ?? 0;
    const maxHP = actor.system.health?.max ?? currentHP;
    let newHP;

    if (mode === "healing") {
      newHP = Math.min(maxHP, currentHP + amount);
    } else {
      newHP = Math.max(0, currentHP - amount);
    }

    await actor.update({ "system.health.value": newHP });

    const verb = mode === "healing" ? "healed" : "damaged";
    const diff = Math.abs(newHP - currentHP);
    ChatMessage.create({
      content: `<div class="vagabond-chat-card-v2" data-card-type="apply-result">
        <div class="card-body"><section class="content-body">
          <div class="card-description" style="text-align:center;">
            <strong>${actor.name}</strong> ${verb} for <strong>${diff}</strong> HP
            (${currentHP} → ${newHP})
          </div>
        </section></div></div>`,
      speaker: ChatMessage.getSpeaker()
    });
  }
}
