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
import { AlchemistFeatures } from "./class-features/alchemist.mjs";

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
        // Stash actor for Climax d6 explosion in buildAndEvaluateD20WithRollData
        _currentRollActor = actor;
        try {
          const result = await origRollAttack.call(this, actor, favorHinder);
          _currentRollActor = null;
          return result;
        } catch (e) {
          _currentRollActor = null;
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
      return origBuildD20.call(this, actor, favorHinder, baseFormula);
    };
    console.log(`${MODULE_ID} | Patched buildAndEvaluateD20 for Virtuoso.`);

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
            content: `<div style="text-align:center; padding:4px; border:1px solid #7b5ea7; border-radius:4px;">
              <i class="fas fa-music" style="color:#c9a0dc;"></i>
              <strong>Inspiration:</strong> +${bonusAmount} healing (1d6 → ${bonusAmount})
            </div>`
          });
        }
      }
      return origHandleRestorative.call(this, button);
    };
    console.log(`${MODULE_ID} | Patched handleApplyRestorative for Inspiration.`);

    // --- Bravado: Will Saves can't be Hindered ---
    // Wrap _rollSave to strip hinder from Will saves when the actor has Bravado
    // and isn't Incapacitated. This catches ALL hinder sources: global favorHinder,
    // conditional isHindered, attacker modifier, and keyboard overrides.
    const origRollSave = VagabondDamageHelper._rollSave;
    VagabondDamageHelper._rollSave = async function (actor, saveType, isHindered, shiftKey = false, ctrlKey = false, attackerModifier = 'none') {
      if (saveType === "will") {
        const features = actor?.getFlag(MODULE_ID, "features");
        if (features?.bard_bravado && !actor.statuses?.has("incapacitated")) {
          // Strip hinder from all sources:
          // 1. isHindered (conditional) — force false
          isHindered = false;
          // 2. ctrlKey (keyboard hinder override) — force false
          ctrlKey = false;
          // 3. attackerModifier hinder — cancel to none
          if (attackerModifier === "hinder") attackerModifier = "none";
          // 4. Global favorHinder on actor — if it's "hinder", temporarily override to "none".
          //    _rollSave reads actor.system.favorHinder internally, so we temporarily patch it.
          const origFH = actor.system.favorHinder;
          if (origFH === "hinder") {
            actor.system.favorHinder = "none";
          }
          if (game.settings.get(MODULE_ID, "debugMode")) {
            console.log(`${MODULE_ID} | Bravado: Will save can't be Hindered for ${actor.name} — stripped all hinder sources`);
          }
          try {
            const result = await origRollSave.call(this, actor, saveType, isHindered, shiftKey, ctrlKey, attackerModifier);
            actor.system.favorHinder = origFH;
            return result;
          } catch (e) {
            actor.system.favorHinder = origFH;
            throw e;
          }
        }
      }
      return origRollSave.call(this, actor, saveType, isHindered, shiftKey, ctrlKey, attackerModifier);
    };
    console.log(`${MODULE_ID} | Patched _rollSave for Bravado.`);

    // --- Bravado: Sheet-initiated Will saves (roll-handler path) ---
    // When the player clicks the Will save on the character sheet, RollHandler.roll()
    // resolves favorHinder BEFORE calling buildAndEvaluateD20. Our buildAndEvaluateD20
    // patch doesn't know the roll type, so we patch RollHandler.prototype.roll to strip
    // hinder when it's a Will save and the actor has Bravado.
    const { RollHandler } = await import("/systems/vagabond/module/sheets/handlers/roll-handler.mjs");
    const origRoll = RollHandler.prototype.roll;
    RollHandler.prototype.roll = async function (event, target) {
      const dataset = target.dataset;
      if (dataset.type === "save" && dataset.key === "will" && dataset.roll) {
        const features = this.actor?.getFlag(MODULE_ID, "features");
        if (features?.bard_bravado && !this.actor.statuses?.has("incapacitated")) {
          // Override keyboard hinder (Ctrl) — create a synthetic event without ctrlKey
          if (event.ctrlKey) {
            event = new Proxy(event, {
              get(obj, prop) {
                if (prop === "ctrlKey") return false;
                const val = obj[prop];
                return typeof val === "function" ? val.bind(obj) : val;
              }
            });
          }
          // If the actor's global favorHinder is "hinder", temporarily override to "none"
          const origFH = this.actor.system.favorHinder;
          if (origFH === "hinder") {
            this.actor.system.favorHinder = "none";
          }
          if (game.settings.get(MODULE_ID, "debugMode")) {
            console.log(`${MODULE_ID} | Bravado: Will save from sheet — stripped hinder for ${this.actor.name}`);
          }
          try {
            const result = await origRoll.call(this, event, target);
            this.actor.system.favorHinder = origFH;
            return result;
          } catch (e) {
            this.actor.system.favorHinder = origFH;
            throw e;
          }
        }
      }
      return origRoll.call(this, event, target);
    };
    console.log(`${MODULE_ID} | Patched RollHandler.roll for Bravado.`);

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
  AlchemistFeatures.registerHooks();

  // Scan all existing characters on first load
  FeatureDetector.scanAll();

  console.log(`${MODULE_ID} | Ready.`);
});
