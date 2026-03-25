/**
 * Dancer Class Features
 * Registry entries + runtime hooks for all Dancer features.
 */

import { MODULE_ID } from "../vagabond-character-enhancer.mjs";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

/**
 * All Dancer class features.
 * Keys are lowercase feature names matching the class compendium's levelFeatures.
 *
 * Status key:
 *   "module"  — Fully handled by this module (managed AE and/or runtime hook).
 *   "partial" — System handles part, module handles the rest. See notes.
 *   "todo"    — Needs implementation. Not yet working.
 */
export const DANCER_REGISTRY = {
  // ──────────────────────────────────────────────
  // L1: Fleet of Foot
  // ──────────────────────────────────────────────
  // RULES: You gain the Treads Lightly Perk, and the roll for you to Crit on
  // Reflex Saves is reduced by an amount equal to (your Dancer Level / 4, round up).
  //
  // STATUS: module
  //
  // MODULE HANDLES:
  //   - Managed AE on system.reflexCritBonus with dynamic value based on dancer level.
  //   - The system's calculateCritThreshold() already reads rollData.reflexCritBonus
  //     for 'reflex' type rolls (roll-builder.mjs:199).
  //   - Value is updated on level change via updateActor hook.
  "fleet of foot": {
    class: "dancer",
    level: 1,
    flag: "dancer_fleetOfFoot",
    description: "Gain Treads Lightly Perk. Reflex Save crit reduced by (ceil Dancer Level / 4).",
    effects: [
      {
        label: "Fleet of Foot (Reflex Crit)",
        icon: "icons/skills/movement/feet-winged-sandals-tan.webp",
        changes: [
          { key: "system.reflexCritBonus", mode: 2, value: "-1" }
        ]
      }
    ]
  },

  // ──────────────────────────────────────────────
  // L1: Step Up
  // ──────────────────────────────────────────────
  // RULES: Once per Turn, use your Action to perform an enlivening dance.
  // Roll 2d20kh on Reflex Saves until start of next Turn, and give one Ally
  // that sees you a second Action this Turn.
  //
  // STATUS: module
  //
  // MODULE HANDLES:
  //   - Relic item intercept (preCreateChatMessage) to trigger Step Up dialog.
  //   - Dialog to pick ally (1 or 2 with Double Time).
  //   - Sets stepUpActive flag on dancer (2d20kh Reflex via _rollSave patch).
  //   - Sets stepUpBonusAction flag on ally.
  //   - Combat round expiry for all Step Up flags.
  "step up": {
    class: "dancer",
    level: 1,
    flag: "dancer_stepUp",
    description: "Action to dance: roll 2d20 on Reflex Saves (use higher) until next Turn, and give one Ally a second Action."
  },

  // ──────────────────────────────────────────────
  // L2: Evasive
  // ──────────────────────────────────────────────
  // RULES: While you aren't Incapacitated, you ignore Hinder on Reflex Saves
  // and you ignore two of a Dodged attack's damage dice on a passed Save,
  // rather than one.
  //
  // STATUS: module (hinder immunity only; double dodge ignore is TODO)
  //
  // MODULE HANDLES:
  //   - Patches _rollSave and RollHandler.roll to strip hinder from Reflex saves.
  //   - Same pattern as Bravado (Will save hinder immunity).
  "evasive": {
    class: "dancer",
    level: 2,
    flag: "dancer_evasive",
    description: "Ignore Hinder on Reflex Saves while not Incapacitated. Ignore two Dodged damage dice instead of one."
  },

  // ──────────────────────────────────────────────
  // L4: Don't Stop Me Now
  // ──────────────────────────────────────────────
  // RULES: Your Speed is not affected by Difficult Terrain and you have Favor
  // on Saves against being Paralyzed, Restrained, or moved.
  //
  // STATUS: todo — flag detection only, no runtime hooks yet.
  "don't stop me now": {
    class: "dancer",
    level: 4,
    flag: "dancer_dontStopMeNow",
    description: "Speed unaffected by Difficult Terrain. Favor on Saves vs Paralyzed, Restrained, or being moved."
  },

  // ──────────────────────────────────────────────
  // L6: Choreographer
  // ──────────────────────────────────────────────
  // RULES: When you use Step Up, the Ally gains Favor on the first Check
  // they make with the Action you give them, and you both gain a 10 foot
  // bonus to Speed for the Round.
  //
  // STATUS: module
  //
  // MODULE HANDLES:
  //   - Extends performStepUp() to grant choreographerFavor flag on ally.
  //   - Creates temporary speed bonus AE (+10 speed) on dancer and ally.
  //   - Favor is consumed on the ally's next d20 roll via roll method patches.
  //   - Speed AE is cleaned up on combat round expiry.
  "choreographer": {
    class: "dancer",
    level: 6,
    flag: "dancer_choreographer",
    description: "Step Up Ally gets Favor on first Check with the granted Action. You both gain +10 Speed for the Round."
  },

  // ──────────────────────────────────────────────
  // L8: Flash of Beauty
  // ──────────────────────────────────────────────
  // RULES: When you Crit on a Save, you can take two Actions, rather than one.
  //
  // STATUS: module
  //
  // MODULE HANDLES:
  //   - Hooks renderChatMessage to detect save crits by the dancer.
  //   - Injects a gold-bordered reminder into the chat card.
  "flash of beauty": {
    class: "dancer",
    level: 8,
    flag: "dancer_flashOfBeauty",
    description: "When you Crit on a Save, take two Actions instead of one."
  },

  // ──────────────────────────────────────────────
  // L10: Double Time
  // ──────────────────────────────────────────────
  // RULES: You can Target two Allies with your Step Up Feature, rather than one.
  //
  // STATUS: module
  //
  // MODULE HANDLES:
  //   - Modifies performStepUp() dialog to allow selecting up to 2 allies.
  "double time": {
    class: "dancer",
    level: 10,
    flag: "dancer_doubleTime",
    description: "Step Up can Target two Allies instead of one."
  }
};

/* -------------------------------------------- */
/*  Dancer Runtime Hooks                        */
/* -------------------------------------------- */

export const DancerFeatures = {
  registerHooks() {
    this._registerFleetOfFootHooks();
    this._registerStepUpHooks();
    this._registerFlashOfBeautyHooks();
    this._registerCombatExpiryHooks();
    this._log("Dancer hooks registered.");
  },

  _log(...args) {
    if (game.settings.get(MODULE_ID, "debugMode")) {
      console.log(`${MODULE_ID} | Dancer |`, ...args);
    }
  },

  _hasFeature(actor, flag) {
    const features = actor?.getFlag(MODULE_ID, "features");
    return features?.[flag] ?? false;
  },

  /* -------------------------------------------- */
  /*  Fleet of Foot: Dynamic Reflex Crit Bonus    */
  /* -------------------------------------------- */

  /**
   * The managed AE is created by the FeatureDetector with a static value of "-1".
   * We hook updateActor to update the AE value when the dancer's level changes.
   * Formula: -ceil(dancerLevel / 4)
   */
  _registerFleetOfFootHooks() {
    Hooks.on("updateActor", async (actor, changes) => {
      if (!game.user.isGM) return;
      if (actor.type !== "character") return;
      if (!changes.system?.attributes?.level) return;
      if (!this._hasFeature(actor, "dancer_fleetOfFoot")) return;

      const level = actor.system.attributes?.level?.value ?? 1;
      const critBonus = -Math.ceil(level / 4);

      // Find the managed AE for Fleet of Foot
      const ae = actor.effects.find(e =>
        e.getFlag(MODULE_ID, "managed") &&
        e.getFlag(MODULE_ID, "featureFlag") === "dancer_fleetOfFoot"
      );
      if (!ae) return;

      // Check if value needs updating
      const currentValue = ae.changes?.[0]?.value;
      if (currentValue === String(critBonus)) return;

      await ae.update({
        changes: [{ key: "system.reflexCritBonus", mode: 2, value: String(critBonus) }]
      });
      this._log(`Fleet of Foot: Updated reflexCritBonus to ${critBonus} for ${actor.name} (level ${level})`);
    });

    // Also update on initial feature detection (scan triggers createEmbeddedDocuments,
    // then we fix the value here). Hook createActiveEffect to catch the initial AE creation.
    Hooks.on("createActiveEffect", async (effect) => {
      if (!game.user.isGM) return;
      if (!effect.getFlag(MODULE_ID, "managed")) return;
      if (effect.getFlag(MODULE_ID, "featureFlag") !== "dancer_fleetOfFoot") return;

      const actor = effect.parent;
      if (!actor) return;

      const level = actor.system.attributes?.level?.value ?? 1;
      const critBonus = -Math.ceil(level / 4);
      const currentValue = effect.changes?.[0]?.value;

      if (currentValue !== String(critBonus)) {
        await effect.update({
          changes: [{ key: "system.reflexCritBonus", mode: 2, value: String(critBonus) }]
        });
        this._log(`Fleet of Foot: Set initial reflexCritBonus to ${critBonus} for ${actor.name} (level ${level})`);
      }
    });
  },

  /* -------------------------------------------- */
  /*  Step Up: Dialog + Buff System               */
  /* -------------------------------------------- */

  _registerStepUpHooks() {
    // Intercept "Step Up" relic item usage from character sheet
    Hooks.on("preCreateChatMessage", (message) => {
      if (!game.user.isGM) return;
      const itemId = message.flags?.vagabond?.itemId;
      const actorId = message.flags?.vagabond?.actorId || message.speaker?.actor;
      if (!itemId || !actorId) return;

      const actor = game.actors.get(actorId);
      if (!actor) return;
      const item = actor.items.get(itemId);
      if (!item) return;
      if (!item.name.toLowerCase().includes("step up")) return;
      if (!this._hasFeature(actor, "dancer_stepUp")) return;

      this._log(`Step Up: Intercepted item use — opening dialog for ${actor.name}`);
      this.performStepUp(actor);
      return false;
    });
  },

  /**
   * Open a dialog to select ally targets for Step Up.
   * Grants the dancer 2d20kh on Reflex Saves and the ally a bonus Action.
   */
  async performStepUp(actor) {
    // Get ally tokens on the canvas (exclude the dancer)
    const dancerToken = canvas.tokens?.placeables?.find(t => t.actor?.id === actor.id);
    const allyTokens = canvas.tokens?.placeables?.filter(t => {
      if (!t.actor || t.actor.id === actor.id) return false;
      if (t.actor.type !== "character") return false;
      return true;
    }) ?? [];

    if (allyTokens.length === 0) {
      ui.notifications.warn("No allies visible on the canvas for Step Up.");
      return;
    }

    const maxTargets = this._hasFeature(actor, "dancer_doubleTime") ? 2 : 1;
    const hasChoreographer = this._hasFeature(actor, "dancer_choreographer");

    // Build checkbox HTML for ally selection
    const allyOptions = allyTokens.map(t => {
      const img = t.actor.img || "icons/svg/mystery-man.svg";
      return `<label class="vce-stepup-ally-label">
        <input type="checkbox" name="ally" value="${t.actor.id}">
        <img src="${img}" width="36" height="36" class="vce-stepup-ally-img" alt="${t.actor.name}">
        <span>${t.actor.name}</span>
      </label>`;
    }).join("");

    const content = `
      <p class="vce-stepup-intro">
        <strong>${actor.name}</strong> performs an enlivening dance!
        Select ${maxTargets > 1 ? `up to ${maxTargets} allies` : "an ally"} to grant a bonus Action:
      </p>
      <div class="vce-stepup-scroll">
        ${allyOptions}
      </div>
      ${hasChoreographer ? `<p class="vce-choreographer-note">
        <i class="fas fa-music" aria-hidden="true"></i> Choreographer: Ally gets Favor on first Check. Both gain +10 Speed.
      </p>` : ""}
    `;

    const confirmed = await Dialog.prompt({
      title: "Step Up",
      content,
      label: "Step Up!",
      callback: (html) => {
        const checked = html.find ? html.find("input[name='ally']:checked") : html.querySelectorAll("input[name='ally']:checked");
        const checkedArr = html.find ? checked.toArray() : Array.from(checked);
        return checkedArr.map(el => el.value);
      },
      rejectClose: false
    });

    if (!confirmed || confirmed.length === 0) return;

    // Enforce max targets
    const selectedIds = confirmed.slice(0, maxTargets);
    const currentRound = game.combat?.round ?? 0;

    // Activate Step Up on the dancer (2d20kh on Reflex Saves)
    await actor.setFlag(MODULE_ID, "stepUpActive", true);
    await actor.setFlag(MODULE_ID, "stepUpExpireRound", currentRound + 1);

    // Build chat tags
    const tags = ["Step Up"];

    // Apply buffs to each selected ally
    for (const allyId of selectedIds) {
      const ally = game.actors.get(allyId);
      if (!ally) continue;

      // Grant bonus action flag
      await ally.setFlag(MODULE_ID, "stepUpBonusAction", true);
      await ally.setFlag(MODULE_ID, "stepUpBonusActionExpireRound", currentRound + 1);

      // Choreographer: Favor on first check + speed bonus
      if (hasChoreographer) {
        await ally.setFlag(MODULE_ID, "choreographerFavor", true);
        await ally.setFlag(MODULE_ID, "choreographerFavorExpireRound", currentRound + 1);

        // Speed bonus AE on ally (+10)
        await this._createSpeedBonusAE(ally, currentRound);
        tags.push("Choreographer");
      }
    }

    // Choreographer: Speed bonus on dancer too
    if (hasChoreographer) {
      await this._createSpeedBonusAE(actor, currentRound);
    }

    if (this._hasFeature(actor, "dancer_doubleTime") && selectedIds.length > 1) {
      tags.push("Double Time");
    }

    // Post chat card using system's vagabond-chat-card-v2 structure
    const allyNames = selectedIds.map(id => game.actors.get(id)?.name).filter(Boolean).join(", ");
    const metaTags = tags.map(t => `
      <div class="meta-tag">
        <span>${t}</span>
      </div>
    `).join("");

    let descriptionLines = `<p>${allyNames} ${selectedIds.length > 1 ? "gain" : "gains"} a bonus Action this Turn.</p>`;
    if (hasChoreographer) {
      descriptionLines += `<p><i class="fas fa-music"></i> +10 Speed &amp; Favor on first Check</p>`;
    }

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `
        <div class="vagabond-chat-card-v2" data-card-type="generic">
          <div class="card-body">
            <header class="card-header">
              <div class="header-icon">
                <img src="icons/magic/life/heart-pink.webp" alt="Step Up">
              </div>
              <div class="header-info">
                <h3 class="header-title">Step Up</h3>
                <div class="metadata-tags-row">
                  ${metaTags}
                </div>
              </div>
            </header>
            <section class="content-body">
              <div class="card-description vce-card-desc-centered">
                ${descriptionLines}
              </div>
            </section>
          </div>
        </div>
      `
    });

    this._log(`Step Up: Activated for ${actor.name}, allies: ${allyNames}`);
  },

  /**
   * Create a temporary +10 Speed bonus AE on an actor.
   * Marked for cleanup on combat round expiry.
   */
  async _createSpeedBonusAE(actor, currentRound) {
    // Don't create duplicates
    if (actor.effects.find(e => e.getFlag(MODULE_ID, "choreographerSpeed"))) return;

    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: "Choreographer (+10 Speed)",
      icon: "icons/skills/movement/feet-winged-sandals-tan.webp",
      flags: {
        [MODULE_ID]: {
          managed: true,
          choreographerSpeed: true,
          expireRound: currentRound + 1
        }
      },
      changes: [
        { key: "system.speed.bonus", mode: 2, value: "10" }
      ],
      disabled: false,
      transfer: false
    }]);
    this._log(`Choreographer: Created +10 Speed AE on ${actor.name}`);
  },

  /* -------------------------------------------- */
  /*  Flash of Beauty: Crit Save Reminder         */
  /* -------------------------------------------- */

  _registerFlashOfBeautyHooks() {
    Hooks.on("renderChatMessage", (message, html) => {
      const el = html instanceof jQuery ? html[0] : html;

      // Look for save roll results in the chat card (system uses .roll-strip with .roll-result-banner)
      const saveResult = el.querySelector(".roll-result-banner, .roll-strip");
      if (!saveResult) return;

      // Check if this is a save roll by looking for save-related data
      const actorId = message.speaker?.actor;
      if (!actorId) return;
      const actor = game.actors.get(actorId);
      if (!actor) return;
      if (!this._hasFeature(actor, "dancer_flashOfBeauty")) return;

      // Check if the roll was a crit
      const rolls = message.rolls;
      if (!rolls?.length) return;

      const roll = rolls[0];
      const d20Term = roll.terms?.find(t => t.constructor?.name === "Die" && t.faces === 20);
      if (!d20Term) return;

      // Get the active d20 result (handle 2d20kh correctly)
      const activeResults = d20Term.results?.filter(r => r.active !== false) ?? [];
      const d20Result = activeResults.length > 0
        ? Math.max(...activeResults.map(r => r.result))
        : d20Term.results?.[0]?.result ?? 0;

      // Determine save type from flags (most reliable) or message content fallback
      const rollData = actor.getRollData();
      let saveType = message.flags?.vagabond?.rerollData?.key || null;
      if (!saveType) {
        const msgContent = message.content || "";
        if (msgContent.toLowerCase().includes("reflex")) saveType = "reflex";
        else if (msgContent.toLowerCase().includes("endure")) saveType = "endure";
        else if (msgContent.toLowerCase().includes("will")) saveType = "will";
      }

      // Import is async so we compute inline — the system uses critNumber from rollData
      // plus type-specific bonuses. For saves, only reflex/endure have bonuses.
      let critThreshold = rollData.critNumber || 20;
      if (saveType === "reflex") critThreshold += (rollData.reflexCritBonus || 0);
      else if (saveType === "endure") critThreshold += (rollData.endureCritBonus || 0);
      critThreshold = Math.max(1, Math.min(20, critThreshold));

      if (d20Result < critThreshold) return;

      // It's a crit! Inject the reminder using system card styling
      if (el.querySelector(".vce-flash-of-beauty")) return; // Don't double-inject

      // Find the card body to insert into, or fall back to message-content
      const cardBody = el.querySelector(".card-body") || el.querySelector(".message-content");
      if (!cardBody) return;

      const reminder = document.createElement("section");
      reminder.className = "vce-flash-of-beauty content-body";
      reminder.innerHTML = `
        <div class="card-description vce-card-desc-centered-lg">
          <div class="metadata-tags-row vce-flash-tag-row">
            <div class="meta-tag vce-flash-tag">
              <i class="fas fa-star"></i>
              <span>Flash of Beauty</span>
            </div>
          </div>
          <p>${actor.name} can take <strong>two Actions</strong> this turn!</p>
        </div>
      `;
      cardBody.appendChild(reminder);

      this._log(`Flash of Beauty: Crit save detected for ${actor.name} (d20: ${d20Result}, threshold: ${critThreshold})`);
    });
  },

  /* -------------------------------------------- */
  /*  Combat Round Expiry                         */
  /* -------------------------------------------- */

  _registerCombatExpiryHooks() {
    // Expire buffs when combat round advances
    Hooks.on("updateCombat", async (combat, changes) => {
      if (!game.user.isGM) return;
      if (!changes.round && !changes.turn) return;
      const currentRound = combat.round;
      await this._expireStepUpBuffsByRound(currentRound);
    });

    // Clear all buffs when combat ends
    Hooks.on("deleteCombat", async () => {
      if (!game.user.isGM) return;
      await this._expireAllStepUpBuffs();
    });
  },

  /**
   * Expire Step Up / Choreographer buffs that have passed their expiry round.
   */
  async _expireStepUpBuffsByRound(currentRound) {
    const characters = game.actors.filter(a => a.type === "character");
    for (const actor of characters) {
      // Step Up active (dancer's 2d20kh)
      const stepUpExpire = actor.getFlag(MODULE_ID, "stepUpExpireRound");
      if (stepUpExpire !== undefined && currentRound >= stepUpExpire) {
        await actor.unsetFlag(MODULE_ID, "stepUpActive");
        await actor.unsetFlag(MODULE_ID, "stepUpExpireRound");
        this._log(`Step Up: Expired 2d20kh on ${actor.name}`);
      }

      // Bonus action (ally)
      const bonusExpire = actor.getFlag(MODULE_ID, "stepUpBonusActionExpireRound");
      if (bonusExpire !== undefined && currentRound >= bonusExpire) {
        await actor.unsetFlag(MODULE_ID, "stepUpBonusAction");
        await actor.unsetFlag(MODULE_ID, "stepUpBonusActionExpireRound");
        this._log(`Step Up: Expired bonus action on ${actor.name}`);
      }

      // Choreographer favor (ally)
      const favorExpire = actor.getFlag(MODULE_ID, "choreographerFavorExpireRound");
      if (favorExpire !== undefined && currentRound >= favorExpire) {
        await actor.unsetFlag(MODULE_ID, "choreographerFavor");
        await actor.unsetFlag(MODULE_ID, "choreographerFavorExpireRound");
        this._log(`Choreographer: Expired favor on ${actor.name}`);
      }

      // Choreographer speed AE
      const speedAE = actor.effects.find(e => e.getFlag(MODULE_ID, "choreographerSpeed"));
      if (speedAE) {
        const aeExpire = speedAE.getFlag(MODULE_ID, "expireRound");
        if (aeExpire !== undefined && currentRound >= aeExpire) {
          await speedAE.delete();
          this._log(`Choreographer: Expired speed AE on ${actor.name}`);
        }
      }
    }
  },

  /**
   * Clear ALL Step Up / Choreographer buffs unconditionally (combat end).
   */
  async _expireAllStepUpBuffs() {
    const characters = game.actors.filter(a => a.type === "character");
    for (const actor of characters) {
      // Clear all Step Up flags
      if (actor.getFlag(MODULE_ID, "stepUpActive") !== undefined) {
        await actor.unsetFlag(MODULE_ID, "stepUpActive");
        await actor.unsetFlag(MODULE_ID, "stepUpExpireRound");
      }
      if (actor.getFlag(MODULE_ID, "stepUpBonusAction") !== undefined) {
        await actor.unsetFlag(MODULE_ID, "stepUpBonusAction");
        await actor.unsetFlag(MODULE_ID, "stepUpBonusActionExpireRound");
      }
      if (actor.getFlag(MODULE_ID, "choreographerFavor") !== undefined) {
        await actor.unsetFlag(MODULE_ID, "choreographerFavor");
        await actor.unsetFlag(MODULE_ID, "choreographerFavorExpireRound");
      }

      // Delete Choreographer speed AE
      const speedAE = actor.effects.find(e => e.getFlag(MODULE_ID, "choreographerSpeed"));
      if (speedAE) await speedAE.delete();
    }
    this._log("Step Up: All buffs cleared (combat ended).");
  }
};
