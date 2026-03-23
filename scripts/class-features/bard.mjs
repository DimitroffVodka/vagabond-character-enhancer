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
  //   - VagabondRollBuilder has two d20 roll methods:
  //     * buildAndEvaluateD20(actor, favorHinder) — used for skill/save/stat checks
  //     * buildAndEvaluateD20WithRollData(rollData, favorHinder) — used inside
  //       item.rollAttack() for weapon attacks. These are INDEPENDENT code paths.
  //   - Roll handler reads actor.system.favorHinder, resolves with keyboard modifiers
  //     via calculateEffectiveFavorHinder(), then passes result to the roll method.
  //   - Performance skill exists with trained/difficulty/bonus fields.
  //
  // MODULE HANDLES:
  //   - Item trigger: Bard clicks "Virtuoso" relic item on character sheet.
  //     preCreateChatMessage hook intercepts the item card, suppresses it,
  //     and runs useVirtuoso() instead. No macro needed.
  //   - Performance check: dynamically imports VagabondRollBuilder, rolls d20
  //     with actor's check bonuses against Performance skill difficulty.
  //   - Chat card: uses system's vagabond-chat-card-v2 HTML structure for visual
  //     consistency. On success, shows Valor/Resolve/Inspiration buttons.
  //   - Button choice persisted via message.setFlag() — survives page reloads
  //     and shows correctly for all connected clients.
  //   - Buff AEs: creates flag-only AEs (no system.favorHinder changes) on all
  //     PC combatants. The AE's virtuosoBuff flag is read by monkey-patches.
  //   - Favor application via TWO monkey-patches (see vagabond-character-enhancer.mjs):
  //     * buildAndEvaluateD20 patch — covers skill, save, and stat checks.
  //       Checks actor.effects for virtuosoBuff flag, combines with existing
  //       favorHinder state (hinder + favor = "none", none + favor = "favor").
  //     * rollAttack patch — covers weapon attack rolls (Valor only).
  //       Same combination logic. MUST be separate from buildAndEvaluateD20 because
  //       rollAttack internally uses buildAndEvaluateD20WithRollData, a different
  //       code path that doesn't go through buildAndEvaluateD20.
  //   - Auto-expires: updateCombat hook removes all Virtuoso AEs on round change.
  //     Checks ALL character actors (not just combatants) to catch stragglers.
  //     deleteCombat hook also cleans up on combat end.
  //   - Targeting: applies to PC combatants in active combat. Falls back to PCs
  //     with tokens on the active scene if no combat. Deduplicates by actor ID.
  //   - Inspiration: creates AE with flag only (no mechanical change). The d6
  //     healing bonus is not automated — system has no healing bonus field we can
  //     hook from module level. Players/GM track it manually via the AE indicator.
  //
  // APPROACHES THAT DIDN'T WORK:
  //   - AE OVERRIDE (mode 5) on system.favorHinder — bulldozed flanking hinder.
  //     Favor should CANCEL hinder (to "none"), not replace it. The system's
  //     roll handler reads actor.system.favorHinder BEFORE calling the roll method,
  //     so an AE override made it always read "favor" regardless of flanking or
  //     other conditions. Solution: flag-only AEs + monkey-patches that combine
  //     favor with the already-resolved favorHinder state.
  //   - Single monkey-patch on buildAndEvaluateD20 for ALL rolls — weapon attacks
  //     go through buildAndEvaluateD20WithRollData (called inside item.rollAttack),
  //     a completely separate code path. The two methods never call each other.
  //     Solution: patch BOTH rollAttack (for attacks) AND buildAndEvaluateD20
  //     (for skills/saves/stats) independently.
  //   - Applying Virtuoso in BOTH rollAttack AND buildAndEvaluateD20 — caused
  //     double-application because rollAttack modifies favorHinder then passes it
  //     to the original, which calls buildAndEvaluateD20WithRollData (not patched).
  //     AI reviewers incorrectly suggested this was happening (they assumed
  //     buildAndEvaluateD20 was called inside rollAttack — it's not). In reality,
  //     each patch covers its own independent code path.
  //   - Type-specific favor (attack-only, save-only) — system's favorHinder is global.
  //     No per-roll-type favor fields exist. Would require monkey-patching
  //     RollHandler.prototype.roll() to check rollType and apply selectively.
  //   - Setting Bard-specific schema fields (virtuosoSavesFavor etc.) — these fields
  //     don't exist in base system v5.0.0, only in the fork.
  //   - Macro-based trigger — required players to set up macros manually. Replaced
  //     with preCreateChatMessage intercept on the "Virtuoso" relic item.
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
  //   - Hooks createChatMessage to detect Breather cards (system posts these from
  //     DowntimeApp._onProcessBreather after updating HP).
  //   - Finds a non-incapacitated bard with Song of Rest in the party.
  //   - Applies extra HP (Presence + Bard Level, capped at max) to the resting actor.
  //   - Grants +1 Studied Die to the resting actor.
  //   - Posts a follow-up chat card showing the Song of Rest bonus.
  //
  "song of rest": {
    class: "bard",
    level: 2,
    flag: "bard_songOfRest",
    status: "module",
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
  // STATUS: module
  //
  // MODULE HANDLES:
  //   - Chains from _applyVirtuosoBuff after successful Virtuoso buff choice.
  //   - L4: Requires enemy targeted (game.user.targets) before using Virtuoso.
  //     If no target, warns but allows Virtuoso to proceed without Starstruck.
  //   - Presents DialogV2 to choose status (Berserk/Charmed/Confused/Frightened).
  //   - Applies status via toggleStatusEffect, checks immunity first.
  //   - Creates Cd4 countdown die via system's CountdownDice.create() with
  //     linkedActorUuid + linkedStatusId for automatic status removal on expiry.
  //   - Posts result chat card using vagabond-chat-card-v2 structure.
  //
  "starstruck": {
    class: "bard",
    level: 4,
    flag: "bard_starstruck",
    status: "module",
    description: "On Virtuoso, choose a Near Enemy and make Performance Check. Pass applies Berserk, Charmed, Confused, or Frightened for Cd4 Rounds."
  },

  // ──────────────────────────────────────────────
  // L6: Bravado
  // ──────────────────────────────────────────────
  // RULES: Your Will Saves can't be Hindered while you aren't Incapacitated, and
  // you can ignore effects that rely on you hearing them to be affected.
  //
  // STATUS: partial — Will Save hinder immunity is automated. Hearing immunity
  //   is narrative/flavor and not automated (no system mechanic to hook).
  //
  // MODULE HANDLES:
  //   - Two monkey-patches in vagabond-character-enhancer.mjs:
  //     * _rollSave (damage-helper.mjs): Strips ALL hinder sources on Will saves
  //       for actors with bard_bravado (covers chat-card save buttons).
  //     * RollHandler.roll: Strips hinder from sheet-initiated Will save clicks
  //       (covers character sheet save buttons).
  //   - Both patches check !incapacitated before intervening.
  //   - Hinder sources stripped: global favorHinder, conditional isHindered,
  //     keyboard Ctrl override, attacker outgoingSavesModifier.
  //
  "bravado": {
    class: "bard",
    level: 6,
    flag: "bard_bravado",
    status: "partial",
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
  // STATUS: module
  //
  // NOTE: Previously called "Encore" in old compendium data.
  // Renamed to "Starstruck Enhancement" in corrected compendium.
  //
  // MODULE HANDLES:
  //   - Same as Starstruck but auto-targets ALL NPC tokens within 30ft (Near).
  //   - No pre-targeting required — uses distance measurement like Fearmonger.
  //   - Creates ONE Cd4 countdown die linked to first affected actor.
  //   - Stores additional target token IDs in module flag on the die.
  //   - deleteJournalEntry hook cleans up ALL targets when die expires
  //     (system's built-in automation only handles the single linked actor).
  //
  "starstruck enhancement": {
    class: "bard",
    level: 10,
    flag: "bard_starstruckEnhancement",
    status: "module",
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
    this._registerSongOfRestHooks();
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
  /*  Song of Rest: Bonus HP + Studied Die        */
  /* -------------------------------------------- */

  /**
   * Song of Rest (L2): During a Breather, allies gain extra HP (Presence + Bard Level)
   * and a Studied Die, as long as the Bard isn't Incapacitated.
   *
   * Hooks createChatMessage to detect Breather cards posted by the system's
   * DowntimeApp._onProcessBreather. The system has already updated HP by the
   * time the message is created, so we apply Song of Rest as additional HP
   * on top and post a follow-up chat card.
   */
  _registerSongOfRestHooks() {
    Hooks.on("createChatMessage", async (message) => {
      if (!game.user.isGM) return;

      // Detect Breather cards — the system's _onProcessBreather creates cards
      // with "takes a breather" in the description HTML.
      const content = message.content || "";
      if (!content.includes("takes a breather")) return;

      // Get the resting actor from the message speaker
      const actorId = message.speaker?.actor;
      if (!actorId) return;
      const actor = game.actors.get(actorId);
      if (!actor || actor.type !== "character") return;

      // Find a bard with Song of Rest who isn't incapacitated
      const bard = game.actors.find(a => {
        if (a.type !== "character") return false;
        if (!this._hasFeature(a, "bard_songOfRest")) return false;
        if (a.statuses?.has("incapacitated")) return false;
        return true;
      });
      if (!bard) return;

      // Calculate Song of Rest bonus: Presence + Bard Level
      const bardPresence = bard.system.stats?.presence?.value ?? 0;
      const bardLevel = bard.system.attributes?.level?.value ?? 0;
      const songBonus = bardPresence + bardLevel;

      if (songBonus <= 0) {
        this._log("Song of Rest: bonus is 0, skipping.");
        return;
      }

      // Apply extra HP (the system already set HP = current + Might)
      const currentHP = actor.system.health.value;
      const maxHP = actor.system.health.max;
      const newHP = Math.min(maxHP, currentHP + songBonus);
      const actualBonus = newHP - currentHP;

      // Grant +1 Studied Die
      const currentStudied = actor.system.studiedDice || 0;

      const updates = { "system.studiedDice": currentStudied + 1 };
      if (actualBonus > 0) {
        updates["system.health.value"] = newHP;
      }
      await actor.update(updates);

      this._log(`Song of Rest: ${bard.name} grants ${actor.name} +${actualBonus} HP (Presence ${bardPresence} + Level ${bardLevel} = ${songBonus}, capped at max) and +1 Studied Die`);

      // Post a follow-up chat card showing the Song of Rest bonus
      const { VagabondChatCard } = await import("/systems/vagabond/module/helpers/chat-card.mjs");

      let descHTML = `
        <p><i class="fas fa-music"></i> <strong>${bard.name}'s Song of Rest</strong></p>
      `;
      if (actualBonus > 0) {
        descHTML += `<p><i class="fas fa-heart"></i> <strong>+${actualBonus} HP</strong> (Presence ${bardPresence} + Bard Level ${bardLevel})</p>`;
      } else {
        descHTML += `<p><i class="fas fa-heart"></i> HP already at max — no additional healing.</p>`;
      }
      descHTML += `<p><i class="fas fa-book-open"></i> Gained a <strong>Studied Die</strong>! (${currentStudied} → ${currentStudied + 1})</p>`;

      const card = new VagabondChatCard()
        .setType("generic")
        .setActor(actor)
        .setTitle("Song of Rest")
        .setSubtitle(bard.name)
        .setDescription(descHTML);

      await card.send();
    });
  },

  /* -------------------------------------------- */
  /*  Virtuoso: Performance Check → Group Buff    */
  /* -------------------------------------------- */

  /**
   * Virtuoso hooks:
   * 1. preCreateChatMessage: intercepts Virtuoso relic item use, replaces with
   *    Performance check flow (suppresses default item card)
   * 2. renderChatMessage: adds click handlers to buff choice buttons, restores
   *    persisted choice state from message flags on re-render/reload
   * 3. updateCombat: auto-expires Virtuoso buffs on round change (all PCs)
   * 4. deleteCombat: cleans up Virtuoso buffs when combat ends (all PCs)
   *
   * Favor application is NOT here — it's in vagabond-character-enhancer.mjs via
   * monkey-patches on buildAndEvaluateD20 (skills/saves) and rollAttack (attacks).
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

    // Inspiration: Add +1d6 to healing roll buttons when active.
    // Healing buttons use data-damage-amount which is rolled on click (unlike
    // attack damage which is pre-rolled), so modifying the button formula works.
    // In combat: checks if the healer has the Inspiration AE.
    // Out of combat: checks if any PC on scene has bard_virtuoso (assumed always-on).
    Hooks.on("renderChatMessage", (message, html) => {
      const el = html instanceof jQuery ? html[0] : html;
      const healButtons = el.querySelectorAll('.vagabond-item-damage-button[data-damage-type="healing"]');
      if (healButtons.length === 0) return;

      const speakerActorId = message.speaker?.actor;
      if (!speakerActorId) return;
      const speakerActor = game.actors.get(speakerActorId);
      if (!speakerActor) return;

      let hasInspiration = false;

      if (game.combat) {
        // In combat: check if the healer has the Inspiration AE
        hasInspiration = !!speakerActor.effects?.find(e =>
          e.getFlag(MODULE_ID, "virtuosoBuff") === "inspiration"
        );
      } else {
        // Out of combat: any PC on the scene with bard_virtuoso means Inspiration is assumed
        const scenePCs = canvas.tokens?.placeables
          ?.filter(t => t.actor?.type === "character") || [];
        hasInspiration = scenePCs.some(t => this._hasFeature(t.actor, "bard_virtuoso"));
      }

      if (!hasInspiration) return;

      // Modify healing button formulas to add +1d6
      healButtons.forEach(btn => {
        const formula = btn.dataset.damageAmount;
        if (!formula || btn.dataset.vceInspiration) return; // already modified
        btn.dataset.damageAmount = `${formula} + 1d6[Inspiration]`;
        btn.dataset.vceInspiration = "true";
        // Update button text to show the bonus
        const label = btn.textContent.trim();
        btn.innerHTML = `<i class="fas fa-heart"></i> ${label} + d6 <i class="fas fa-music" style="color:#c9a0dc;"></i>`;
        this._log(`Inspiration: Added +1d6 to healing formula: ${formula} → ${btn.dataset.damageAmount}`);
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

    // Clean up AoE Starstruck statuses when the countdown die expires.
    // The system's built-in linkedActorUuid/linkedStatusId handles the FIRST
    // target automatically. This hook handles ADDITIONAL targets for L10 AoE.
    Hooks.on("deleteJournalEntry", async (journal, options, userId) => {
      if (!game.user.isGM) return;
      const starstruckData = journal.getFlag(MODULE_ID, "starstruckTargets");
      if (!starstruckData) return;

      const { status, tokenIds, sceneId } = starstruckData;
      if (!status || !Array.isArray(tokenIds)) return;

      this._log(`Starstruck: Countdown die expired — cleaning up ${status} from ${tokenIds.length} targets`);

      // Find tokens on the scene and remove the status
      const scene = game.scenes.get(sceneId);
      if (!scene) return;

      const cleanupPromises = [];
      for (const tokenId of tokenIds) {
        const tokenDoc = scene.tokens.get(tokenId);
        const actor = tokenDoc?.actor;
        if (!actor) continue;

        // Skip if the system's built-in cleanup already handled this actor
        // (the first linkedActorUuid target). Check if status is still active.
        if (!actor.statuses?.has(status)) continue;

        cleanupPromises.push(
          actor.toggleStatusEffect(status, { active: false }).then(() => {
            this._log(`Starstruck: Removed ${status} from ${actor.name} (die expired)`);
          })
        );
      }
      if (cleanupPromises.length > 0) await Promise.all(cleanupPromises);
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
    // AE changes are intentionally EMPTY for Valor/Resolve. The favor is applied
    // via monkey-patches in vagabond-character-enhancer.mjs, not via AE changes.
    // The AE exists purely as a flag carrier — the patches check for the
    // virtuosoBuff flag on the actor's effects and combine favor with the
    // already-resolved favorHinder state from the roll handler.
    //
    // Why not AE OVERRIDE on system.favorHinder?
    // The system reads actor.system.favorHinder BEFORE calling roll methods.
    // An AE override makes it always "favor", bulldozing flanking hinder and
    // other conditions. The monkey-patches run AFTER the system resolves
    // favorHinder, so they can properly combine (hinder + favor = "none").
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

    // Chain Starstruck if the Bard has the feature
    if (this._hasFeature(bard, "bard_starstruck")) {
      await this._handleStarstruck(bard);
    }
  },

  /* -------------------------------------------- */
  /*  Starstruck: Debuff Enemies After Virtuoso   */
  /* -------------------------------------------- */

  /**
   * Starstruck (L4): Apply a status to a single targeted Near Enemy for Cd4 rounds.
   * Starstruck Enhancement (L10): Apply to ALL Near Enemies within 30ft.
   *
   * Uses the system's CountdownDice with linkedActorUuid/linkedStatusId for
   * automatic status removal when the die expires (rolls 1 on a d4).
   * For AoE (L10), stores additional target IDs in a module flag on the die
   * and hooks deleteJournalEntry for bulk cleanup (system only auto-removes
   * the single linked actor's status).
   */
  async _handleStarstruck(bard) {
    if (!canvas?.tokens?.placeables) return;

    const hasEnhancement = this._hasFeature(bard, "bard_starstruckEnhancement");
    const bardToken = canvas.tokens.placeables.find(t => t.actor?.id === bard.id);
    if (!bardToken) {
      this._log("Starstruck: No token found for Bard on canvas");
      return;
    }

    let targetTokens = [];

    if (hasEnhancement) {
      // L10: All NPC tokens within 30ft (Near)
      for (const token of canvas.tokens.placeables) {
        if (!token.actor || token.actor.type !== "npc") continue;
        if ((token.actor.system.health?.value ?? 0) <= 0) continue; // skip dead
        const dist = canvas.grid.measurePath([bardToken.center, token.center]).distance;
        if (dist <= 30) targetTokens.push(token);
      }
      if (targetTokens.length === 0) {
        ui.notifications.info("Starstruck Enhancement: No Near Enemies found within 30ft.");
        return;
      }
      this._log(`Starstruck Enhancement: Found ${targetTokens.length} enemies within 30ft`);
    } else {
      // L4: Single target — must have an enemy targeted
      const targets = Array.from(game.user.targets);
      targetTokens = targets.filter(t => t.actor && t.actor.type === "npc");
      if (targetTokens.length === 0) {
        ui.notifications.warn("Starstruck: Target an enemy before using Virtuoso.");
        return;
      }
      // Use only the first targeted NPC
      targetTokens = [targetTokens[0]];
      this._log(`Starstruck: Targeting ${targetTokens[0].actor.name}`);
    }

    // Choose which status to apply
    const chosenStatus = await foundry.applications.api.DialogV2.wait({
      window: { title: "Starstruck — Choose Status" },
      content: `<p><strong>${bard.name}</strong> — choose a status to inflict:</p>`,
      buttons: [
        { action: "berserk", label: "Berserk", icon: "fas fa-fire" },
        { action: "charmed", label: "Charmed", icon: "fas fa-heart" },
        { action: "confused", label: "Confused", icon: "fas fa-question" },
        { action: "frightened", label: "Frightened", icon: "fas fa-ghost" }
      ]
    });
    if (!chosenStatus) return; // Cancelled

    // Apply status to targets, skipping immune and already-affected
    const affectedTokens = [];
    for (const token of targetTokens) {
      const targetActor = token.actor;
      if (!targetActor) continue;

      // Check immunity
      const immunities = targetActor.system?.statusImmunities || [];
      if (immunities.includes(chosenStatus)) {
        ui.notifications.info(`${targetActor.name} is immune to ${chosenStatus}!`);
        continue;
      }

      // Skip if already has this status
      if (targetActor.statuses?.has(chosenStatus)) {
        this._log(`Starstruck: ${targetActor.name} already has ${chosenStatus}, skipping`);
        continue;
      }

      await targetActor.toggleStatusEffect(chosenStatus, { active: true });
      affectedTokens.push(token);
      this._log(`Starstruck: Applied ${chosenStatus} to ${targetActor.name}`);
    }

    if (affectedTokens.length === 0) {
      ui.notifications.info("Starstruck: No enemies were affected.");
      return;
    }

    // Create Cd4 countdown die with status automation
    const statusLabel = chosenStatus.charAt(0).toUpperCase() + chosenStatus.slice(1);
    const affectedNames = affectedTokens.map(t => t.actor.name);
    const dieName = `Starstruck: ${statusLabel} (${affectedNames.join(", ")})`;

    try {
      const { CountdownDice } = await import("/systems/vagabond/module/documents/countdown-dice.mjs");

      // Link to first affected actor for system's built-in status auto-removal
      const firstActor = affectedTokens[0].actor;
      const die = await CountdownDice.create({
        name: dieName,
        diceType: "d4",
        size: "S",
        ownership: { default: 3, [game.user.id]: 3 },
        linkedActorUuid: firstActor.uuid,
        linkedStatusId: chosenStatus
      });

      // For AoE (multiple targets), store all affected token IDs in module flag
      // so our deleteJournalEntry hook can clean up ALL targets when die expires.
      // The system's built-in automation only handles the single linkedActorUuid.
      if (die && affectedTokens.length > 1) {
        await die.setFlag(MODULE_ID, "starstruckTargets", {
          status: chosenStatus,
          tokenIds: affectedTokens.map(t => t.id),
          sceneId: canvas.scene?.id || ""
        });
      }

      this._log(`Starstruck: Created Cd4 countdown die "${dieName}"`);
    } catch (e) {
      console.warn(`${MODULE_ID} | Failed to create Starstruck countdown die:`, e);
    }

    // Post result to chat
    const featureName = hasEnhancement ? "Starstruck Enhancement" : "Starstruck";
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: bard }),
      content: `
        <div class="vagabond-chat-card-v2" data-card-type="generic">
          <div class="card-body">
            <header class="card-header">
              <div class="header-icon">
                <img src="icons/tools/instruments/harp-yellow-teal.webp" alt="Starstruck">
              </div>
              <div class="header-info">
                <h3 class="header-title">${featureName}</h3>
                <div class="metadata-tags-row">
                  <div class="meta-tag">
                    <i class="fas fa-star"></i>
                    <span>${statusLabel}</span>
                  </div>
                </div>
              </div>
            </header>
            <section class="content-body">
              <div class="card-description" style="padding:8px;">
                <p><strong>${affectedNames.join(", ")}</strong>
                  ${affectedNames.length === 1 ? "is" : "are"} now
                  <strong>${statusLabel}</strong>!</p>
                <p><em>Cd4 countdown die created — status auto-removes when it expires.</em></p>
              </div>
            </section>
          </div>
        </div>
      `
    });

    ui.notifications.info(`${featureName}: ${affectedNames.length} enemy(s) now ${statusLabel}!`);
  }
};
