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
  //   - Valor/Resolve: sets system.favorHinder = "favor" via AE (global favor).
  //     NOTE: System has no per-type favor fields (attack-only or save-only),
  //     so both Valor and Resolve apply global favor. This is a known limitation.
  //     The fork solved this by adding dedicated system fields (virtuosoSavesFavor,
  //     virtuosoAttacksFavor) which don't exist in base system v5.0.0.
  //   - Inspiration: sets a module flag; d6 healing bonus tracked via notification.
  //
  // APPROACHES THAT DIDN'T WORK:
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
    // Handle Virtuoso buff choice buttons in chat
    Hooks.on("renderChatMessage", (message, html) => {
      const el = html instanceof jQuery ? html[0] : html;
      const buttons = el.querySelectorAll(".vce-virtuoso-btn");
      if (buttons.length === 0) return;

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

    // Build buff choice buttons (only shown on success)
    let buttonsHtml = "";
    if (isSuccess) {
      buttonsHtml = `
        <div style="display:flex; gap:4px; margin-top:8px;">
          <button class="vce-virtuoso-btn" data-buff="valor" data-bard-id="${actor.id}"
            style="flex:1; background:#4a7c4b; color:white; border:none; padding:6px; border-radius:4px; cursor:pointer;">
            Valor
          </button>
          <button class="vce-virtuoso-btn" data-buff="resolve" data-bard-id="${actor.id}"
            style="flex:1; background:#4a5c8c; color:white; border:none; padding:6px; border-radius:4px; cursor:pointer;">
            Resolve
          </button>
          <button class="vce-virtuoso-btn" data-buff="inspiration" data-bard-id="${actor.id}"
            style="flex:1; background:#8c6a4a; color:white; border:none; padding:6px; border-radius:4px; cursor:pointer;">
            Inspiration
          </button>
        </div>
      `;
    }

    const cardContent = `
      <div class="vce-virtuoso-card" style="border:2px solid #7b5ea7; border-radius:8px; padding:10px; background:#1a1a2e;">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
          <img src="icons/tools/instruments/harp-yellow-teal.webp" width="36" height="36" style="border:none;">
          <div>
            <h3 style="margin:0; color:#c9a0dc;">Virtuoso</h3>
            <span style="font-size:0.8em; color:#aaa;">Performance Check</span>
          </div>
        </div>
        <div style="text-align:center; padding:6px; background:#0d0d1a; border-radius:4px; margin-bottom:8px;">
          <span style="font-size:1.4em; font-weight:bold; color:${isSuccess ? "#4caf50" : "#f44336"};">${roll.total}</span>
          <span style="color:#888;"> vs </span>
          <span style="font-size:1.1em;">${difficulty}</span>
          <span style="margin-left:8px; font-weight:bold; color:${isSuccess ? "#4caf50" : "#f44336"};">${isSuccess ? "PASS" : "FAIL"}</span>
        </div>
        <div style="font-size:0.85em; color:#aaa; text-align:center;">
          ${roll.formula} = ${roll.total}
        </div>
        ${isSuccess
          ? '<p style="text-align:center; color:#c9a0dc; margin:8px 0 4px;">Choose a buff for the party:</p>'
          : '<p style="text-align:center; color:#f44336; margin:8px 0 0;">The performance fails to inspire.</p>'}
        ${buttonsHtml}
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
    const buffConfig = {
      valor: {
        name: "Virtuoso: Valor",
        description: "Favor on Attack and Cast Checks",
        changes: [{ key: "system.favorHinder", mode: 5, value: "favor" }]
      },
      resolve: {
        name: "Virtuoso: Resolve",
        description: "Favor on Saves",
        changes: [{ key: "system.favorHinder", mode: 5, value: "favor" }]
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
    let targetActors = [];
    if (game.combat) {
      for (const combatant of game.combat.combatants) {
        if (combatant.actor?.type === "character") {
          targetActors.push(combatant.actor);
        }
      }
    }
    if (targetActors.length === 0) {
      // No combat or no PC combatants — apply to PCs on the active scene
      const sceneTokenActors = canvas.tokens?.placeables
        ?.filter(t => t.actor?.type === "character")
        ?.map(t => t.actor) || [];
      // Deduplicate by actor ID
      const seen = new Set();
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
        icon: "icons/tools/instruments/harp-yellow-teal.webp",
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
