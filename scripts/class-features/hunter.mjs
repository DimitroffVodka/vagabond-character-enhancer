/**
 * Hunter Class Features
 * Registry entries + runtime hooks for all Hunter features.
 *
 * ARCHITECTURE OVERVIEW
 * ─────────────────────
 * Hunter's Mark is the core mechanic. All combat features build on it:
 *
 *   Hunter's Mark (L1) → mark a target (requires Focus), roll 2d20kh on attacks
 *   Overwatch (L4)     → mark's 2d20kh also applies to saves from marked target
 *   Lethal Precision (L8) → upgrade to 3d20kh for mark attacks and Overwatch saves
 *   Apex Predator (L10)   → damage vs marked target ignores Immune and Armor
 *
 * Mark tracking uses actor flags on the hunter: hunterMark.targetId
 * The multi-d20 is injected via a module-level variable (_hunterMarkDice)
 * that the buildAndEvaluateD20WithRollData patch reads as a custom baseFormula.
 *
 * Marking triggers:
 *   1. On attack: if the target isn't already marked, prompt the player to mark
 *   2. Manual mark: chat button for "skip Move to mark" (no attack needed)
 *
 * The mark persists until:
 *   - The hunter marks a different target (one mark at a time)
 *   - Combat ends (deleteCombat cleanup)
 *   - The hunter manually unmarks (chat button)
 */

import { MODULE_ID, log, hasFeature } from "../utils.mjs";
import { FocusManager } from "../focus/focus-manager.mjs";

/**
 * Module-level variable for passing multi-d20 count to the roll builder patch.
 * Set by onPreRollAttack or onPreRollSave, consumed by the buildAndEvaluateD20
 * patches in vagabond-character-enhancer.mjs. Resets to 0 after use.
 */
export let _hunterMarkDice = 0;

/** Reset the dice count (called from the roll builder patch after consuming). */
export function resetHunterMarkDice() {
  _hunterMarkDice = 0;
}

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

export const HUNTER_REGISTRY = {
  // ──────────────────────────────────────────────
  // L1: Hunter's Mark
  // ──────────────────────────────────────────────
  // RULES: You can mark a Being either when you attack it, or by skipping
  // your Move if you can sense it. When you do:
  //   - You must Focus on the mark.
  //   - When you make an attack against it, roll two d20s and use the highest.
  //
  // STATUS: module
  //
  // MODULE HANDLES:
  //   - Prompt-to-mark on attack (onPreRollAttack asks player, then sets flag + _hunterMarkDice)
  //   - Manual mark via chat button (skip Move)
  //   - 2d20kh injected via buildAndEvaluateD20WithRollData baseFormula override
  //   - Mark persists across rounds while Focus is maintained
  //   - Cleanup on combat end
  "hunter's mark": {
    class: "hunter", level: 1, flag: "hunter_huntersMark", status: "module",
    description: "Mark a Being (requires Focus). Attack rolls against it use 2d20 keep highest."
  },

  // ──────────────────────────────────────────────
  // L1: Survivalist
  // ──────────────────────────────────────────────
  // RULES: You gain the Padfoot Perk, you have Favor on Checks to track
  // and navigate, and you can Forage while Traveling at a Normal Pace.
  //
  // STATUS: flavor — Perk grant + narrative bonuses, no automation needed.
  "survivalist": {
    class: "hunter", level: 1, flag: "hunter_survivalist", status: "flavor",
    description: "Gain Padfoot Perk. Favor on tracking/navigation Checks. Forage while Traveling at Normal Pace."
  },

  // ──────────────────────────────────────────────
  // L2: Rover
  // ──────────────────────────────────────────────
  // RULES: Difficult Terrain doesn't impede your walking Speed, and you
  // have Climb and Swim.
  //
  // STATUS: flavor — The system doesn't have mechanical fields for
  // climb/swim movement types or difficult terrain penalties. This is
  // a narrative/GM-tracked feature.
  "rover": {
    class: "hunter", level: 2, flag: "hunter_rover", status: "flavor",
    description: "Difficult Terrain doesn't impede walking Speed. Gain Climb and Swim."
  },

  // ──────────────────────────────────────────────
  // L4: Overwatch
  // ──────────────────────────────────────────────
  // RULES: Your additional d20 for attacks with your Hunter's Mark also
  // applies to your Saves provoked by the marked Target.
  //
  // STATUS: module
  //
  // MODULE HANDLES:
  //   - onPreRollSave checks for active mark + Overwatch feature
  //   - Only applies when ctx.saveSourceActorId matches the marked target
  //   - Sets _hunterMarkDice for the save's d20 roll
  //   - Uses same 2d20kh (or 3d20kh with Lethal Precision)
  "overwatch": {
    class: "hunter", level: 4, flag: "hunter_overwatch", status: "module",
    description: "Hunter's Mark bonus d20 also applies to Saves from the marked Target."
  },

  // ──────────────────────────────────────────────
  // L6: Quarry
  // ──────────────────────────────────────────────
  // RULES: You can sense Beings within Far as if by Blindsight if they are
  // missing any HP or that are marked by your Hunter's Mark.
  //
  // STATUS: flavor — narrative sense, no mechanical automation possible.
  "quarry": {
    class: "hunter", level: 6, flag: "hunter_quarry", status: "flavor",
    description: "Sense Beings within Far by Blindsight if they're missing HP or marked."
  },

  // ──────────────────────────────────────────────
  // L8: Lethal Precision
  // ──────────────────────────────────────────────
  // RULES: You now roll three d20s with your Hunter's Mark and Overwatch
  // Features and use the highest result of the three.
  //
  // STATUS: module — Piggybacks on Hunter's Mark. When this flag is present,
  // _hunterMarkDice is set to 3 instead of 2.
  "lethal precision": {
    class: "hunter", level: 8, flag: "hunter_lethalPrecision", status: "module",
    description: "Roll 3d20 keep highest with Hunter's Mark and Overwatch."
  },

  // ──────────────────────────────────────────────
  // L10: Apex Predator
  // ──────────────────────────────────────────────
  // RULES: Damage you deal to the Target of your Hunter's Mark ignores
  // Immune and Armor.
  //
  // STATUS: module
  //
  // MODULE HANDLES:
  //   - When hunter attacks a marked target with Apex Predator, posts a
  //     chat reminder and sets a flag on the attack chat card.
  //   - Hooks into calculateFinalDamage to bypass armor when the damage
  //     source is a hunter with Apex Predator who has this target marked.
  //   - Uses ctx.damageSourceActorId (set by handleSaveRoll/handleApplyDirect
  //     patches) to verify the hunter is the one dealing the damage.
  "apex predator": {
    class: "hunter", level: 10, flag: "hunter_apexPredator", status: "module",
    description: "Damage to Hunter's Mark Target ignores Immune and Armor."
  }
};

/* -------------------------------------------- */
/*  Hunter Runtime Hooks                        */
/* -------------------------------------------- */

export const HunterFeatures = {

  registerHooks() {
    // Mark Target button clicks from chat cards
    Hooks.on("renderChatMessage", (message, html) => {
      const el = html instanceof jQuery ? html[0] : html;
      el.querySelectorAll("[data-action='vce-hunter-mark']").forEach(btn => {
        btn.addEventListener("click", (ev) => this._onMarkButtonClick(ev));
      });
      el.querySelectorAll("[data-action='vce-hunter-unmark']").forEach(btn => {
        btn.addEventListener("click", (ev) => this._onUnmarkButtonClick(ev));
      });
    });

    // Clean up marks on combat end
    Hooks.on("deleteCombat", () => {
      if (!game.user.isGM) return;
      this._cleanupAllMarks();
    });

    log("Hunter", "Hooks registered.");
  },

  /* -------------------------------------------- */
  /*  Handler Methods (called from main dispatcher) */
  /* -------------------------------------------- */

  /**
   * Pre-roll attack handler.
   * If the hunter has Hunter's Mark and a target is selected:
   *   1. Auto-mark the target (or keep existing mark)
   *   2. Set _hunterMarkDice for 2d20kh (or 3d20kh with Lethal Precision)
   *
   * If the target is different from the current mark, switch marks.
   * If no target is selected, no multi-d20 (can't mark without a target).
   */
  async onPreRollAttack(ctx) {
    if (!ctx.features?.hunter_huntersMark) return;

    // Get the current target
    const targets = Array.from(game.user.targets);
    if (targets.length === 0) return;

    const targetActor = targets[0].actor;
    if (!targetActor) return;

    const targetId = targetActor.id;
    const currentMark = ctx.actor.getFlag(MODULE_ID, "hunterMark");
    const alreadyMarked = currentMark?.targetId === targetId;

    // If attacking an unmarked target, ask the player whether to mark it
    if (!alreadyMarked) {
      const wantsMark = await this._promptMarkTarget(ctx.actor, targetActor, currentMark);
      if (!wantsMark) return; // Player declined — proceed with normal attack (no multi-d20)
    }

    // Set multi-d20 count for the roll builder patch
    const diceCount = ctx.features.hunter_lethalPrecision ? 3 : 2;
    _hunterMarkDice = diceCount;

    // Apex Predator reminder
    if (ctx.features.hunter_apexPredator) {
      ctx._apexPredatorActive = true;
    }

    log("Hunter", `Mark active on ${targetActor.name} — rolling ${diceCount}d20kh for ${ctx.actor.name}`);
  },

  /**
   * Post-roll attack handler.
   * If Apex Predator was active, post a reminder about armor/immune bypass.
   */
  async onPostRollAttack(ctx) {
    if (!ctx._apexPredatorActive) return;

    ChatMessage.create({
      content: `<div class="vagabond-chat-card-v2" data-card-type="apex-predator">
        <div class="card-body">
          <section class="content-body">
            <div class="card-description" style="text-align:center;">
              <i class="fas fa-skull-crossbones"></i> <strong>Apex Predator</strong>
              — Damage ignores Armor and Immune.
            </div>
          </section>
        </div>
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor: ctx.actor }),
    });
  },

  /**
   * Pre-roll save handler (Overwatch).
   * If the hunter has Overwatch and an active mark, apply multi-d20 to saves
   * provoked by the marked target. ctx.saveSourceActorId is set by the
   * handleSaveRoll patch in vagabond-character-enhancer.mjs.
   */
  onPreRollSave(ctx) {
    if (!ctx.features?.hunter_overwatch) return;

    const mark = ctx.actor.getFlag(MODULE_ID, "hunterMark");
    if (!mark?.targetId) return;

    // Only apply if the save was provoked by the marked target
    if (ctx.saveSourceActorId !== mark.targetId) {
      log("Hunter", `Overwatch: save source ${ctx.saveSourceActorId ?? "unknown"} is not marked target ${mark.targetName} — skipping`);
      return;
    }

    const diceCount = ctx.features.hunter_lethalPrecision ? 3 : 2;
    _hunterMarkDice = diceCount;

    log("Hunter", `Overwatch: ${diceCount}d20kh on save for ${ctx.actor.name} (provoked by marked target ${mark.targetName})`);
  },

  /**
   * Apex Predator damage bypass.
   * Called from calculateFinalDamage dispatcher. Checks if the damage source
   * is a hunter with Apex Predator who has this target marked, and bypasses
   * armor/immune if so. ctx.damageSourceActorId identifies who dealt the damage.
   */
  onCalculateFinalDamage(ctx) {
    if (!ctx.damageSourceActorId) return;

    const hunter = game.actors.get(ctx.damageSourceActorId);
    if (!hunter || hunter.type !== "character") return;

    const features = hunter.getFlag(MODULE_ID, "features");
    if (!features?.hunter_apexPredator) return;

    const mark = hunter.getFlag(MODULE_ID, "hunterMark");
    if (mark?.targetId !== ctx.actor.id) return;

    // This hunter has Apex Predator and the target is marked — bypass Armor and Immune
    if (ctx.result !== ctx.damage) {
      log("Hunter", `Apex Predator: bypassed Armor/Immune on ${ctx.actor.name} — raw ${ctx.damage} replaces ${ctx.result} (${hunter.name}'s mark)`);
      ctx.result = ctx.damage;
    }
  },

  /* -------------------------------------------- */
  /*  Mark Management                              */
  /* -------------------------------------------- */

  /**
   * Prompt the player to apply Hunter's Mark to a new target.
   * Returns true if the player chooses to mark, false otherwise.
   */
  async _promptMarkTarget(hunter, targetActor, currentMark) {
    const switchWarning = currentMark?.targetId
      ? `<p style="color:#c87830; margin-top:0.25rem;"><i class="fas fa-exchange-alt"></i> This will switch your mark from <strong>${currentMark.targetName}</strong>.</p>`
      : "";

    const result = await foundry.applications.api.DialogV2.wait({
      window: { title: "Hunter's Mark" },
      content: `<p>Apply <strong>Hunter's Mark</strong> to <strong>${targetActor.name}</strong>?</p>
        <p style="font-size:0.85em; opacity:0.8;">This requires Focus. Attack rolls will use extra d20 (keep highest).</p>
        ${switchWarning}`,
      buttons: [
        { action: "mark", label: "Mark Target", icon: "fas fa-crosshairs" },
        { action: "skip", label: "Attack Without Mark", icon: "fas fa-times" }
      ],
      close: () => "skip"
    });

    if (result !== "mark") return false;

    await this._markTarget(hunter, targetActor);
    return true;
  },

  /**
   * Mark a target actor. Sets flag on the hunter, posts chat notification.
   */
  async _markTarget(hunter, targetActor) {
    // Clear existing mark if different
    const currentMark = hunter.getFlag(MODULE_ID, "hunterMark");
    if (currentMark?.targetId && currentMark.targetId !== targetActor.id) {
      log("Hunter", `Switching mark from ${currentMark.targetName} to ${targetActor.name}`);
    }

    await hunter.setFlag(MODULE_ID, "hunterMark", {
      targetId: targetActor.id,
      targetName: targetActor.name,
      targetImg: targetActor.img
    });

    // Stop existing mark FX on previous target
    if (currentMark?.targetId && currentMark.targetId !== targetActor.id) {
      FocusManager.stopFeatureFX(currentMark.targetId, "hunter_huntersMark");
    }

    // Acquire feature focus (only if not already focusing this feature)
    if (!FocusManager.hasFeatureFocus(hunter, "hunter_huntersMark")) {
      const acquired = await FocusManager.acquireFeatureFocus(
        hunter, "hunter_huntersMark", "Hunter's Mark",
        "icons/skills/targeting/crosshair-pointed-orange.webp"
      );
      if (!acquired) {
        ui.notifications.warn(`${hunter.name} has no focus slots available — mark set but Focus not tracked.`);
      }
    }

    // Play mark FX on the target
    FocusManager.playFeatureFX(hunter, "hunter_huntersMark", targetActor);

    // Post mark notification
    ChatMessage.create({
      content: `<div class="vagabond-chat-card-v2" data-card-type="hunters-mark">
        <div class="card-body">
          <header class="card-header">
            <div class="header-icon">
              <img src="icons/skills/targeting/crosshair-pointed-orange.webp" alt="Hunter's Mark">
            </div>
            <div class="header-info">
              <h3 class="header-title">Hunter's Mark</h3>
              <div class="metadata-tags-row">
                <div class="meta-tag tag-skill"><i class="fas fa-crosshairs"></i><span>Focus</span></div>
                <span class="tag-separator">//</span>
                <div class="meta-tag tag-standard"><i class="fas fa-bullseye"></i><span>Marked: ${targetActor.name}</span></div>
              </div>
            </div>
          </header>
          <section class="content-body">
            <div class="card-description" style="text-align:center;">
              ${hunter.name} marks <strong>${targetActor.name}</strong>.<br>
              <em>Attacks roll extra d20 (keep highest). Requires Focus.</em>
            </div>
            <div class="card-buttons" style="margin-top:0.5rem; text-align:center;">
              <button data-action="vce-hunter-unmark" data-hunter-id="${hunter.id}" class="card-button">
                <i class="fas fa-times"></i> Release Mark
              </button>
            </div>
          </section>
        </div>
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor: hunter }),
    });

    log("Hunter", `Marked ${targetActor.name} (requires Focus) for ${hunter.name}`);
  },

  /**
   * Remove the mark from the hunter.
   */
  async _unmarkTarget(hunter) {
    const mark = hunter.getFlag(MODULE_ID, "hunterMark");
    if (!mark) return;

    // Stop mark FX on the target
    FocusManager.stopFeatureFX(mark.targetId, "hunter_huntersMark");

    await hunter.unsetFlag(MODULE_ID, "hunterMark");
    await FocusManager.releaseFeatureFocus(hunter, "hunter_huntersMark");

    ChatMessage.create({
      content: `<div class="vagabond-chat-card-v2" data-card-type="hunters-mark-end">
        <div class="card-body">
          <section class="content-body">
            <div class="card-description" style="text-align:center;">
              <i class="fas fa-crosshairs" style="opacity:0.5"></i>
              ${hunter.name} releases Hunter's Mark on <strong>${mark.targetName}</strong>.
            </div>
          </section>
        </div>
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor: hunter }),
    });

    log("Hunter", `Unmarked ${mark.targetName} for ${hunter.name}`);
  },

  /* -------------------------------------------- */
  /*  Chat Button Handlers                         */
  /* -------------------------------------------- */

  /**
   * "Mark Target" button click from chat card.
   * Marks the user's currently targeted token.
   */
  async _onMarkButtonClick(ev) {
    ev.preventDefault();
    const btn = ev.currentTarget;
    const hunterId = btn.dataset.hunterId;
    const hunter = game.actors.get(hunterId);
    if (!hunter) return;

    // Check ownership
    if (!hunter.isOwner) {
      ui.notifications.warn("You don't own this character.");
      return;
    }

    const targets = Array.from(game.user.targets);
    if (targets.length === 0) {
      ui.notifications.warn("Select a target token first.");
      return;
    }

    const targetActor = targets[0].actor;
    if (!targetActor) return;

    await this._markTarget(hunter, targetActor);
  },

  /**
   * "Release Mark" button click from chat card.
   */
  async _onUnmarkButtonClick(ev) {
    ev.preventDefault();
    const btn = ev.currentTarget;
    const hunterId = btn.dataset.hunterId;
    const hunter = game.actors.get(hunterId);
    if (!hunter) return;

    if (!hunter.isOwner) {
      ui.notifications.warn("You don't own this character.");
      return;
    }

    await this._unmarkTarget(hunter);
  },

  /* -------------------------------------------- */
  /*  Cleanup                                      */
  /* -------------------------------------------- */

  /**
   * Clean up all hunter marks on combat end.
   */
  async _cleanupAllMarks() {
    for (const actor of game.actors) {
      if (actor.type !== "character") continue;
      const features = actor.getFlag(MODULE_ID, "features");
      if (!features?.hunter_huntersMark) continue;
      const mark = actor.getFlag(MODULE_ID, "hunterMark");
      if (mark) {
        FocusManager.stopFeatureFX(mark.targetId, "hunter_huntersMark");
        await actor.unsetFlag(MODULE_ID, "hunterMark");
        await FocusManager.releaseFeatureFocus(actor, "hunter_huntersMark");
        log("Hunter", `Combat ended — cleared mark on ${mark.targetName} for ${actor.name}`);
      }
    }
  },

  /**
   * Post a "Mark Target" action card for manual marking (skip Move).
   * Called from the module API: game.vagabondCharacterEnhancer.hunterMark(actor)
   */
  async useMarkAction(hunter) {
    if (!hunter) return;
    const features = hunter.getFlag(MODULE_ID, "features");
    if (!features?.hunter_huntersMark) {
      ui.notifications.warn(`${hunter.name} doesn't have Hunter's Mark.`);
      return;
    }

    const currentMark = hunter.getFlag(MODULE_ID, "hunterMark");
    const markInfo = currentMark
      ? `Currently marking: <strong>${currentMark.targetName}</strong>`
      : "No active mark.";

    ChatMessage.create({
      content: `<div class="vagabond-chat-card-v2" data-card-type="hunters-mark-action">
        <div class="card-body">
          <header class="card-header">
            <div class="header-icon">
              <img src="icons/skills/targeting/crosshair-pointed-orange.webp" alt="Hunter's Mark">
            </div>
            <div class="header-info">
              <h3 class="header-title">Hunter's Mark</h3>
              <div class="metadata-tags-row">
                <div class="meta-tag tag-skill"><i class="fas fa-shoe-prints"></i><span>Skip Move</span></div>
                <span class="tag-separator">//</span>
                <div class="meta-tag tag-standard"><i class="fas fa-crosshairs"></i><span>Mark Target</span></div>
              </div>
            </div>
          </header>
          <section class="content-body">
            <div class="card-description" style="text-align:center;">
              ${markInfo}<br>
              <em>Select a target token, then click Mark.</em>
            </div>
            <div class="card-buttons" style="margin-top:0.5rem; text-align:center;">
              <button data-action="vce-hunter-mark" data-hunter-id="${hunter.id}" class="card-button">
                <i class="fas fa-crosshairs"></i> Mark Target
              </button>
              ${currentMark ? `<button data-action="vce-hunter-unmark" data-hunter-id="${hunter.id}" class="card-button">
                <i class="fas fa-times"></i> Release Mark
              </button>` : ""}
            </div>
          </section>
        </div>
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor: hunter }),
    });
  }
};
