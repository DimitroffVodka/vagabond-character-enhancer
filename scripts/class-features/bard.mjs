/**
 * Bard Class Features
 * Registry entries + runtime hooks for all Bard features.
 */

import { MODULE_ID } from "../vagabond-character-enhancer.mjs";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

/**
 * All Bard class features.
 * Keys are lowercase feature names matching the class compendium's levelFeatures.
 *
 * Status key:
 *   "system"  — Fully handled by mordachai's base system. Module does nothing.
 *   "module"  — Fully handled by this module (managed AE and/or runtime hook).
 *   "partial" — System handles part, module handles the rest. See notes.
 *   "flavor"  — Roleplay/narrative only. Nothing to automate.
 *   "todo"    — Needs implementation. Not yet working.
 */
export const BARD_REGISTRY = {
  // ──────────────────────────────────────────────
  // L1: Virtuoso
  // ──────────────────────────────────────────────
  // RULES: You can use your Action or skip your Move to make a Performance Check.
  // If you pass, your Group gains one of the following benefits of your choice
  // for that Round:
  //   - Inspiration: d6 bonus to Healing rolls
  //   - Resolve: Favor on Saves
  //   - Valor: Favor on Attack and Cast Checks
  //
  // STATUS: module
  //
  // SYSTEM HANDLES:
  //   - favorHinder field exists on actor schema (global for all rolls)
  //   - VagabondRollBuilder reads actor.system.favorHinder for roll construction
  //   - Performance skill exists with trained/difficulty/bonus fields
  //
  // MODULE HANDLES:
  //   - Virtuoso action: triggered via game.vagabondCharacterEnhancer.virtuoso(actor)
  //     or via macro. Rolls Performance check using system's VagabondRollBuilder.
  //   - On success, presents chat card with Valor/Resolve/Inspiration buttons
  //   - Applies temporary AE to all PCs in combat with chosen buff
  //   - Auto-expires on round change via updateCombat hook
  //   - Valor/Resolve: favor applied via monkey-patch of VagabondRollBuilder.buildAndEvaluateD20
  //     (see vagabond-character-enhancer.mjs). Checks for Virtuoso buff AE flag on actor
  //     and combines with existing favor/hinder (hinder + favor = cancel to "none").
  //     NOTE: System has no per-type favor fields (attack-only or save-only),
  //     so both Valor and Resolve apply global favor. This is a known limitation.
  //     The fork solved this by adding dedicated system fields (virtuosoSavesFavor,
  //     virtuosoAttacksFavor) which don't exist in base system v5.0.0.
  //   - Inspiration: creates AE with flag only (no mechanical change). The d6
  //     healing bonus is not automated — system has no healing bonus field we can
  //     hook from module level. Players/GM track it manually via the AE indicator.
  //
  // APPROACHES THAT DIDN'T WORK:
  //   - AE OVERRIDE on system.favorHinder — bulldozed flanking hinder. Favor should
  //     CANCEL hinder (to "none"), not override it. Solution: monkey-patch
  //     buildAndEvaluateD20 to combine favor with existing state properly.
  //   - Type-specific favor (attack-only, save-only) — system's favorHinder is global.
  //     Would require monkey-patching RollHandler.prototype.roll() to check roll type
  //     and apply favor selectively. Planned for future refinement.
  //   - Setting Bard-specific schema fields (virtuosoSavesFavor etc.) — these fields
  //     don't exist in base system v5.0.0, only in the fork.
  //
  "virtuoso": {
    class: "bard",
    level: 1,
    flag: "bard_virtuoso",
    status: "module",
    description: "Action or skip Move for Performance Check. Pass grants group buff for 1 Round: Inspiration (d6 healing), Resolve (Favor Saves), or Valor (Favor Attack/Cast)."
  },

  // ──────────────────────────────────────────────
  // L1: Well-Versed
  // ──────────────────────────────────────────────
  // RULES: You ignore Prerequisites for Perks, and gain a Perk of your choice.
  //
  // STATUS: flavor
  //
  // MODULE HANDLES:
  //   - Nothing. Character creation/level-up rule enforced by player and GM.
  //     The fork implemented this in level-up-dialog.mjs (system-level code).
  //
  "well-versed": {
    class: "bard",
    level: 1,
    flag: "bard_wellVersed",
    status: "flavor",
    description: "You ignore Prerequisites for Perks, and gain a Perk of your choice."
  },

  // ──────────────────────────────────────────────
  // L2: Song of Rest
  // ──────────────────────────────────────────────
  // RULES: During a Breather while you aren't Incapacitated, you and your Allies
  // gain a Studied die and regain additional HP equal to (your Presence + your Bard Level).
  //
  // STATUS: flavor
  //
  // MODULE HANDLES:
  //   - Nothing yet. The fork integrated this into downtime-app.mjs (system-level).
  //     Module-level implementation would require hooking the rest dialog.
  //
  "song of rest": {
    class: "bard",
    level: 2,
    flag: "bard_songOfRest",
    status: "flavor",
    description: "During a Breather, you and Allies gain a Studied die and regain additional HP equal to Presence + Bard Level."
  },

  // ──────────────────────────────────────────────
  // L4: Starstruck
  // ──────────────────────────────────────────────
  // RULES: When you perform Virtuoso, you can choose a Near Enemy who hears the
  // performance and make a Performance Check. If you pass, you can choose one of
  // the following Statuses that affects it for Cd4 Rounds:
  // Berserk, Charmed, Confused, Frightened.
  //
  // STATUS: todo
  //
  "starstruck": {
    class: "bard",
    level: 4,
    flag: "bard_starstruck",
    status: "todo",
    description: "On Virtuoso, choose a Near Enemy and make Performance Check. Pass applies Berserk, Charmed, Confused, or Frightened for Cd4 Rounds."
  },

  // ──────────────────────────────────────────────
  // L6: Bravado
  // ──────────────────────────────────────────────
  // RULES: Your Will Saves can't be Hindered while you aren't Incapacitated, and
  // you can ignore effects that rely on you hearing them to be affected.
  //
  // STATUS: todo
  //
  "bravado": {
    class: "bard",
    level: 6,
    flag: "bard_bravado",
    status: "todo",
    description: "Will Saves can't be Hindered while not Incapacitated. Ignore effects that rely on hearing."
  },

  // ──────────────────────────────────────────────
  // L8: Climax
  // ──────────────────────────────────────────────
  // RULES: Favor and bonus dice you grant can Explode.
  //
  // STATUS: todo
  //
  "climax": {
    class: "bard",
    level: 8,
    flag: "bard_climax",
    status: "todo",
    description: "Favor and bonus dice you grant can Explode."
  },

  // ──────────────────────────────────────────────
  // L10: Starstruck Enhancement
  // ──────────────────────────────────────────────
  // RULES: Your Starstruck Feature can now affect all Near Enemies.
  //
  // STATUS: todo (depends on Starstruck)
  //
  // NOTE: Previously called "Encore" in old compendium data.
  // Renamed to "Starstruck Enhancement" in corrected compendium.
  //
  "starstruck enhancement": {
    class: "bard",
    level: 10,
    flag: "bard_starstruckEnhancement",
    status: "todo",
    description: "Starstruck can now affect all Near Enemies."
  }
};

/* -------------------------------------------- */
/*  Bard Runtime Hooks                          */
/* -------------------------------------------- */

export const BardFeatures = {
  /**
   * Register all Bard runtime hooks.
   */
  registerHooks() {
    this._registerVirtuosoHooks();
    this._log("Bard hooks registered.");
  },

  _log(...args) {
    if (game.settings.get(MODULE_ID, "debugMode")) {
      console.log(`${MODULE_ID} | Bard |`, ...args);
    }
  },

  /**
   * Check if an actor has a specific feature flag.
   */
  _hasFeature(actor, flag) {
    const features = actor?.getFlag(MODULE_ID, "features");
    return features?.[flag] ?? false;
  },

  /* -------------------------------------------- */
  /*  Virtuoso: Performance Check → Group Buff    */
  /* -------------------------------------------- */

  /**
   * Virtuoso hooks:
   * 1. renderChatMessage: adds click handlers to buff choice buttons
   * 2. updateCombat: auto-expires Virtuoso buffs on round change
   * 3. deleteCombat: cleans up Virtuoso buffs when combat ends
   */
  _registerVirtuosoHooks() {
    // Intercept Virtuoso item usage from the character sheet.
    // When the Bard clicks their "Virtuoso" relic item, the system posts
    // a generic item card. We suppress it and run our Performance check flow instead.
    Hooks.on("preCreateChatMessage", (message) => {
      if (!game.user.isGM) return;
      const itemId = message.flags?.vagabond?.itemId;
      const actorId = message.flags?.vagabond?.actorId || message.speaker?.actor;
      if (!itemId || !actorId) return;

      const actor = game.actors.get(actorId);
      if (!actor) return;
      const item = actor.items.get(itemId);
      if (!item || item.name.toLowerCase() !== "virtuoso") return;
      if (!this._hasFeature(actor, "bard_virtuoso")) return;

      // Suppress the default item card and run our Virtuoso flow instead
      this._log(`Virtuoso: Intercepted item use — running Performance check for ${actor.name}`);
      this.useVirtuoso(actor);
      return false;
    });

    // Handle Virtuoso buff choice buttons in chat
    Hooks.on("renderChatMessage", (message, html) => {
      const el = html instanceof jQuery ? html[0] : html;
      const buttons = el.querySelectorAll(".vce-virtuoso-btn");
      if (buttons.length === 0) return;

      // Check if a choice was already made (persisted via message flag).
      // This ensures button state is consistent across reloads and for all clients.
      const chosenBuff = message.getFlag(MODULE_ID, "virtuosoChoice");
      if (chosenBuff) {
        buttons.forEach(b => {
          b.disabled = true;
          b.style.opacity = b.dataset.buff === chosenBuff ? "1" : "0.5";
          if (b.dataset.buff === chosenBuff) {
            b.style.fontWeight = "bold";
            b.style.border = "2px solid #c9a0dc";
          }
        });
        return;
      }

      buttons.forEach(btn => {
        btn.addEventListener("click", async (event) => {
          event.preventDefault();
          if (!game.user.isGM) return;

          const buff = btn.dataset.buff;
          const bardId = btn.dataset.bardId;
          const bard = game.actors.get(bardId);
          if (!bard) return;

          await this._applyVirtuosoBuff(bard, buff);

          // Disable all buttons after choice, highlight the chosen one
          el.querySelectorAll(".vce-virtuoso-btn").forEach(b => {
            b.disabled = true;
            b.style.opacity = "0.5";
          });
          btn.style.opacity = "1";
          btn.style.fontWeight = "bold";
          btn.style.border = "2px solid #c9a0dc";

          // Persist choice on the message — triggers re-render for all clients
          await message.setFlag(MODULE_ID, "virtuosoChoice", buff);
        });
      });
    });

    // Auto-expire Virtuoso buffs on round change.
    // Checks ALL character actors, not just combatants, because the buff
    // applies to the whole Group regardless of who's in the encounter.
    Hooks.on("updateCombat", async (combat, changed) => {
      if (!game.user.isGM) return;
      if (!("round" in changed)) return;

      const deletionPromises = [];
      for (const actor of game.actors.filter(a => a.type === "character")) {
        const virtuosoEffects = actor.effects.filter(e => e.getFlag(MODULE_ID, "virtuosoBuff"));
        if (virtuosoEffects.length > 0) {
          const ids = virtuosoEffects.map(e => e.id);
          deletionPromises.push(actor.deleteEmbeddedDocuments("ActiveEffect", ids).then(() => {
            this._log(`Virtuoso: Buff expired on ${actor.name} (round changed)`);
          }));
        }
      }
      if (deletionPromises.length > 0) {
        await Promise.all(deletionPromises);
        ui.notifications.info("Virtuoso: Performance buffs have expired.");
      }
    });

    // Remove Virtuoso buffs when combat ends — check all character actors
    Hooks.on("deleteCombat", async (combat) => {
      if (!game.user.isGM) return;
      const cleanupPromises = [];
      for (const actor of game.actors.filter(a => a.type === "character")) {
        const virtuosoEffects = actor.effects.filter(e => e.getFlag(MODULE_ID, "virtuosoBuff"));
        if (virtuosoEffects.length > 0) {
          const ids = virtuosoEffects.map(e => e.id);
          cleanupPromises.push(actor.deleteEmbeddedDocuments("ActiveEffect", ids).then(() => {
            this._log(`Virtuoso: Cleaned up buff on ${actor.name} (combat ended)`);
          }));
        }
      }
      if (cleanupPromises.length > 0) await Promise.all(cleanupPromises);
    });
  },

  /**
   * Trigger the Virtuoso action for a Bard.
   * Called via game.vagabondCharacterEnhancer.virtuoso(actor) or macro.
   */
  async useVirtuoso(actor) {
    if (!actor || actor.type !== "character") {
      ui.notifications.warn("Virtuoso: Select a character actor.");
      return;
    }
    if (!this._hasFeature(actor, "bard_virtuoso")) {
      ui.notifications.warn(`${actor.name} doesn't have the Virtuoso feature.`);
      return;
    }

    // Import system roll builder
    const { VagabondRollBuilder } = await import("/systems/vagabond/module/helpers/roll-builder.mjs");

    // Roll Performance check
    const systemFavorHinder = actor.system.favorHinder || "none";
    const favorHinder = VagabondRollBuilder.calculateEffectiveFavorHinder(
      systemFavorHinder, false, false
    );

    const roll = await VagabondRollBuilder.buildAndEvaluateD20(actor, favorHinder);

    // Performance skill difficulty
    const skillData = actor.system.skills?.performance;
    const difficulty = skillData?.difficulty || 10;
    const isSuccess = roll.total >= difficulty;

    this._log(`Virtuoso: ${actor.name} rolled ${roll.total} vs DC ${difficulty} — ${isSuccess ? "PASS" : "FAIL"}`);

    // Build the chat card using the system's vagabond-chat-card-v2 structure
    // so it matches the visual style of attack/skill/save cards.
    const resultClass = isSuccess ? "result-hit" : "result-miss";
    const resultText = isSuccess ? "PASS" : "FAIL";

    // Extract the raw d20 value from the roll terms
    const d20Value = roll.terms?.[0]?.results?.[0]?.result ?? roll.total;

    let buttonsHtml = "";
    if (isSuccess) {
      buttonsHtml = `
        <div class="vce-virtuoso-choices" style="display:flex; gap:6px; padding:8px;">
          <button class="vce-virtuoso-btn" data-buff="valor" data-bard-id="${actor.id}">
            <i class="fas fa-swords"></i> Valor
          </button>
          <button class="vce-virtuoso-btn" data-buff="resolve" data-bard-id="${actor.id}">
            <i class="fas fa-shield-alt"></i> Resolve
          </button>
          <button class="vce-virtuoso-btn" data-buff="inspiration" data-bard-id="${actor.id}">
            <i class="fas fa-heart"></i> Inspiration
          </button>
        </div>
      `;
    }

    const cardContent = `
      <div class="vagabond-chat-card-v2" data-card-type="generic">
        <div class="card-body">
          <header class="card-header">
            <div class="header-icon">
              <img src="icons/tools/instruments/harp-yellow-teal.webp" alt="Virtuoso">
            </div>
            <div class="header-info">
              <h3 class="header-title">Virtuoso</h3>
              <div class="metadata-tags-row">
                <div class="meta-tag">
                  <i class="fas fa-music"></i>
                  <span>Performance</span>
                </div>
              </div>
            </div>
          </header>
          <section class="roll-strip">
            <div class="roll-info-group">
              <div class="roll-skill-label">Performance</div>
              <div class="roll-result-banner ${resultClass}">
                <span class="roll-value">${roll.total}</span>
                <span class="roll-vs">vs</span>
                <span class="roll-target">${difficulty}</span>
                <span class="roll-outcome-text">${resultText}</span>
              </div>
            </div>
            <div class="roll-dice-container" title="${roll.formula} = ${roll.total}" style="cursor:help;">
              <div class="vb-die-wrapper die-type-check" data-faces="20" title="1d20 → [${d20Value}]" style="cursor:help;">
                <div class="vb-die-bg dmg-pool" style="background-image:url('systems/vagabond/assets/ui/dice/d20-bg.webp')"></div>
                <span class="vb-die-val">${d20Value}</span>
              </div>
            </div>
          </section>
          <section class="content-body">
            ${isSuccess
              ? `<div class="card-description" style="text-align:center; padding:4px 0;">
                  <p>Choose a buff for the party this Round:</p>
                </div>${buttonsHtml}`
              : '<div class="card-description" style="text-align:center; padding:4px 0;"><p>The performance fails to inspire.</p></div>'}
          </section>
        </div>
      </div>
    `;

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: cardContent,
      flags: {
        [MODULE_ID]: { virtuosoCard: true, bardId: actor.id }
      }
    });
  },

  /**
   * Apply the chosen Virtuoso buff to all PCs in combat.
   */
  async _applyVirtuosoBuff(bard, buffType) {
    // NOTE: Valor/Resolve no longer set system.favorHinder via AE (OVERRIDE mode
    // bulldozed flanking hinder — favor should cancel hinder, not replace it).
    // Instead, the favor is applied via monkey-patch of VagabondRollBuilder.buildAndEvaluateD20
    // which checks for the virtuosoBuff flag and combines properly with existing state.
    // See registerHooks() → _patchRollBuilder().
    const buffConfig = {
      valor: {
        name: "Virtuoso: Valor",
        description: "Favor on Attack and Cast Checks",
        changes: [] // Favor applied via roll builder monkey-patch
      },
      resolve: {
        name: "Virtuoso: Resolve",
        description: "Favor on Saves",
        changes: [] // Favor applied via roll builder monkey-patch
      },
      inspiration: {
        name: "Virtuoso: Inspiration",
        description: "+d6 bonus to Healing rolls",
        changes: [] // No mechanical AE change — tracked via flag + notification
      }
    };

    const config = buffConfig[buffType];
    if (!config) return;

    this._log(`Virtuoso: ${bard.name} chose ${buffType} — applying to all PCs`);

    // Apply to all PCs in combat. RAW says "your Group" which means the party.
    // Only apply to combatants in the active encounter — non-combatant actors
    // on other scenes or not in the fight shouldn't get the buff.
    // Deduplicate by actor ID — an actor can have multiple combatants/tokens
    let targetActors = [];
    const seen = new Set();
    if (game.combat) {
      for (const combatant of game.combat.combatants) {
        if (combatant.actor?.type === "character" && !seen.has(combatant.actor.id)) {
          seen.add(combatant.actor.id);
          targetActors.push(combatant.actor);
        }
      }
    }
    if (targetActors.length === 0) {
      // No combat or no PC combatants — apply to PCs on the active scene
      const sceneTokenActors = canvas.tokens?.placeables
        ?.filter(t => t.actor?.type === "character")
        ?.map(t => t.actor) || [];
      for (const actor of sceneTokenActors) {
        if (!seen.has(actor.id)) {
          seen.add(actor.id);
          targetActors.push(actor);
        }
      }
    }

    const applyPromises = targetActors.map(async (actor) => {
      // Remove any existing Virtuoso buff first
      const existing = actor.effects.filter(e => e.getFlag(MODULE_ID, "virtuosoBuff"));
      if (existing.length > 0) {
        await actor.deleteEmbeddedDocuments("ActiveEffect", existing.map(e => e.id));
      }

      await actor.createEmbeddedDocuments("ActiveEffect", [{
        name: config.name,
        img: "icons/tools/instruments/harp-yellow-teal.webp",
        origin: bard.uuid,
        flags: {
          [MODULE_ID]: {
            managed: true,
            virtuosoBuff: buffType
          }
        },
        changes: config.changes,
        disabled: false,
        transfer: false
      }]);
      this._log(`Virtuoso: Applied ${config.name} to ${actor.name}`);
    });

    await Promise.all(applyPromises);
    ui.notifications.info(`Virtuoso: ${bard.name} grants ${config.name}! (${config.description})`);
  }
};
