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
 *
 * Status key:
 *   "system"  — Fully handled by mordachai's base system. Module does nothing.
 *   "module"  — Fully handled by this module (managed AE and/or runtime hook).
 *   "partial" — System handles part, module handles the rest. See notes.
 *   "flavor"  — Roleplay/narrative only. Nothing to automate.
 *   "todo"    — Needs implementation. Not yet working.
 */
export const BARBARIAN_REGISTRY = {
  // ──────────────────────────────────────────────
  // L1: Rage
  // ──────────────────────────────────────────────
  // RULES: While Berserk and wearing Light Armor or no Armor, you reduce damage
  // you take by 1 per damage die, and your attack damage dice are one size larger
  // and can explode. Further, you can go Berserk after you take damage or as part
  // of making an attack. You remain Berserk this way for 1 minute, unless you end
  // it (no Action) or go Unconscious.
  //
  // STATUS: partial
  //
  // SYSTEM HANDLES:
  //   - DR application: damage-helper.mjs line 1178-1183 reads
  //     actor.system.incomingDamageReductionPerDie, checks actor.statuses.has('berserk')
  //     AND _isLightOrNoArmor(actor), then reduces finalDamage by reductionPerDie * numDice.
  //     The module just needs to SET the value — system does the gating and math.
  //   - Exploding dice: damage-helper.mjs line 366 calls _getExplodeValues() which reads
  //     actor.system.bonuses.globalExplode (line 490). If truthy, exploding is enabled.
  //     The module sets this via AE with berserk-gated formula.
  //   - Berserk status conditions: config.mjs line 259 defines Berserk as:
  //     "Can't take Cast Action or Focus. Doesn't make Morale Checks. Can't be Frightened."
  //     These restrictions are handled by system UI/logic.
  //
  // MODULE HANDLES:
  //   - Managed AE: Sets incomingDamageReductionPerDie = 1 (permanent, system gates it)
  //   - Managed AE: Sets globalExplode = (@statuses.berserk) ? 1 : 0 (auto-activates)
  //   - Runtime hook: Auto-applies Berserk status when barbarian attacks (renderChatMessage)
  //   - Runtime hook: Auto-applies Berserk status when barbarian takes damage (updateActor)
  //   - Runtime hook: Die upsizing — modifies data-damage-formula on chat card buttons (renderChatMessage)
  //   - Runtime hook: Removes Berserk when combat ends (deleteCombat)
  //
  // NOT YET HANDLED:
  //   - "You remain Berserk for 1 minute" — no timer, relies on combat end cleanup
  //   - "unless you end it (no Action)" — no UI to manually end Berserk early
  //
  "rage": {
    class: "barbarian",
    level: 1,
    flag: "barbarian_rage",
    status: "partial",
    description: "While Berserk + light/no armor: damage dice upsized, can explode, reduce incoming damage by 1 per die. Can go Berserk after taking damage or as part of an attack.",
    effects: [
      {
        label: "Rage",
        icon: "icons/skills/melee/hand-grip-sword-red.webp",
        changes: [
          // DR 1 per die — always on, system gates behind berserk + light armor check
          { key: "system.incomingDamageReductionPerDie", mode: 2, value: "1" }
          // Die upsizing, exploding, and damage bonus are on the Rage (Active) companion AE
          // which is created/deleted dynamically when Berserk toggles (see _registerRageHooks).
        ]
      }
    ]
  },

  // ──────────────────────────────────────────────
  // L1: Wrath
  // ──────────────────────────────────────────────
  // RULES: You gain the Interceptor Perk, and can make its attack against an Enemy
  // that makes a Ranged Attack, Casts, or that damages you or an Ally.
  // Grants Perk: Interceptor — Once per Round, attack a Close Enemy that begins
  // to Move out of your reach (Off-Turn).
  //
  // STATUS: flavor
  //
  // SYSTEM HANDLES:
  //   - Interceptor perk is added to the character during character creation.
  //   - The expanded trigger conditions (Ranged Attack, Cast, damages Ally) are
  //     not mechanically enforced — the GM/player decides when to use it.
  //
  // MODULE HANDLES:
  //   - Nothing. Detection flag only for tracking purposes.
  //
  "wrath": {
    class: "barbarian",
    level: 1,
    flag: "barbarian_wrath",
    status: "flavor",
    description: "Gain the Interceptor Perk. Can make its attack against Enemies that make Ranged Attacks, Cast, or damage you or an Ally."
  },

  // ──────────────────────────────────────────────
  // L2: Aggressor
  // ──────────────────────────────────────────────
  // RULES: You have a 10 foot bonus to Speed during the first Round of Combat,
  // and having 3 or more Fatigue doesn't prevent you from taking the Rush Action.
  //
  // STATUS: module
  //
  // SYSTEM HANDLES:
  //   - Nothing specific to Aggressor.
  //
  // MODULE HANDLES:
  //   - Runtime hook: Creates temporary +10 speed AE on combat start round 1 (updateCombat)
  //   - Runtime hook: Removes speed AE after barbarian's first turn (updateCombat)
  //   - NOT YET: Fatigue Rush exemption is not implemented (would need to intercept
  //     the Rush action validation, which may be flavor/GM-managed)
  //
  "aggressor": {
    class: "barbarian",
    level: 2,
    flag: "barbarian_aggressor",
    status: "module",
    description: "+10 Speed during first Round of Combat. 3+ Fatigue doesn't prevent Rush Action."
  },

  // ──────────────────────────────────────────────
  // L4: Fearmonger
  // ──────────────────────────────────────────────
  // RULES: When you kill an Enemy, every Near Enemy with HD lower than your Level
  // becomes Frightened until the end of your next Turn.
  //
  // STATUS: module
  //
  // SYSTEM HANDLES:
  //   - Frightened status condition exists in the system.
  //   - toggleStatusEffect() API available.
  //
  // MODULE HANDLES:
  //   - Runtime hook: Watches updateActor for NPC HP → 0 (proxy for kill)
  //   - Finds barbarians in combat with Fearmonger flag
  //   - Measures distance to nearby NPCs (within 30 ft = Near)
  //   - Checks NPC threat level < barbarian level
  //   - Applies Frightened via toggleStatusEffect
  //   - NOT YET: Doesn't track who dealt the killing blow — assumes any barbarian
  //     in combat could be the killer. Also "until end of your next Turn" duration
  //     is not automatically tracked.
  //
  "fearmonger": {
    class: "barbarian",
    level: 4,
    flag: "barbarian_fearmonger",
    status: "module",
    description: "When you kill an Enemy, every Near Enemy with HD lower than your Level becomes Frightened until end of your next Turn."
  },

  // ──────────────────────────────────────────────
  // L6: Mindless Rancor
  // ──────────────────────────────────────────────
  // RULES: You can't be Charmed, Confused, or compelled to act against your will.
  //
  // STATUS: module
  //
  // SYSTEM HANDLES:
  //   - statusImmunities ArrayField exists on actor schema. The system checks this
  //     before applying status conditions.
  //
  // MODULE HANDLES:
  //   - Managed AE: Adds "charmed" and "confused" to system.statusImmunities
  //   - "compelled to act against your will" is narrative — no mechanical enforcement
  //
  "mindless rancor": {
    class: "barbarian",
    level: 6,
    flag: "barbarian_mindlessRancor",
    status: "module",
    description: "You can't be Charmed, Confused, or compelled to act against your will.",
    effects: [
      {
        label: "Mindless Rancor",
        icon: "icons/magic/defensive/shield-barrier-deflect-gold.webp",
        changes: [
          { key: "system.statusImmunities", mode: 2, value: "charmed" },
          { key: "system.statusImmunities", mode: 2, value: "confused" }
        ]
      }
    ]
  },

  // ──────────────────────────────────────────────
  // L8: Bloodthirsty
  // ──────────────────────────────────────────────
  // RULES: Your attacks against Beings that are missing any HP are Favored, and
  // you can sense them within Far as if by Blindsight.
  //
  // STATUS: todo
  //
  // SYSTEM HANDLES:
  //   - Favor/Hinder system exists for attack rolls.
  //   - Blindsight is a sense type in the system.
  //
  // MODULE HANDLES:
  //   - NOT YET: Would need to hook into attack roll builder to check if target
  //     HP < max HP, then add Favor. The system doesn't expose a pre-roll hook,
  //     so this would need renderChatMessage interception or a creative approach.
  //   - NOT YET: Blindsight sense for wounded beings is narrative/GM-managed.
  //
  "bloodthirsty": {
    class: "barbarian",
    level: 8,
    flag: "barbarian_bloodthirsty",
    status: "todo",
    description: "Attacks against Beings missing any HP are Favored. Sense them within Far as Blindsight."
  },

  // ──────────────────────────────────────────────
  // L10: Rip and Tear
  // ──────────────────────────────────────────────
  // RULES: While Berserk, you reduce damage you take by 2 per damage die, rather
  // than 1, and you gain a +1 bonus to each die of damage you deal.
  //
  // STATUS: partial
  //
  // SYSTEM HANDLES:
  //   - Same DR system as Rage (damage-helper.mjs:1178-1183). Reads
  //     incomingDamageReductionPerDie and applies reduction while berserk.
  //     Module stacks +1 on top of Rage's +1 for total of 2.
  //   - universalDamageBonus is read by damage-helper.mjs:328 and added to all
  //     damage rolls. Module gates it behind berserk formula.
  //
  // MODULE HANDLES:
  //   - Managed AE: Adds +1 to incomingDamageReductionPerDie (stacks with Rage's 1 = 2 total)
  //   - Managed AE: Adds +1 to universalDamageBonus gated by (@statuses.berserk) ? 1 : 0
  //
  "rip and tear": {
    class: "barbarian",
    level: 10,
    flag: "barbarian_ripAndTear",
    status: "partial",
    description: "Upgrades Rage: reduce damage by 2 per die instead of 1, +1 bonus to each damage die.",
    effects: [
      {
        label: "Rip and Tear",
        icon: "icons/skills/melee/strike-axe-blood-red.webp",
        changes: [
          // +1 more DR per die (stacks with Rage's 1 for total 2)
          // Always on — system gates behind berserk + light armor check
          { key: "system.incomingDamageReductionPerDie", mode: 2, value: "1" }
          // +1 universal damage bonus is on the Rage (Active) companion AE
          // which checks for barbarian_ripAndTear flag (see _registerRageHooks).
        ]
      }
    ]
  }
};

/* -------------------------------------------- */
/*  Constants                                   */
/* -------------------------------------------- */


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

  /**
   * Parse the die size from a damage formula like "d8", "2d6", "1d10".
   * Returns the numeric face count, or 0 if not parseable.
   */
  _parseDieSize(formula) {
    const match = formula?.match(/\d*d(\d+)/i);
    return match ? parseInt(match[1]) : 0;
  },

  /**
   * Set explodeValues on equipped weapons based on their upsized die max face.
   * Stores original values in module flags for restoration.
   */
  async _setWeaponExplodeValues(actor, dieSizeBonus) {
    const weapons = actor.items.filter(i =>
      i.type === "equipment" &&
      i.system.equipmentType === "weapon" &&
      i.system.equipped
    );
    if (weapons.length === 0) return;

    const updates = [];
    for (const weapon of weapons) {
      const baseDie = this._parseDieSize(weapon.system.currentDamage || weapon.system.damageAmount);
      if (baseDie === 0) continue;

      const upsizedMax = baseDie + dieSizeBonus;
      this._log(`Rage: Setting explodeValues="${upsizedMax}" on ${weapon.name} (d${baseDie} → d${upsizedMax})`);
      updates.push({
        _id: weapon.id,
        "system.explodeValues": String(upsizedMax),
        [`flags.${MODULE_ID}.originalExplodeValues`]: weapon.system.explodeValues ?? ""
      });
    }

    if (updates.length > 0) {
      await actor.updateEmbeddedDocuments("Item", updates);
    }
  },

  /**
   * Restore original explodeValues on equipped weapons after berserk ends.
   */
  async _restoreWeaponExplodeValues(actor) {
    const weapons = actor.items.filter(i =>
      i.type === "equipment" &&
      i.system.equipmentType === "weapon" &&
      i.system.equipped &&
      i.getFlag(MODULE_ID, "originalExplodeValues") !== undefined
    );
    if (weapons.length === 0) return;

    const updates = [];
    for (const weapon of weapons) {
      const original = weapon.getFlag(MODULE_ID, "originalExplodeValues") ?? "";
      this._log(`Rage: Restoring explodeValues="${original}" on ${weapon.name}`);
      updates.push({
        _id: weapon.id,
        "system.explodeValues": original,
        [`flags.${MODULE_ID}.-=originalExplodeValues`]: null
      });
    }

    if (updates.length > 0) {
      await actor.updateEmbeddedDocuments("Item", updates);
    }
  },

  /* -------------------------------------------- */
  /*  Rage: Auto-Berserk + Die Upsizing + Cleanup */
  /* -------------------------------------------- */

  /**
   * Rage implementation:
   *
   * PERMANENT effects (from registry, created by FeatureDetector):
   * - incomingDamageReductionPerDie (Rage=1, Rip and Tear=1, system gates behind berserk)
   *
   * DYNAMIC effects (Rage (Active) companion AE, exists only while berserk):
   * - globalExplode=1, die size bonuses=+2, weapon explodeValues set per-weapon
   * - universalDamageBonus=1 (if Rip and Tear), frightened immunity
   *
   * RUNTIME hooks (below):
   * 1. Auto-apply Berserk on attack or taking damage
   * 2. Remove Berserk when combat ends
   */
  _registerRageHooks() {
    // --- Auto-apply Berserk when barbarian makes an attack ---
    // "you can go Berserk as part of making an attack"
    //
    // HOW WE DETECT AN ATTACK:
    // The system stores flags.vagabond.rerollData.type = 'attack' on weapon
    // attack chat messages. We use preCreateChatMessage to apply Berserk
    // BEFORE the card renders, so die upsizing can work on the same card.
    //
    // WHY preCreateChatMessage:
    // - Fires before the message is created and rendered
    // - The fork used a dialog prompt inside damage-helper.mjs (system-level code)
    //   but we can't modify that. preCreateChatMessage is the earliest reliable hook.
    // - We tried renderChatMessage but data-card-type="attack" doesn't exist on
    //   attack cards (the system uses type='generic' for the card, 'attack' is only
    //   in the nested rerollData flags).
    Hooks.on("preCreateChatMessage", async (message) => {
      if (!game.user.isGM) return;

      // Check if this is an attack message via flags
      const rerollType = message.flags?.vagabond?.rerollData?.type;
      if (rerollType !== "attack") return;

      const actorId = message.speaker?.actor;
      if (!actorId) return;
      const actor = game.actors.get(actorId);
      if (!actor || actor.type !== "character") return;
      if (!this._hasFeature(actor, "barbarian_rage")) return;
      if (this._isBerserk(actor)) return;
      if (!this._isLightOrNoArmor(actor)) return;

      this._log(`Rage: ${actor.name} attacking — auto-applying Berserk`);
      await actor.toggleStatusEffect("berserk", { active: true });
    });

    // --- Berserk status toggle → create/remove Rage companion AE ---
    // When Berserk is applied to a barbarian with Rage, create a companion
    // "Rage (Active)" AE that adds Frightened immunity (system config says
    // "Can't be Frightened" but doesn't enforce it).
    // When Berserk is removed, delete the companion AE.
    Hooks.on("createActiveEffect", async (effect, options, userId) => {
      if (!game.user.isGM) return;
      if (!effect.statuses?.has("berserk")) return;
      const actor = effect.parent;
      if (!actor || actor.type !== "character") return;
      if (!this._hasFeature(actor, "barbarian_rage")) return;

      // Don't create duplicates
      if (actor.effects.find(e => e.getFlag(MODULE_ID, "rageActive"))) return;

      const classItem = actor.items.find(i => i.type === "class");
      this._log(`Rage: Berserk applied to ${actor.name} — creating Rage (Active) companion AE`);

      // Build changes — these only apply while berserk (AE exists only while berserk)
      // NOTE: Frightened immunity from Berserk is handled globally in vagabond-character-enhancer.mjs,
      // not here — it applies to ALL berserk characters, not just barbarians.
      const changes = [
        // Exploding dice — enable global explode
        { key: "system.bonuses.globalExplode", mode: 2, value: "1" },
        // Die upsizing — +2 die face = one size larger (d4→d6, d6→d8, d8→d10, d10→d12)
        // Cover all weapon skill types since barbarian could use any weapon
        { key: "system.meleeDamageDieSizeBonus", mode: 2, value: "2" },
        { key: "system.rangedDamageDieSizeBonus", mode: 2, value: "2" },
        { key: "system.brawlDamageDieSizeBonus", mode: 2, value: "2" },
        { key: "system.finesseDamageDieSizeBonus", mode: 2, value: "2" }
      ];

      // If actor has Rip and Tear, add +1 universal damage bonus
      if (this._hasFeature(actor, "barbarian_ripAndTear")) {
        changes.push({ key: "system.universalDamageBonus", mode: 2, value: "1" });
      }

      await actor.createEmbeddedDocuments("ActiveEffect", [{
        name: "Rage (Active)",
        icon: "icons/skills/melee/hand-grip-sword-red.webp",
        origin: classItem?.uuid || actor.uuid,
        flags: { [MODULE_ID]: { managed: true, rageActive: true } },
        changes: changes,
        disabled: false,
        transfer: true
      }]);

      // Set explodeValues on each equipped weapon so explosion uses the correct max face.
      // globalExplode enables explosion globally, but the system still needs per-item
      // explodeValues to know WHICH values trigger it (max face of the upsized die).
      await this._setWeaponExplodeValues(actor, 2);
    });

    Hooks.on("deleteActiveEffect", async (effect, options, userId) => {
      if (!game.user.isGM) return;
      if (!effect.statuses?.has("berserk")) return;
      const actor = effect.parent;
      if (!actor || actor.type !== "character") return;

      // Restore original explodeValues on weapons
      await this._restoreWeaponExplodeValues(actor);

      const rageActive = actor.effects.find(e => e.getFlag(MODULE_ID, "rageActive"));
      if (rageActive) {
        this._log(`Rage: Berserk removed from ${actor.name} — removing Rage (Active) companion AE`);
        await rageActive.delete();
      }
    });

    // --- Visual indicator + Rage DR breakdown on chat cards ---
    Hooks.on("renderChatMessage", (message, html) => {
      const el = html instanceof jQuery ? html[0] : html;

      // Add RAGE tag to attack cards from berserk barbarians
      const speakerActor = message.speaker?.actor ? game.actors.get(message.speaker.actor) : null;
      if (speakerActor &&
          this._hasFeature(speakerActor, "barbarian_rage") &&
          this._isBerserk(speakerActor) &&
          this._isLightOrNoArmor(speakerActor)) {
        const header = el.querySelector(".card-header");
        if (header && !header.querySelector(".vce-rage-tag")) {
          const rageTag = document.createElement("span");
          rageTag.className = "vce-rage-tag";
          rageTag.textContent = "RAGE";
          header.appendChild(rageTag);
        }
      }

      // Add Rage DR breakdown to save-roll / damage application cards
      // targeting a berserk barbarian
      const formulaLine = el.querySelector(".damage-formula-line");
      if (!formulaLine) return;

      // Find the target actor from the apply button
      const applyBtn = el.querySelector(".vagabond-apply-save-damage-button, .vagabond-apply-direct-button");
      if (!applyBtn) return;

      // The target actor might be in data-targets (Apply Direct) or data-actor-id (save result)
      let targetActor = null;
      const targetsJson = applyBtn.dataset.targets;
      if (targetsJson) {
        try {
          const targets = JSON.parse(targetsJson.replace(/&quot;/g, '"'));
          if (targets[0]?.actorId) targetActor = game.actors.get(targets[0].actorId);
        } catch (e) { /* ignore parse errors */ }
      }
      if (!targetActor && applyBtn.dataset.actorName) {
        // Save result cards use data-actor-id as the TARGET
        targetActor = game.actors.get(applyBtn.dataset.actorId);
      }

      if (!targetActor) return;
      if (!this._hasFeature(targetActor, "barbarian_rage") ||
          !this._isBerserk(targetActor) ||
          !this._isLightOrNoArmor(targetActor)) return;

      // Calculate Rage DR from the displayed values
      const armorSpan = formulaLine.querySelector('.damage-component[title^="Armor"]');
      const finalSpan = formulaLine.querySelector(".damage-final");
      const totalSpan = formulaLine.querySelector('.damage-component[title="Total Damage"]');
      if (!armorSpan || !finalSpan || !totalSpan) return;

      const totalDamage = parseInt(totalSpan.textContent.trim()) || 0;
      const finalDamage = parseInt(finalSpan.textContent.trim()) || 0;
      const totalReduction = totalDamage - finalDamage;
      const actualArmor = targetActor.system.armor || 0;
      const rageDR = totalReduction - actualArmor;

      if (rageDR <= 0) return;
      if (formulaLine.querySelector(".vce-rage-dr")) return; // already modified

      // Update armor span to show only actual armor
      armorSpan.innerHTML = `<i class="fa-sharp fa-regular fa-shield"></i> ${actualArmor}`;
      armorSpan.title = `Armor: ${actualArmor}`;

      // Insert Rage DR span after the armor span
      const rageDRSpan = document.createElement("span");
      rageDRSpan.className = "damage-component vce-rage-dr";
      rageDRSpan.title = `Rage DR: ${targetActor.system.incomingDamageReductionPerDie}/die`;
      rageDRSpan.innerHTML = `<i class="fa-solid fa-fire" style="color:#c43c3c"></i> ${rageDR}`;

      const operator = document.createElement("span");
      operator.className = "damage-operator";
      operator.textContent = "-";

      armorSpan.after(operator, rageDRSpan);
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

    // --- Remove Berserk when combat ends ---
    Hooks.on("deleteCombat", async (combat) => {
      if (!game.user.isGM) return;
      for (const combatant of combat.combatants) {
        const actor = combatant.actor;
        if (!actor || actor.type !== "character") continue;

        // Remove Berserk if barbarian has Rage
        if (this._hasFeature(actor, "barbarian_rage") && this._isBerserk(actor)) {
          this._log(`Rage: Combat ended — removing Berserk from ${actor.name}`);
          await actor.toggleStatusEffect("berserk", { active: false });
          // Note: deleteActiveEffect hook will clean up Rage (Active) companion AE
        }

        // Remove Aggressor speed bonus if still active
        if (this._hasFeature(actor, "barbarian_aggressor")) {
          const aggressorEffect = actor.effects.find(e => e.getFlag(MODULE_ID, "aggressor"));
          if (aggressorEffect) {
            this._log(`Aggressor: Combat ended — removing speed bonus from ${actor.name}`);
            await aggressorEffect.delete();
          }
        }
      }
    });
  },


  /* -------------------------------------------- */
  /*  Aggressor: +10 Speed First Round            */
  /* -------------------------------------------- */

  _registerAggressorHooks() {
    // Single updateCombat hook handles both apply and remove.
    // Apply: when combat starts (round 0 → 1), but NOT on turn changes in round 1.
    // Remove: when round advances past 1 (round 1 → 2), meaning first round is over.
    Hooks.on("updateCombat", async (combat, changes) => {
      if (!game.user.isGM) return;

      // Round changed to 1 (combat just started)
      if (changes.round === 1 && combat.previous?.round === 0) {
        for (const combatant of combat.combatants) {
          const actor = combatant.actor;
          if (!actor || actor.type !== "character") continue;
          if (!this._hasFeature(actor, "barbarian_aggressor")) continue;

          this._log(`Aggressor: Applying +10 speed to ${actor.name}`);
          await this._applyAggressorEffect(actor);
        }
        return; // Don't process turn changes on the same update
      }

      // Round changed past 1 — first round is over, remove speed bonus
      if (changes.round === 2 && combat.previous?.round === 1) {
        for (const combatant of combat.combatants) {
          const actor = combatant.actor;
          if (!actor || actor.type !== "character") continue;
          if (!this._hasFeature(actor, "barbarian_aggressor")) continue;

          const existing = actor.effects.find(e => e.getFlag(MODULE_ID, "aggressor"));
          if (existing) {
            await this._removeAggressorEffect(actor);
            this._log(`Aggressor: Round 1 over — removed +10 speed from ${actor.name}`);
          }
        }
      }
    });
  },

  async _applyAggressorEffect(actor) {
    const existing = actor.effects.find(e => e.getFlag(MODULE_ID, "aggressor"));
    if (existing) return;

    // Use class item UUID as origin so Source shows "Barbarian" instead of "Unknown"
    const classItem = actor.items.find(i => i.type === "class");
    const origin = classItem?.uuid || actor.uuid;

    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: "Aggressor",
      icon: "icons/skills/movement/feet-winged-boots-brown.webp",
      origin: origin,
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
    // Detect NPC kills via HP → 0
    Hooks.on("updateActor", async (actor, changes) => {
      if (!game.user.isGM) return;
      if (actor.type !== "npc") return;

      const newHP = changes.system?.health?.value;
      if (newHP === undefined || newHP > 0) return;

      // Find the attacker from recent chat messages
      const attacker = this._findRecentAttacker(actor);
      if (!attacker) return;
      if (!this._hasFeature(attacker, "barbarian_fearmonger")) return;

      await this._applyFearmonger(actor, attacker);
    });

    // Auto-expire Frightened effects from Fearmonger on round change
    Hooks.on("updateCombat", async (combat, changed) => {
      if (!("round" in changed)) return;
      if (!game.user.isGM) return;

      const currentRound = combat.round;
      for (const combatant of combat.combatants) {
        const actor = combatant.actor;
        if (!actor) continue;

        const toRemove = [];
        for (const effect of actor.effects) {
          if (!effect.statuses?.has("frightened")) continue;
          const expireRound = effect.getFlag(MODULE_ID, "fearmongerExpireRound");
          if (expireRound != null && currentRound > expireRound) {
            toRemove.push(effect.id);
          }
        }

        if (toRemove.length > 0) {
          await actor.deleteEmbeddedDocuments("ActiveEffect", toRemove);
          this._log(`Fearmonger: Frightened expired on ${actor.name}`);
        }
      }
    });
  },

  /**
   * Find the most recent attacker of a target from chat messages.
   * Scans recent attack/damage cards to identify who targeted this actor.
   */
  _findRecentAttacker(targetActor) {
    const targetId = targetActor.id;
    const recent = game.messages.contents.slice(-10);
    for (let i = recent.length - 1; i >= 0; i--) {
      const msg = recent[i];
      // Check flags for target info
      const targets = msg.flags?.vagabond?.targets;
      if (targets?.some(t => t.actorId === targetId)) {
        const attackerId = msg.speaker?.actor;
        if (attackerId) return game.actors.get(attackerId);
      }
      // Also check button targets in message content
      const content = msg.content || "";
      if (content.includes(targetId) && msg.speaker?.actor) {
        return game.actors.get(msg.speaker.actor);
      }
    }
    return null;
  },

  /**
   * Apply Frightened to nearby weaker NPCs when a kill occurs.
   * Based on fork's checkFearmonger implementation.
   */
  async _applyFearmonger(killedNpc, attacker) {
    if (!canvas?.tokens?.placeables) return;

    const attackerLevel = attacker.system.attributes?.level?.value || 1;
    const currentRound = game.combat?.round || 0;

    // Find the killed NPC's token on canvas
    const killedToken = canvas.tokens.placeables.find(t => t.actor?.id === killedNpc.id);
    if (!killedToken) return;

    this._log(`Fearmonger: ${attacker.name} killed ${killedNpc.name}, checking for weaker enemies within 30ft`);

    const frightenedTokens = [];
    for (const token of canvas.tokens.placeables) {
      if (!token.actor || token.actor.type !== "npc") continue;
      if (token.id === killedToken.id) continue;

      // Skip dead NPCs
      const tokenHP = token.actor.system.health?.value ?? 0;
      if (tokenHP <= 0) continue;

      // Check distance (30ft = Near)
      const dist = canvas.grid.measurePath([killedToken.center, token.center]).distance;
      if (dist > 30) continue;

      // Check HD < attacker Level
      const hd = token.actor.system.hd || token.actor.system.hitDice || 0;
      if (hd >= attackerLevel) continue;

      // Check immunity
      const immunities = token.actor.system.statusImmunities || [];
      if (immunities.includes("frightened")) continue;

      // Skip already frightened
      if (token.actor.statuses?.has("frightened")) continue;

      frightenedTokens.push(token);
    }

    if (frightenedTokens.length === 0) return;

    // Apply Frightened with auto-expire flag
    for (const token of frightenedTokens) {
      const frightDef = CONFIG.statusEffects.find(e => e.id === "frightened");
      if (!frightDef) continue;

      await token.actor.createEmbeddedDocuments("ActiveEffect", [{
        name: frightDef.name || "Frightened",
        img: frightDef.img || "icons/svg/hazard.svg",
        statuses: ["frightened"],
        changes: frightDef.changes || [],
        flags: {
          [MODULE_ID]: {
            fearmongerExpireRound: currentRound + 1
          }
        }
      }]);
      this._log(`Fearmonger: Applied Frightened to ${token.actor.name} (expires round ${currentRound + 2})`);
    }

    ui.notifications.info(`Fearmonger: ${frightenedTokens.length} enemy(s) Frightened!`);
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
