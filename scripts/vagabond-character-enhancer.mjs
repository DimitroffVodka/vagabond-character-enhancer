/**
 * Vagabond Character Enhancer
 * Automates ancestry traits, class features, and perks for the Vagabond RPG system.
 */

export const MODULE_ID = "vagabond-character-enhancer";

// Module-global context for passing actor through wrapped call chains.
// Set before calling a wrapped method, cleared after. Used by Climax
// to pass the actor to buildAndEvaluateD20WithRollData (which only
// receives rollData, not the actor).
let _currentRollActor = null;

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
  // Patch system's calculateFinalDamage to fix Rage DR dice counting.
  // The system reads attackingWeapon.system.damageAmount (often empty).
  // We fix it to read currentDamage instead, and fall back to counting
  // dice from the most recent damage chat message when weapon is null.
  try {
    const { VagabondDamageHelper } = await import("/systems/vagabond/module/helpers/damage-helper.mjs");
    const origCalcFinal = VagabondDamageHelper.calculateFinalDamage;

    VagabondDamageHelper.calculateFinalDamage = function (actor, damage, damageType, attackingWeapon = null, sneakDice = 0) {
      let result = origCalcFinal.call(this, actor, damage, damageType, attackingWeapon, sneakDice);

      const features = actor?.getFlag?.(MODULE_ID, "features");
      const needsRageDR = actor.system?.incomingDamageReductionPerDie > 0
        && actor.statuses?.has("berserk")
        && VagabondDamageHelper._isLightOrNoArmor(actor);
      const needsTempest = features?.druid_tempestWithin
        && ["cold", "fire", "shock"].includes(damageType?.toLowerCase());

      if (!needsRageDR && !needsTempest) return result;

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

      // --- Rage DR: Barbarian berserk damage reduction ---
      if (needsRageDR) {
        const reductionPerDie = actor.system.incomingDamageReductionPerDie;
        const rageDR = reductionPerDie * numDice;
        if (game.settings.get(MODULE_ID, "debugMode")) {
          console.log(`${MODULE_ID} | Rage DR: ${reductionPerDie} × ${numDice} dice = ${rageDR} reduction`);
        }
        result = Math.max(0, result - rageDR);
      }

      // --- Tempest Within: Druid cold/fire/shock damage reduction ---
      if (needsTempest) {
        const classLevel = features._classLevel ?? 1;
        const reductionPerDie = Math.floor(classLevel / 2);
        if (reductionPerDie > 0) {
          const tempestDR = reductionPerDie * numDice;
          if (game.settings.get(MODULE_ID, "debugMode")) {
            console.log(`${MODULE_ID} | Tempest Within: ${reductionPerDie} × ${numDice} dice = ${tempestDR} reduction (${damageType})`);
          }
          result = Math.max(0, result - tempestDR);
        }
      }

      return result;
    };

    console.log(`${MODULE_ID} | Patched calculateFinalDamage for Rage DR + Tempest Within.`);

    // ── Consumable Weapon Damage Auto-Roll ──────────────────────────────────
    //
    // PROBLEM:
    //   The system has a "roll damage with check" setting. When OFF, the attack
    //   card shows a "Roll Damage" button instead of auto-rolling. But consumable
    //   weapons (e.g. Alchemist's Fire) are DELETED by handleConsumption() after
    //   the attack card is posted. When the player later clicks "Roll Damage",
    //   the item no longer exists — so canExplode/explodeValues can't be read
    //   from it, and explosions silently fail.
    //
    // FAILED APPROACHES:
    //   1. Patching item.roll() only — doesn't help because right-click "Use"
    //      on the Equipped panel calls _onRollWeapon → rollHandler.rollWeapon(),
    //      which is a completely different code path that never calls item.roll().
    //   2. Modifying the system's roll-handler.mjs directly — works but violates
    //      the constraint of module-only changes. System updates would overwrite.
    //   3. Patching handleConsumption to delay — too fragile, other code expects
    //      immediate consumption.
    //
    // SOLUTION:
    //   Two-part monkey-patch using a one-shot flag:
    //   (A) Wrap rollAttack: when the item being attacked with is a consumable
    //       weapon, set _vceForceRollDamage = true on VagabondDamageHelper.
    //   (B) Wrap shouldRollDamage: if the flag is set, return true (forcing
    //       auto-roll) and clear the flag. The flag is "one-shot" — consumed
    //       on first read so it doesn't affect subsequent non-consumable attacks.
    //
    //   This works because the system's rollWeapon() flow is:
    //     1. item.rollAttack()     ← our wrapper sets the flag
    //     2. shouldRollDamage()    ← our wrapper reads & clears the flag, returns true
    //     3. item.rollDamage()     ← runs with item still alive, checks canExplode ✅
    //     4. weaponAttack()        ← posts card with damage inline
    //     5. handleConsumption()   ← item deleted (but damage already rolled)
    //
    const origShouldRoll = VagabondDamageHelper.shouldRollDamage;
    VagabondDamageHelper.shouldRollDamage = function (isHit) {
      if (VagabondDamageHelper._vceForceRollDamage) {
        VagabondDamageHelper._vceForceRollDamage = false;
        return true;
      }
      return origShouldRoll.call(this, isHit);
    };
    console.log(`${MODULE_ID} | Patched shouldRollDamage for consumable weapons.`);

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

        // Virtuoso: Valor grants favor on attacks.
        // This is the ONLY place Virtuoso favor applies to weapon attacks —
        // buildAndEvaluateD20 patch covers skill/save/stat checks (separate path).
        // rollAttack uses buildAndEvaluateD20WithRollData internally, NOT buildAndEvaluateD20.
        const virtuosoBuff = actor.effects?.find(e => e.getFlag(MODULE_ID, "virtuosoBuff"));
        if (virtuosoBuff) {
          const buffType = virtuosoBuff.getFlag(MODULE_ID, "virtuosoBuff");
          if (buffType === "valor" && favorHinder !== "favor") {
            if (favorHinder === "hinder") favorHinder = "none";
            else favorHinder = "favor";
            if (game.settings.get(MODULE_ID, "debugMode")) {
              console.log(`${MODULE_ID} | Virtuoso Valor: attack favor — effective: ${favorHinder}`);
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
        // ── Consumable weapon flag (Part A of the two-part patch) ──
        // See "Consumable Weapon Damage Auto-Roll" comment block above for
        // the full explanation. We set the flag HERE so that when the system's
        // rollWeapon() calls shouldRollDamage() AFTER this returns, the flag
        // is still set. shouldRollDamage (Part B) consumes and clears it.
        // On error, we clear the flag to avoid leaking into the next attack.
        const isConsumableWeapon = this.system?.isConsumable
          && this.system?.equipmentType === "weapon";
        if (isConsumableWeapon) {
          VagabondDamageHelper._vceForceRollDamage = true;
        }

        // Stash actor for Climax d6 explosion in buildAndEvaluateD20WithRollData
        _currentRollActor = actor;
        try {
          const result = await origRollAttack.call(this, actor, favorHinder);
          _currentRollActor = null;
          return result;
        } catch (e) {
          _currentRollActor = null;
          VagabondDamageHelper._vceForceRollDamage = false;
          throw e;
        }
      };
      console.log(`${MODULE_ID} | Patched rollAttack for Bloodthirsty.`);
    }

    // --- Inspiration: Add d6 to healing item formulas (potions, etc.) ---
    // Potions auto-apply healing via item.roll() which evaluates the formula
    // immediately. We wrap roll() to modify the formula for healing items,
    // appending "+1d6" when Inspiration is active.
    // This covers potions (auto-heal) while handleApplyRestorative covers
    // button-based healing (Life spell apply button).
    if (VagabondItem?.prototype?.roll) {
      const origItemRoll = VagabondItem.prototype.roll;
      VagabondItem.prototype.roll = async function (event, targetsAtRollTime = []) {
        // ── Alchemical weapon redirect ─────────────────────────────────────
        //
        // PROBLEM:
        //   item.roll() is called when a player clicks an item directly (e.g.
        //   from the inventory grid). For non-weapon items, this posts a generic
        //   "item use" card via VagabondChatCard.itemUse() — no attack roll, no
        //   damage roll, no explosion check. It then calls handleConsumption()
        //   which deletes the item. Alchemical weapons need the full attack flow.
        //
        // NOTE: This is a SEPARATE path from the Equipped panel's right-click
        //   "Use" button, which calls _onRollWeapon → rollHandler.rollWeapon().
        //   That path IS correct (attack → damage → consumption) and is handled
        //   by the shouldRollDamage force-flag patch above.
        //
        // WHY CHECK SPECIFIC TYPES:
        //   The system defaults alchemicalType to "concoction" for ALL equipment
        //   items (Backpack, Bedroll, Torch, etc.). A naive `this.system.alchemicalType`
        //   check would match everything. We explicitly check for real alchemical
        //   weapon types: acid, explosive, poison, and Holy Water (a weapon override).
        //
        const ALCHEMICAL_WEAPON_TYPES = new Set(["acid", "explosive", "poison"]);
        const alcType = (this.system.alchemicalType ?? "").toLowerCase();
        const isAlchemicalWeapon = this.type === "equipment"
          && this.system.equipmentType === "weapon"
          && (ALCHEMICAL_WEAPON_TYPES.has(alcType) || this.name?.toLowerCase().includes("holy water"));
        if (isAlchemicalWeapon) {
          const actor = this.actor;
          if (!actor) return origItemRoll.call(this, event, targetsAtRollTime);

          try {
            const { VagabondChatCard } = globalThis.vagabond.utils;

            const targets = Array.from(game.user.targets).map(t => ({
              tokenId: t.id, sceneId: t.scene.id,
              actorId: t.actor?.id, actorName: t.name, actorImg: t.document.texture.src,
            }));

            const favorHinder = actor.system?.favorHinder || "none";
            // rollAttack goes through our wrapper which sets _vceForceRollDamage
            const attackResult = await this.rollAttack(actor, favorHinder);
            if (!attackResult) return;

            if (attackResult.isCritical && attackResult.weaponSkill?.stat) {
              attackResult.critStatBonus = actor.getRollData().stats?.[attackResult.weaponSkill.stat]?.value || 0;
            }

            // Always roll damage on hit — item will be consumed after this.
            // rollDamage() checks canExplode/explodeValues while item still exists.
            let damageRoll = null;
            const isHit = attackResult.isHit ?? false;
            if (isHit || attackResult.isCritical) {
              damageRoll = await this.rollDamage(actor, attackResult.isCritical, attackResult.weaponSkill?.stat ?? null);
            }

            await VagabondChatCard.weaponAttack(actor, this, attackResult, damageRoll, targets);
            await this.handleConsumption?.();
            return attackResult.roll;
          } catch (e) {
            console.error(`${MODULE_ID} | Alchemical weapon attack failed:`, e);
            ui.notifications.error("Alchemical attack failed — check console.");
            return;
          }
        }

        // Only intercept equipment items with healing damageType
        if (this.type === "equipment" && this.system.damageType === "healing") {
          let hasInspiration = false;
          const actor = this.actor;

          if (game.combat) {
            // In combat: check if any PC combatant has Inspiration AE
            for (const combatant of game.combat.combatants) {
              if (combatant.actor?.type === "character" &&
                  combatant.actor.effects?.find(e => e.getFlag(MODULE_ID, "virtuosoBuff") === "inspiration")) {
                hasInspiration = true;
                break;
              }
            }
          } else {
            // Out of combat: any PC on scene with bard_virtuoso
            const scenePCs = canvas.tokens?.placeables?.filter(t => t.actor?.type === "character") || [];
            hasInspiration = scenePCs.some(t => {
              const features = t.actor?.getFlag(MODULE_ID, "features");
              return features?.bard_virtuoso;
            });
          }

          if (hasInspiration) {
            // Temporarily modify the item's formula to add +1d6
            // getRollData() inside roll() reads from item data, so we modify system data
            const origFormula = this.system.formula;
            if (origFormula) {
              this.system.formula = `${origFormula} + 1d6[Inspiration]`;
              if (game.settings.get(MODULE_ID, "debugMode")) {
                console.log(`${MODULE_ID} | Inspiration: Modified healing formula: ${origFormula} → ${this.system.formula}`);
              }
            }
            try {
              const result = await origItemRoll.call(this, event, targetsAtRollTime);
              // Restore original formula
              this.system.formula = origFormula;
              return result;
            } catch (e) {
              this.system.formula = origFormula;
              throw e;
            }
          }
        }
        return origItemRoll.call(this, event, targetsAtRollTime);
      };
      console.log(`${MODULE_ID} | Patched item.roll for Inspiration healing.`);
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

      // Choreographer: One-check Favor (consume on any d20 roll)
      // This covers skill checks, stat checks, and sheet-initiated save rolls.
      if (actor.getFlag?.(MODULE_ID, "choreographerFavor")) {
        if (favorHinder === "hinder") favorHinder = "none";
        else if (favorHinder !== "favor") favorHinder = "favor";
        // Consume the one-check favor asynchronously (don't block the roll)
        actor.unsetFlag(MODULE_ID, "choreographerFavor");
        actor.unsetFlag(MODULE_ID, "choreographerFavorExpireRound");
        if (game.settings.get(MODULE_ID, "debugMode")) {
          console.log(`${MODULE_ID} | Choreographer: Consumed one-check Favor on d20 roll for ${actor.name}`);
        }
      }

      return origBuildD20.call(this, actor, favorHinder, baseFormula);
    };
    console.log(`${MODULE_ID} | Patched buildAndEvaluateD20 for Virtuoso + Choreographer.`);

    // --- Virtuoso: Apply Resolve/Valor favor on chat-card save buttons ---
    // buildAndEvaluateD20WithConditionalHinder is a SEPARATE code path from
    // buildAndEvaluateD20. It's used by _rollSave (chat-card save buttons)
    // and never goes through our buildAndEvaluateD20 patch above.
    // Apply Virtuoso favor here too so Resolve works on chat-card saves.
    const origBuildD20Conditional = VagabondRollBuilder.buildAndEvaluateD20WithConditionalHinder;
    VagabondRollBuilder.buildAndEvaluateD20WithConditionalHinder = async function (
      actor, effectiveFavorHinder, isConditionallyHindered, baseFormula = null
    ) {
      const virtuosoBuff = actor?.effects?.find(e => e.getFlag(MODULE_ID, "virtuosoBuff"));
      if (virtuosoBuff) {
        const buffType = virtuosoBuff.getFlag(MODULE_ID, "virtuosoBuff");
        if (buffType === "valor" || buffType === "resolve") {
          // Apply favor BEFORE conditional hinder, so they interact correctly:
          // Virtuoso favor + conditional hinder = cancel to "none"
          if (effectiveFavorHinder === "hinder") effectiveFavorHinder = "none";
          else effectiveFavorHinder = "favor";
          if (game.settings.get(MODULE_ID, "debugMode")) {
            console.log(`${MODULE_ID} | Virtuoso: ${buffType} applied on save (conditional path) — effective: ${effectiveFavorHinder}`);
          }
        }
      }
      return origBuildD20Conditional.call(this, actor, effectiveFavorHinder, isConditionallyHindered, baseFormula);
    };
    console.log(`${MODULE_ID} | Patched buildAndEvaluateD20WithConditionalHinder for Virtuoso.`);

    // --- Climax: Explode the favor d6 when Virtuoso grants Climax ---
    // After a favored d20 roll is evaluated, if the actor has a Virtuoso AE with
    // climaxExplode=true, find the d6 favor die and explode it on max (6).
    // Wraps evaluateRoll which is the single exit point for all d20 rolls.
    const origEvaluateRoll = VagabondRollBuilder.evaluateRoll;
    VagabondRollBuilder.evaluateRoll = async function (formula, actor, favorHinder) {
      const roll = await origEvaluateRoll.call(this, formula, actor, favorHinder);

      // Only intervene on favored rolls
      if (favorHinder !== "favor") return roll;

      // Check if actor has a Virtuoso AE with Climax explosion
      const virtuosoAE = actor?.effects?.find(e =>
        e.getFlag(MODULE_ID, "climaxExplode")
      );
      if (!virtuosoAE) return roll;

      // Find the d6 favor die term and explode it on 6
      const d6Term = roll.terms.find(t =>
        t.constructor?.name === "Die" && t.faces === 6
      );
      if (!d6Term) return roll;

      // Check if the d6 rolled max — if so, explode it
      const maxFace = d6Term.faces; // 6
      const hasMaxResult = d6Term.results?.some(r => r.result === maxFace && r.active);
      if (!hasMaxResult) return roll;

      await VagabondDamageHelper._manuallyExplodeDice(roll, [maxFace]);

      if (game.settings.get(MODULE_ID, "debugMode")) {
        console.log(`${MODULE_ID} | Climax: Exploded favor d6 for ${actor.name} — new total: ${roll.total}`);
      }

      return roll;
    };
    console.log(`${MODULE_ID} | Patched evaluateRoll for Climax.`);

    // --- Virtuoso Valor + Climax: Attack/spell path (buildAndEvaluateD20WithRollData) ---
    // This method takes rollData (plain object) instead of an actor, so we use
    // _currentRollActor (stashed by rollAttack/castSpell wrappers) to check flags.
    // Two responsibilities:
    //   1. Valor: Apply favor on attack/cast checks (pre-roll)
    //   2. Climax: Explode the favor d6 on max (post-roll)
    const origBuildD20WithRollData = VagabondRollBuilder.buildAndEvaluateD20WithRollData;
    VagabondRollBuilder.buildAndEvaluateD20WithRollData = async function (rollData, favorHinder, baseFormula = null) {
      // Valor: Apply favor on attacks and cast checks
      if (_currentRollActor) {
        const virtuosoBuff = _currentRollActor.effects?.find(e => e.getFlag(MODULE_ID, "virtuosoBuff"));
        if (virtuosoBuff) {
          const buffType = virtuosoBuff.getFlag(MODULE_ID, "virtuosoBuff");
          if (buffType === "valor" && favorHinder !== "favor") {
            if (favorHinder === "hinder") favorHinder = "none";
            else favorHinder = "favor";
            if (game.settings.get(MODULE_ID, "debugMode")) {
              console.log(`${MODULE_ID} | Virtuoso Valor: applied on attack/spell for ${_currentRollActor.name} — effective: ${favorHinder}`);
            }
          }
        }

        // Choreographer: One-check Favor on attacks/spells
        if (_currentRollActor.getFlag?.(MODULE_ID, "choreographerFavor")) {
          if (favorHinder === "hinder") favorHinder = "none";
          else if (favorHinder !== "favor") favorHinder = "favor";
          _currentRollActor.unsetFlag(MODULE_ID, "choreographerFavor");
          _currentRollActor.unsetFlag(MODULE_ID, "choreographerFavorExpireRound");
          if (game.settings.get(MODULE_ID, "debugMode")) {
            console.log(`${MODULE_ID} | Choreographer: Consumed one-check Favor on attack/spell for ${_currentRollActor.name}`);
          }
        }
      }

      const roll = await origBuildD20WithRollData.call(this, rollData, favorHinder, baseFormula);

      // Climax: Explode the favor d6
      if (favorHinder === "favor" && _currentRollActor) {
        const climaxAE = _currentRollActor.effects?.find(e =>
          e.getFlag(MODULE_ID, "climaxExplode")
        );
        if (climaxAE) {
          const d6Term = roll.terms.find(t =>
            t.constructor?.name === "Die" && t.faces === 6
          );
          if (d6Term) {
            const maxFace = d6Term.faces;
            const hasMaxResult = d6Term.results?.some(r => r.result === maxFace && r.active);
            if (hasMaxResult) {
              await VagabondDamageHelper._manuallyExplodeDice(roll, [maxFace]);
              if (game.settings.get(MODULE_ID, "debugMode")) {
                console.log(`${MODULE_ID} | Climax: Exploded favor d6 on attack/spell for ${_currentRollActor.name} — new total: ${roll.total}`);
              }
            }
          }
        }
      }

      return roll;
    };
    console.log(`${MODULE_ID} | Patched buildAndEvaluateD20WithRollData for Valor + Climax.`);

    // --- Inspiration: Add d6 bonus to healing (button path) ---
    // Covers spell-based healing (Life spell "Apply X Healing" button).
    // Potion healing is covered by the item.roll() patch above — skip equipment items
    // here to avoid double-application (potions auto-heal AND have a button).
    const origHandleRestorative = VagabondDamageHelper.handleApplyRestorative;
    VagabondDamageHelper.handleApplyRestorative = async function (button) {
      const damageType = button.dataset.damageType?.toLowerCase();
      if (damageType === "healing") {
        // Skip equipment items (potions) — already handled by item.roll() patch.
        // Only apply Inspiration bonus for spell-based healing buttons.
        const actorId = button.dataset.actorId;
        const itemId = button.dataset.itemId;
        if (actorId && itemId) {
          const sourceActor = game.actors.get(actorId);
          const sourceItem = sourceActor?.items.get(itemId);
          if (sourceItem?.type === "equipment") {
            // Potion/equipment — item.roll() already added the d6
            return origHandleRestorative.call(this, button);
          }
        }

        // Check if Inspiration should apply
        let hasInspiration = false;
        if (game.combat) {
          // In combat: check if any PC combatant has Inspiration AE
          for (const combatant of game.combat.combatants) {
            if (combatant.actor?.type === "character" &&
                combatant.actor.effects?.find(e => e.getFlag(MODULE_ID, "virtuosoBuff") === "inspiration")) {
              hasInspiration = true;
              break;
            }
          }
        } else {
          // Out of combat: any PC on scene with bard_virtuoso
          const scenePCs = canvas.tokens?.placeables?.filter(t => t.actor?.type === "character") || [];
          hasInspiration = scenePCs.some(t => {
            const features = t.actor?.getFlag(MODULE_ID, "features");
            return features?.bard_virtuoso;
          });
        }

        if (hasInspiration) {
          // Roll the d6 bonus and add it to the amount
          const bonusRoll = new Roll("1d6");
          await bonusRoll.evaluate();
          const bonusAmount = bonusRoll.total;
          const originalAmount = parseInt(button.dataset.damageAmount) || 0;
          button.dataset.damageAmount = String(originalAmount + bonusAmount);
          if (game.settings.get(MODULE_ID, "debugMode")) {
            console.log(`${MODULE_ID} | Inspiration: +${bonusAmount} healing (d6 rolled ${bonusAmount}), total: ${button.dataset.damageAmount}`);
          }
          // Post the bonus to chat
          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker(),
            content: `<div class="vce-inspiration-notice">
              <i class="fas fa-music vce-inspiration-icon" aria-hidden="true"></i>
              <strong>Inspiration:</strong> +${bonusAmount} healing (1d6 → ${bonusAmount})
            </div>`
          });
        }
      }
      return origHandleRestorative.call(this, button);
    };
    console.log(`${MODULE_ID} | Patched handleApplyRestorative for Inspiration.`);

    // --- Bravado + Evasive + Step Up + Choreographer: _rollSave patches ---
    // Wrap _rollSave to handle multiple class features on save rolls:
    //   - Bravado (Bard): Will saves can't be Hindered
    //   - Evasive (Dancer): Reflex saves can't be Hindered
    //   - Step Up (Dancer): 2d20kh on Reflex saves when stepUpActive
    //   - Choreographer (Dancer): Consume one-check Favor on saves
    const origRollSave = VagabondDamageHelper._rollSave;
    VagabondDamageHelper._rollSave = async function (actor, saveType, isHindered, shiftKey = false, ctrlKey = false, attackerModifier = 'none') {
      const features = actor?.getFlag(MODULE_ID, "features");
      let origFH = null;
      let needRestore = false;

      // --- Bravado: Will saves can't be Hindered ---
      if (saveType === "will" && features?.bard_bravado && !actor.statuses?.has("incapacitated")) {
        isHindered = false;
        ctrlKey = false;
        if (attackerModifier === "hinder") attackerModifier = "none";
        origFH = actor.system.favorHinder;
        if (origFH === "hinder") {
          actor.system.favorHinder = "none";
          needRestore = true;
        }
        if (game.settings.get(MODULE_ID, "debugMode")) {
          console.log(`${MODULE_ID} | Bravado: Will save can't be Hindered for ${actor.name} — stripped all hinder sources`);
        }
      }

      // --- Evasive: Reflex saves can't be Hindered ---
      if (saveType === "reflex" && features?.dancer_evasive && !actor.statuses?.has("incapacitated")) {
        isHindered = false;
        ctrlKey = false;
        if (attackerModifier === "hinder") attackerModifier = "none";
        if (!needRestore) origFH = actor.system.favorHinder;
        if (actor.system.favorHinder === "hinder") {
          actor.system.favorHinder = "none";
          needRestore = true;
        }
        if (game.settings.get(MODULE_ID, "debugMode")) {
          console.log(`${MODULE_ID} | Evasive: Reflex save can't be Hindered for ${actor.name} — stripped all hinder sources`);
        }
      }

      // --- Choreographer: One-check Favor (consume on save) ---
      if (actor.getFlag?.(MODULE_ID, "choreographerFavor")) {
        // Upgrade favor: hinder → none, none → favor
        if (!needRestore) origFH = actor.system.favorHinder;
        if (actor.system.favorHinder === "hinder") {
          actor.system.favorHinder = "none";
        } else if (actor.system.favorHinder !== "favor") {
          actor.system.favorHinder = "favor";
        }
        needRestore = true;
        // Consume the one-check favor
        await actor.unsetFlag(MODULE_ID, "choreographerFavor");
        await actor.unsetFlag(MODULE_ID, "choreographerFavorExpireRound");
        if (game.settings.get(MODULE_ID, "debugMode")) {
          console.log(`${MODULE_ID} | Choreographer: Consumed one-check Favor on save for ${actor.name}`);
        }
      }

      // --- Step Up: 2d20kh on Reflex saves ---
      // _rollSave calls buildAndEvaluateD20WithConditionalHinder which accepts baseFormula.
      // We need to intercept and pass "2d20kh" as baseFormula.
      // Since _rollSave doesn't expose baseFormula, we temporarily patch the roll builder.
      let rollBuilderPatched = false;
      let origConditionalHinder = null;
      if (saveType === "reflex" && actor.getFlag?.(MODULE_ID, "stepUpActive")) {
        const { VagabondRollBuilder } = await import("/systems/vagabond/module/helpers/roll-builder.mjs");
        origConditionalHinder = VagabondRollBuilder.buildAndEvaluateD20WithConditionalHinder;
        VagabondRollBuilder.buildAndEvaluateD20WithConditionalHinder = async function (
          a, effectiveFH, isCondHindered, baseFormula = null
        ) {
          return origConditionalHinder.call(this, a, effectiveFH, isCondHindered, "2d20kh");
        };
        rollBuilderPatched = true;
        if (game.settings.get(MODULE_ID, "debugMode")) {
          console.log(`${MODULE_ID} | Step Up: Injecting 2d20kh baseFormula for Reflex save on ${actor.name}`);
        }
      }

      try {
        const result = await origRollSave.call(this, actor, saveType, isHindered, shiftKey, ctrlKey, attackerModifier);
        if (needRestore) actor.system.favorHinder = origFH;
        if (rollBuilderPatched) {
          const { VagabondRollBuilder } = await import("/systems/vagabond/module/helpers/roll-builder.mjs");
          VagabondRollBuilder.buildAndEvaluateD20WithConditionalHinder = origConditionalHinder;
        }
        return result;
      } catch (e) {
        if (needRestore) actor.system.favorHinder = origFH;
        if (rollBuilderPatched) {
          const { VagabondRollBuilder } = await import("/systems/vagabond/module/helpers/roll-builder.mjs");
          VagabondRollBuilder.buildAndEvaluateD20WithConditionalHinder = origConditionalHinder;
        }
        throw e;
      }
    };
    console.log(`${MODULE_ID} | Patched _rollSave for Bravado + Evasive + Step Up + Choreographer.`);

    // --- Bravado + Evasive + Step Up + Choreographer: Sheet-initiated saves ---
    // When the player clicks a save on the character sheet, RollHandler.roll()
    // resolves favorHinder BEFORE calling buildAndEvaluateD20. We intercept to:
    //   - Bravado: Strip hinder from Will saves
    //   - Evasive: Strip hinder from Reflex saves
    //   - Step Up: Inject 2d20kh baseFormula for Reflex saves
    //   - Choreographer: Consume one-check Favor
    const { RollHandler } = await import("/systems/vagabond/module/sheets/handlers/roll-handler.mjs");
    const origRoll = RollHandler.prototype.roll;
    RollHandler.prototype.roll = async function (event, target) {
      const dataset = target.dataset;
      if (dataset.type === "save" && dataset.roll) {
        const features = this.actor?.getFlag(MODULE_ID, "features");
        const saveKey = dataset.key;
        let needRestore = false;
        let origFH = null;

        // Helper to strip hinder from all sources
        const stripHinder = (label) => {
          if (event.ctrlKey) {
            event = new Proxy(event, {
              get(obj, prop) {
                if (prop === "ctrlKey") return false;
                const val = obj[prop];
                return typeof val === "function" ? val.bind(obj) : val;
              }
            });
          }
          if (!needRestore) origFH = this.actor.system.favorHinder;
          if (this.actor.system.favorHinder === "hinder") {
            this.actor.system.favorHinder = "none";
            needRestore = true;
          }
          if (game.settings.get(MODULE_ID, "debugMode")) {
            console.log(`${MODULE_ID} | ${label}: ${saveKey} save from sheet — stripped hinder for ${this.actor.name}`);
          }
        };

        // Bravado: Will saves can't be Hindered
        if (saveKey === "will" && features?.bard_bravado && !this.actor.statuses?.has("incapacitated")) {
          stripHinder("Bravado");
        }

        // Evasive: Reflex saves can't be Hindered
        if (saveKey === "reflex" && features?.dancer_evasive && !this.actor.statuses?.has("incapacitated")) {
          stripHinder("Evasive");
        }

        // Choreographer: One-check Favor (consume on save)
        if (this.actor.getFlag?.(MODULE_ID, "choreographerFavor")) {
          if (!needRestore) origFH = this.actor.system.favorHinder;
          if (this.actor.system.favorHinder === "hinder") {
            this.actor.system.favorHinder = "none";
          } else if (this.actor.system.favorHinder !== "favor") {
            this.actor.system.favorHinder = "favor";
          }
          needRestore = true;
          await this.actor.unsetFlag(MODULE_ID, "choreographerFavor");
          await this.actor.unsetFlag(MODULE_ID, "choreographerFavorExpireRound");
          if (game.settings.get(MODULE_ID, "debugMode")) {
            console.log(`${MODULE_ID} | Choreographer: Consumed one-check Favor on sheet save for ${this.actor.name}`);
          }
        }

        // Step Up: 2d20kh on Reflex saves
        // RollHandler.roll calls buildAndEvaluateD20(actor, favorHinder) with no baseFormula.
        // We temporarily patch it to inject "2d20kh".
        let rollPatched = false;
        let origBuildD20Ref = null;
        if (saveKey === "reflex" && this.actor.getFlag?.(MODULE_ID, "stepUpActive")) {
          const { VagabondRollBuilder } = await import("/systems/vagabond/module/helpers/roll-builder.mjs");
          origBuildD20Ref = VagabondRollBuilder.buildAndEvaluateD20;
          VagabondRollBuilder.buildAndEvaluateD20 = async function (actor, favorHinder, baseFormula = null) {
            return origBuildD20Ref.call(this, actor, favorHinder, "2d20kh");
          };
          rollPatched = true;
          if (game.settings.get(MODULE_ID, "debugMode")) {
            console.log(`${MODULE_ID} | Step Up: Injecting 2d20kh for sheet Reflex save on ${this.actor.name}`);
          }
        }

        if (needRestore || rollPatched) {
          try {
            const result = await origRoll.call(this, event, target);
            if (needRestore) this.actor.system.favorHinder = origFH;
            if (rollPatched) {
              const { VagabondRollBuilder } = await import("/systems/vagabond/module/helpers/roll-builder.mjs");
              VagabondRollBuilder.buildAndEvaluateD20 = origBuildD20Ref;
            }
            return result;
          } catch (e) {
            if (needRestore) this.actor.system.favorHinder = origFH;
            if (rollPatched) {
              const { VagabondRollBuilder } = await import("/systems/vagabond/module/helpers/roll-builder.mjs");
              VagabondRollBuilder.buildAndEvaluateD20 = origBuildD20Ref;
            }
            throw e;
          }
        }
      }
      return origRoll.call(this, event, target);
    };
    console.log(`${MODULE_ID} | Patched RollHandler.roll for Bravado + Evasive + Step Up + Choreographer.`);

    // --- Virtuoso Valor: Set _currentRollActor for spell casts ---
    // SpellHandler.castSpell calls buildAndEvaluateD20WithRollData which needs
    // _currentRollActor to apply Valor favor and Climax explosion.
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
    console.log(`${MODULE_ID} | Patched SpellHandler.castSpell for Valor + Climax.`);
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
    rescan: (actor) => FeatureDetector.scan(actor),
    rescanAll: () => FeatureDetector.scanAll(),
    getFlags: (actor) => actor.getFlag(MODULE_ID, "features"),
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
